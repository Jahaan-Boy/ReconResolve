import { createHash } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma';
import { sanitizeErrorMessage } from '../outbox/error-sanitizer';

export type TrendWindowPreset = '7d' | '30d' | '90d';

export interface PortfolioTrendsWindow {
    preset: TrendWindowPreset;
    windowStart: string;
    windowEnd: string;
}

export interface RunTrendDataPoint {
    runId: string;
    createdAt: string;
    status: string;
    rulesetVersion: string;
    totalConsidered: number;
    eligibleCount: number;
    matchedCount: number;
    unmatchedCount: number;
    ambiguousCount: number;
    excludedCount: number;
    matchRatePercentage: number | null;
}

export interface IncompleteRunSummary {
    runId: string;
    status: string;
    createdAt: string;
    failureReason: string | null;
}

export interface LifecycleFlowSummary {
    inflowCount: number;
    outflowCount: number;
    resolvedCount: number;
    dismissedCount: number;
    reopenedCount: number;
    netActiveDelta: number;
}

export interface RecurringPatternCohort {
    fingerprint: string;
    type: string;
    reasonCode: string;
    currency: string;
    count: number;
    totalAmountMinor: string;
}

export interface CurrencyExposure {
    currency: string;
    totalAmountMinor: string;
    count: number;
    decimalPlaces: number;
}

export interface PortfolioTrendsResult {
    merchantId: string;
    generatedAt: string;
    status: 'READY' | 'INSUFFICIENT_HISTORY' | 'UNAVAILABLE';
    insufficientReason?: string;
    window: PortfolioTrendsWindow;
    totalRunsConsidered: number;
    completedRunsCount: number;
    incompleteRuns: IncompleteRunSummary[];
    trendPoints: RunTrendDataPoint[];
    lifecycleFlow: LifecycleFlowSummary;
    recurringPatterns: RecurringPatternCohort[];
    currencyExposures: Record<string, CurrencyExposure>;
}

const CURRENCY_DECIMALS: Record<string, number> = {
    USD: 2,
    EUR: 2,
    GBP: 2,
    CAD: 2,
    AUD: 2,
    JPY: 0,
    KRW: 0,
    BHD: 3,
    KWD: 3,
};

export class PortfolioTrendsService {
    private readonly db: any;

    constructor(db: any) {
        this.db = db;
    }

    calculateWindowBounds(
        preset: TrendWindowPreset = '7d',
        anchorDate: Date = new Date(),
    ): { start: Date; end: Date } {
        const end = new Date(anchorDate.getTime());
        const days = preset === '90d' ? 90 : preset === '30d' ? 30 : 7;
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        return { start, end };
    }

    calculateMatchRate(
        matchedCount: number,
        totalConsidered: number,
        excludedCount: number,
    ): { eligible: number; rate: number | null } {
        const eligible = Math.max(0, totalConsidered - excludedCount);
        if (eligible <= 0) {
            return { eligible: 0, rate: null };
        }
        const rate = (matchedCount / eligible) * 100;
        return { eligible, rate: Math.round(rate * 100) / 100 };
    }

    generateFingerprint(type: string, reasonCode: string, currency: string): string {
        const raw = `${type.trim()}::${reasonCode.trim().toUpperCase()}::${currency.trim().toUpperCase()}`;
        return createHash('sha256').update(raw).digest('hex').slice(0, 16);
    }

