import type {
    AgingBuckets,
    CurrencyExposure,
    ExceptionMovement,
    MatchRateDelta,
    PortfolioTrendsResult,
    RecurringPatternTrend,
    RunSeriesItem,
    TrendWindow,
} from './types';
import type { ExceptionType } from '../../generated/prisma';
import { formatMinorAmount } from './portfolio-intelligence.service';

export interface PortfolioTrendsDb {
    reconciliationRun: {
        findMany(args: any): Promise<any[]>;
    };
    reconciliationException: {
        findMany(args: any): Promise<any[]>;
    };
}

export interface PortfolioTrendsServiceDeps {
    db: PortfolioTrendsDb;
}

export class PortfolioTrendsService {
    private readonly db: PortfolioTrendsDb;

    constructor(deps: PortfolioTrendsServiceDeps) {
        this.db = deps.db;
    }

    async calculateTrends(
        merchantId: string,
        window: TrendWindow = '30d',
    ): Promise<PortfolioTrendsResult> {
        return this.getPortfolioTrends(merchantId, window);
    }

    async getPortfolioTrends(
        merchantId: string,
        window: TrendWindow = '30d',
    ): Promise<PortfolioTrendsResult> {
        const now = new Date();
        const days = window === '7d' ? 7 : window === '90d' ? 90 : 30;
        const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        const dataLimitations: string[] = [
            'All exposure calculations are strictly currency-separated using integer minor units.',
            'Metrics are derived solely from persisted reconciliation runs and exceptions within the selected window.',
        ];

        // 1. Fetch runs and exceptions in parallel with strict merchant isolation
        const [runs, exceptions] = await Promise.all([
            this.db.reconciliationRun.findMany({
                where: {
                    merchantId,
                    createdAt: { gte: windowStart },
                },
                orderBy: { createdAt: 'asc' },
                take: 100, // Safe bounded query
            }),
            this.db.reconciliationException.findMany({
                where: {
                    merchantId,
                    createdAt: { gte: windowStart },
                },
                include: {
                    providerTransaction: true,
                    merchantOrder: true,
                    reconciliationRun: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 1000, // Safe bounded query
            }),
        ]);

        // 2. Build run series and match rate trajectory
        const runSeries: RunSeriesItem[] = runs.map((run) => {
            const total = run.totalConsidered ?? 0;
            const matched = run.matchedCount ?? 0;
            const matchRate = total > 0 ? Number(((matched / total) * 100).toFixed(2)) : 0;

            return {
                id: run.id,
                createdAt: new Date(run.createdAt).toISOString(),
                windowStart: run.windowStart ? new Date(run.windowStart).toISOString() : new Date(run.createdAt).toISOString(),
                windowEnd: run.windowEnd ? new Date(run.windowEnd).toISOString() : new Date(run.createdAt).toISOString(),
                status: run.status,
                totalConsidered: total,
                matchedCount: matched,
                unmatchedCount: run.unmatchedCount ?? 0,
                ambiguousCount: run.ambiguousCount ?? 0,
                excludedCount: run.excludedCount ?? 0,
                matchRate,
            };
        });

        // 3. Compute match rate delta between adjacent runs
        let matchRateDelta: MatchRateDelta;
        if (runSeries.length >= 2) {
            const current = runSeries[runSeries.length - 1];
            const previous = runSeries[runSeries.length - 2];
            const delta = Number((current.matchRate - previous.matchRate).toFixed(2));
            const direction =
                delta > 0 ? 'improving' : delta < 0 ? 'worsening' : 'stable';

            matchRateDelta = {
                currentMatchRate: current.matchRate,
                previousMatchRate: previous.matchRate,
                delta,
                direction,
            };
        } else if (runSeries.length === 1) {
            matchRateDelta = {
                currentMatchRate: runSeries[0].matchRate,
                previousMatchRate: null,
                delta: null,
                direction: 'insufficient_history',
            };
            dataLimitations.push(
                'Only 1 reconciliation run recorded in this window; match rate delta requires at least 2 runs.',
            );
        } else {
            matchRateDelta = {
                currentMatchRate: null,
                previousMatchRate: null,
                delta: null,
                direction: 'insufficient_history',
            };
            dataLimitations.push(
                'No completed reconciliation runs found in the selected timeframe.',
            );
        }

        // 4. Exception movement & status breakdown
        const countsByStatus: Record<string, number> = {
            OPEN: 0,
            INVESTIGATING: 0,
            RESOLVED: 0,
            DISMISSED: 0,
        };
        const countsByType: Record<string, number> = {};

        let resolvedOutflowCount = 0;
        let newInflowCount = exceptions.length;

        // Group currency exposure
        const currencyMap = new Map<string, { totalMinor: bigint; count: number }>();

        const addCurrencyAmount = (curr: string, amount: bigint) => {
            const c = curr.toUpperCase();
            const existing = currencyMap.get(c) || { totalMinor: 0n, count: 0 };
            existing.totalMinor += amount;
            existing.count += 1;
            currencyMap.set(c, existing);
        };

        // Aging buckets setup
        const bucketCounts = {
            lessThan24h: { count: 0, currencyMap: new Map<string, bigint>() },
            oneToSevenDays: { count: 0, currencyMap: new Map<string, bigint>() },
            sevenToThirtyDays: { count: 0, currencyMap: new Map<string, bigint>() },
            moreThanThirtyDays: { count: 0, currencyMap: new Map<string, bigint>() },
        };

        let oldestUnresolvedItem: {
            id: string;
            ageDays: number;
            type: ExceptionType;
            currency: string;
            formattedExposure: string;
            createdAt: Date;
        } | null = null;

        // Recurring pattern tracking
        const patternMap = new Map<
            string,
            {
                groupKey: string;
                label: string;
                description: string;
                filterType: ExceptionType;
                runIds: Set<string>;
                currencyMap: Map<string, { totalMinor: bigint; count: number }>;
                count: number;
            }
        >();

        for (const ex of exceptions) {
            // Status counts
            if (ex.status in countsByStatus) {
                countsByStatus[ex.status] += 1;
            } else {
                countsByStatus[ex.status] = 1;
            }

            if (ex.status === 'RESOLVED' || ex.status === 'DISMISSED') {
                resolvedOutflowCount += 1;
            }

            // Type counts
            countsByType[ex.type] = (countsByType[ex.type] || 0) + 1;

            // Exposure calculation
            let amountMinor = 0n;
            let currency = 'USD';
            if (ex.providerTransaction) {
                amountMinor = ex.providerTransaction.amountMinor;
                currency = ex.providerTransaction.currency || 'USD';
            } else if (ex.merchantOrder) {
                amountMinor = ex.merchantOrder.amountMinor;
                currency = ex.merchantOrder.currency || 'USD';
            }

            addCurrencyAmount(currency, amountMinor);

            // Aging categorization for unresolved records
            const isUnresolved = ex.status === 'OPEN' || ex.status === 'INVESTIGATING';
            if (isUnresolved) {
                const exCreatedAt = new Date(ex.createdAt);
                const ageMs = Math.max(0, now.getTime() - exCreatedAt.getTime());
                const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

                let targetBucket: { count: number; currencyMap: Map<string, bigint> };
                if (ageDays < 1) {
                    targetBucket = bucketCounts.lessThan24h;
                } else if (ageDays <= 7) {
                    targetBucket = bucketCounts.oneToSevenDays;
                } else if (ageDays <= 30) {
                    targetBucket = bucketCounts.sevenToThirtyDays;
                } else {
                    targetBucket = bucketCounts.moreThanThirtyDays;
                }

                targetBucket.count += 1;
                const prevBucketMinor = targetBucket.currencyMap.get(currency) || 0n;
                targetBucket.currencyMap.set(currency, prevBucketMinor + amountMinor);

                if (!oldestUnresolvedItem || exCreatedAt < oldestUnresolvedItem.createdAt) {
                    oldestUnresolvedItem = {
                        id: ex.id,
                        ageDays,
                        type: ex.type,
                        currency,
                        formattedExposure: formatMinorAmount(amountMinor, currency),
                        createdAt: exCreatedAt,
                    };
                }
            }

            // Recurring pattern accumulation
            const patternKey = ex.type;
            let pattern = patternMap.get(patternKey);
            if (!pattern) {
                pattern = {
                    groupKey: patternKey,
                    label: formatPatternLabel(ex.type),
                    description: formatPatternDescription(ex.type),
                    filterType: ex.type,
                    runIds: new Set<string>(),
                    currencyMap: new Map(),
                    count: 0,
                };
                patternMap.set(patternKey, pattern);
            }

            pattern.count += 1;
            if (ex.reconciliationRunId) {
                pattern.runIds.add(ex.reconciliationRunId);
            }
            const pCurr = pattern.currencyMap.get(currency) || { totalMinor: 0n, count: 0 };
            pCurr.totalMinor += amountMinor;
            pCurr.count += 1;
            pattern.currencyMap.set(currency, pCurr);
        }

        const exceptionMovement: ExceptionMovement = {
            newInflowCount,
            resolvedOutflowCount,
            netChange: newInflowCount - resolvedOutflowCount,
            countsByStatus,
            countsByType,
        };

        // Format total exposure by currency
        const exposureByCurrency: Record<string, CurrencyExposure> = {};
        for (const [curr, { totalMinor, count }] of currencyMap.entries()) {
            exposureByCurrency[curr] = {
                currency: curr,
                amountMinor: totalMinor.toString(),
                formatted: formatMinorAmount(totalMinor, curr),
                count,
            };
        }

        // Format aging buckets
        const buildAgingBucketItem = (bucket: { count: number; currencyMap: Map<string, bigint> }) => {
            const expRecord: Record<string, CurrencyExposure> = {};
            for (const [curr, amountMinor] of bucket.currencyMap.entries()) {
                expRecord[curr] = {
                    currency: curr,
                    amountMinor: amountMinor.toString(),
                    formatted: formatMinorAmount(amountMinor, curr),
                    count: bucket.count,
                };
            }
            return {
                count: bucket.count,
                exposureByCurrency: expRecord,
            };
        };

        const agingBuckets: AgingBuckets = {
            lessThan24h: buildAgingBucketItem(bucketCounts.lessThan24h),
            oneToSevenDays: buildAgingBucketItem(bucketCounts.oneToSevenDays),
            sevenToThirtyDays: buildAgingBucketItem(bucketCounts.sevenToThirtyDays),
            moreThanThirtyDays: buildAgingBucketItem(bucketCounts.moreThanThirtyDays),
            oldestUnresolved: oldestUnresolvedItem
                ? {
                      id: oldestUnresolvedItem.id,
                      ageDays: oldestUnresolvedItem.ageDays,
                      type: oldestUnresolvedItem.type,
                      currency: oldestUnresolvedItem.currency,
                      formattedExposure: oldestUnresolvedItem.formattedExposure,
                  }
                : null,
        };

        // Recurring patterns with evidence-grounded status
        const recurringPatterns: RecurringPatternTrend[] = Array.from(patternMap.values()).map(
            (p) => {
                const status: 'NEW' | 'RECURRING' | 'IMPROVING' | 'WORSENING' =
                    p.runIds.size > 1 ? 'RECURRING' : 'NEW';

                const pExposure: Record<string, CurrencyExposure> = {};
                for (const [curr, { totalMinor, count }] of p.currencyMap.entries()) {
                    pExposure[curr] = {
                        currency: curr,
                        amountMinor: totalMinor.toString(),
                        formatted: formatMinorAmount(totalMinor, curr),
                        count,
                    };
                }

                return {
                    groupKey: p.groupKey,
                    label: p.label,
                    description: p.description,
                    filterType: p.filterType,
                    recurrenceCount: p.count,
                    status,
                    exposureByCurrency: pExposure,
                };
            },
        );

        return {
            merchantId,
            window,
            generatedAt: now.toISOString(),
            runSeries,
            matchRateDelta,
            exceptionMovement,
            exposureByCurrency,
            recurringPatterns,
            agingBuckets,
            dataLimitations,
        };
    }
}

function formatPatternLabel(type: ExceptionType): string {
    switch (type) {
        case 'MISSING_PROVIDER_COUNTERPART':
            return 'Missing Provider Transactions';
        case 'MISSING_MERCHANT_COUNTERPART':
            return 'Orphaned Gateway Payments';
        case 'AMOUNT_MISMATCH':
            return 'Amount Discrepancies';
        case 'STATUS_DISCREPANCY':
            return 'Lifecycle State Mismatches';
        case 'AMBIGUOUS_MATCH':
            return 'Ambiguous Multi-Candidate Matches';
        default:
            return String(type);
    }
}

function formatPatternDescription(type: ExceptionType): string {
    switch (type) {
        case 'MISSING_PROVIDER_COUNTERPART':
            return 'Internal merchant orders that lack matching settled provider transactions.';
        case 'MISSING_MERCHANT_COUNTERPART':
            return 'Captured gateway funds lacking corresponding internal merchant order records.';
        case 'AMOUNT_MISMATCH':
            return 'Matching transaction and order pairs where gross currency amounts diverge.';
        case 'STATUS_DISCREPANCY':
            return 'Recorded order state conflicts with the gateway transaction terminal state.';
        case 'AMBIGUOUS_MATCH':
            return 'Multiple transaction candidates qualify under deterministic match rules.';
        default:
            return 'Reconciliation discrepancy pattern.';
    }
}