    async getPortfolioTrends(
        merchantId: string,
        preset: TrendWindowPreset = '7d',
        anchorDate: Date = new Date(),
    ): Promise<PortfolioTrendsResult> {
        const { start, end } = this.calculateWindowBounds(preset, anchorDate);
        const nowIso = anchorDate.toISOString();
        const windowMeta: PortfolioTrendsWindow = {
            preset,
            windowStart: start.toISOString(),
            windowEnd: end.toISOString(),
        };

        try {
            // 1. Fetch runs in window
            const runs = await this.db.reconciliationRun.findMany({
                where: {
                    merchantId,
                    createdAt: { gte: start, lte: end },
                },
                orderBy: [
                    { createdAt: 'asc' },
                    { id: 'asc' }, // deterministic tie-breaker
                ],
            });

            const completedRuns = runs.filter((r: any) => r.status === 'COMPLETED');
            const incompleteRuns: IncompleteRunSummary[] = runs
                .filter((r: any) => r.status !== 'COMPLETED')
                .map((r: any) => ({
                    runId: r.id,
                    status: r.status,
                    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
                    failureReason: r.failureReason || null,
                }));

            // 2. Check Insufficient History rule (requires at least 2 completed runs)
            if (completedRuns.length < 2) {
                return {
                    merchantId,
                    generatedAt: nowIso,
                    status: 'INSUFFICIENT_HISTORY',
                    insufficientReason:
                        completedRuns.length === 0
                            ? 'No completed reconciliation runs found in the selected window.'
                            : 'At least two completed reconciliation runs are required to compute outcome trajectories. Single-run trends are not manufactured.',
                    window: windowMeta,
                    totalRunsConsidered: runs.length,
                    completedRunsCount: completedRuns.length,
                    incompleteRuns,
                    trendPoints: [],
                    lifecycleFlow: {
                        inflowCount: 0,
                        outflowCount: 0,
                        resolvedCount: 0,
                        dismissedCount: 0,
                        reopenedCount: 0,
                        netActiveDelta: 0,
                    },
                    recurringPatterns: [],
                    currencyExposures: {},
                };
            }

            // Build completed run trend data points
            const trendPoints: RunTrendDataPoint[] = completedRuns.map((r: any) => {
                const { eligible, rate } = this.calculateMatchRate(
                    r.matchedCount,
                    r.totalConsidered,
                    r.excludedCount,
                );
                return {
                    runId: r.id,
                    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
                    status: r.status,
                    rulesetVersion: r.rulesetVersion,
                    totalConsidered: r.totalConsidered,
                    eligibleCount: eligible,
                    matchedCount: r.matchedCount,
                    unmatchedCount: r.unmatchedCount,
                    ambiguousCount: r.ambiguousCount,
                    excludedCount: r.excludedCount,
                    matchRatePercentage: rate,
                };
            });

            // 3. Exception Lifecycle Inflow / Outflow & Audit Analysis
            const exceptionsInWindow = await this.db.reconciliationException.findMany({
                where: {
                    merchantId,
                    createdAt: { gte: start, lte: end },
                },
                include: {
                    providerTransaction: true,
                    merchantOrder: true,
                },
            });

            const auditEventsInWindow = this.db.exceptionAuditEvent?.findMany
                ? await this.db.exceptionAuditEvent.findMany({
                      where: {
                          merchantId,
                          createdAt: { gte: start, lte: end },
                      },
                  })
                : [];

            let resolvedCount = 0;
            let dismissedCount = 0;
            let reopenedCount = 0;

            for (const ev of auditEventsInWindow) {
                if (ev.toStatus === 'RESOLVED') resolvedCount += 1;
                else if (ev.toStatus === 'DISMISSED') dismissedCount += 1;
                else if (ev.toStatus === 'OPEN' && ev.fromStatus !== 'OPEN') reopenedCount += 1;
            }

            const inflowCount = exceptionsInWindow.length;
            const outflowCount = resolvedCount + dismissedCount;
            const netActiveDelta = inflowCount - outflowCount + reopenedCount;

            const lifecycleFlow: LifecycleFlowSummary = {
                inflowCount,
                outflowCount,
                resolvedCount,
                dismissedCount,
                reopenedCount,
                netActiveDelta,
            };

            // 4. Recurring Patterns Fingerprinting
            const patternBuckets = new Map<
                string,
                { type: string; reasonCode: string; currency: string; count: number; totalMinor: bigint }
            >();

            for (const exc of exceptionsInWindow) {
                const details = exc.details || {};
                const reasonCode = details.code || details.reason || details.discrepancyType || 'STANDARD';
                const currency = exc.providerTransaction?.currency || exc.merchantOrder?.currency || 'USD';
                const amount = exc.providerTransaction?.amountMinor || exc.merchantOrder?.amountMinor || 0n;

                const fp = this.generateFingerprint(exc.type, reasonCode, currency);
                const existing = patternBuckets.get(fp);
                if (existing) {
                    existing.count += 1;
                    existing.totalMinor += BigInt(amount);
                } else {
                    patternBuckets.set(fp, {
                        type: exc.type,
                        reasonCode,
                        currency,
                        count: 1,
                        totalMinor: BigInt(amount),
                    });
                }
            }

            const recurringPatterns: RecurringPatternCohort[] = Array.from(patternBuckets.entries())
                .map(([fp, data]) => ({
                    fingerprint: fp,
                    type: data.type,
                    reasonCode: data.reasonCode,
                    currency: data.currency,
                    count: data.count,
                    totalAmountMinor: data.totalMinor.toString(),
                }))
                .sort((a, b) => b.count - a.count);

            // 5. Exposure Grouped by ISO Currency (Open Exceptions)
            const openExceptions = await this.db.reconciliationException.findMany({
                where: {
                    merchantId,
                    status: 'OPEN',
                },
                include: {
                    providerTransaction: true,
                    merchantOrder: true,
                },
            });

            const currencyMap = new Map<string, { totalMinor: bigint; count: number }>();
            for (const exc of openExceptions) {
                const currency = (
                    exc.providerTransaction?.currency ||
                    exc.merchantOrder?.currency ||
                    'USD'
                ).toUpperCase();
                const amount = exc.providerTransaction?.amountMinor || exc.merchantOrder?.amountMinor || 0n;

                const curr = currencyMap.get(currency) ?? { totalMinor: 0n, count: 0 };
                curr.totalMinor += BigInt(amount);
                curr.count += 1;
                currencyMap.set(currency, curr);
            }

            const currencyExposures: Record<string, CurrencyExposure> = {};
            for (const [currCode, val] of currencyMap.entries()) {
                currencyExposures[currCode] = {
                    currency: currCode,
                    totalAmountMinor: val.totalMinor.toString(),
                    count: val.count,
                    decimalPlaces: CURRENCY_DECIMALS[currCode] ?? 2,
                };
            }

            return {
                merchantId,
                generatedAt: nowIso,
                status: 'READY',
                window: windowMeta,
                totalRunsConsidered: runs.length,
                completedRunsCount: completedRuns.length,
                incompleteRuns,
                trendPoints,
                lifecycleFlow,
                recurringPatterns,
                currencyExposures,
            };
        } catch (error) {
            console.error('[PortfolioTrendsService] Error:', sanitizeErrorMessage(error));
            return {
                merchantId,
                generatedAt: nowIso,
                status: 'UNAVAILABLE',
                insufficientReason: `Could not load portfolio trends: ${sanitizeErrorMessage(error)}`,
                window: windowMeta,
                totalRunsConsidered: 0,
                completedRunsCount: 0,
                incompleteRuns: [],
                trendPoints: [],
                lifecycleFlow: {
                    inflowCount: 0,
                    outflowCount: 0,
                    resolvedCount: 0,
                    dismissedCount: 0,
                    reopenedCount: 0,
                    netActiveDelta: 0,
                },
                recurringPatterns: [],
                currencyExposures: {},
            };
        }
    }
}

