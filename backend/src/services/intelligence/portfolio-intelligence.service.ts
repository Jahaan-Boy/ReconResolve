import type {
    CurrencyExposure,
    OperationalPriority,
    PatternGroup,
    PortfolioIntelligenceResult,
    PortfolioWindow,
    PrioritizedException,
} from './types';
import type { ExceptionType } from '../../generated/prisma';

export interface PortfolioIntelligenceDb {
    reconciliationException: {
        findMany(args: any): Promise<any[]>;
    };
    reconciliationRun: {
        count(args: any): Promise<number>;
    };
}

export interface PortfolioIntelligenceServiceDeps {
    db: PortfolioIntelligenceDb;
}

export function formatMinorAmount(amountMinor: bigint, currency: string): string {
    const isNegative = amountMinor < 0n;
    const abs = isNegative ? -amountMinor : amountMinor;
    const major = abs / 100n;
    const minor = abs % 100n;
    const formattedNum = `${isNegative ? '-' : ''}${major.toString()}.${minor.toString().padStart(2, '0')}`;
    return `${currency.toUpperCase()} ${formattedNum}`;
}

export class PortfolioIntelligenceService {
    private readonly db: PortfolioIntelligenceDb;

    constructor(deps: PortfolioIntelligenceServiceDeps) {
        this.db = deps.db;
    }

    async getPortfolioAnalysis(
        merchantId: string,
        window: PortfolioWindow = '30d',
    ): Promise<PortfolioIntelligenceResult> {
        const now = new Date();
        let startDate: Date | undefined;

        if (window === '24h') {
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        } else if (window === '7d') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (window === '30d') {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const whereClause: any = { merchantId };
        if (startDate) {
            whereClause.createdAt = { gte: startDate };
        }

        // Fetch exceptions with related transaction, order, and run details
        const exceptions = await this.db.reconciliationException.findMany({
            where: whereClause,
            include: {
                providerTransaction: true,
                merchantOrder: true,
                reconciliationRun: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 500, // Safe bounded query
        });

        // Track currency totals
        const totalCurrencyMap = new Map<string, { totalMinor: bigint; count: number }>();
        let unresolvedCount = 0;

        // Group definitions
        const patternMap = new Map<
            string,
            {
                groupKey: string;
                label: string;
                description: string;
                filterType: ExceptionType;
                aggregationBasis: string;
                exceptions: any[];
                currencyMap: Map<string, { totalMinor: bigint; count: number }>;
                runIds: Set<string>;
                firstObserved: Date | null;
                lastObserved: Date | null;
            }
        >();

        const initializePattern = (
            key: string,
            label: string,
            description: string,
            filterType: ExceptionType,
            basis: string,
        ) => {
            if (!patternMap.has(key)) {
                patternMap.set(key, {
                    groupKey: key,
                    label,
                    description,
                    filterType,
                    aggregationBasis: basis,
                    exceptions: [],
                    currencyMap: new Map(),
                    runIds: new Set(),
                    firstObserved: null,
                    lastObserved: null,
                });
            }
            return patternMap.get(key)!;
        };

        initializePattern(
            'MISSING_MERCHANT_COUNTERPART',
            'Orphaned Gateway Captures',
            'Captured provider transactions where no corresponding internal merchant order exists.',
            'MISSING_MERCHANT_COUNTERPART',
            'Provider transaction gross amount',
        );

        initializePattern(
            'MISSING_PROVIDER_COUNTERPART',
            'Unsettled Internal Orders',
            'Orders marked paid or pending where no provider settlement was recorded.',
            'MISSING_PROVIDER_COUNTERPART',
            'Merchant order amount',
        );

        initializePattern(
            'AMOUNT_MISMATCH',
            'Settlement Amount Discrepancies',
            'Difference between order total and provider settled transaction amount.',
            'AMOUNT_MISMATCH',
            'Delta between provider gross and order amount',
        );

        initializePattern(
            'STATUS_DISCREPANCY',
            'Payment Lifecycle Conflicts',
            'State conflicts between merchant order and gateway (e.g. cancelled order with capture).',
            'STATUS_DISCREPANCY',
            'Provider transaction gross amount',
        );

        initializePattern(
            'AMBIGUOUS_MATCH',
            'Ambiguous Match Candidates',
            'Multiple potential matching candidates detected during automated reconciliation.',
            'AMBIGUOUS_MATCH',
            'Provider transaction gross amount',
        );

        const prioritizedExceptions: PrioritizedException[] = [];

        for (const ex of exceptions) {
            if (ex.status === 'OPEN' || ex.status === 'INVESTIGATING') {
                unresolvedCount++;
            }

            // Determine exposure and currency
            let exposureMinor = 0n;
            let currency: string | null = null;
            let basis = 'No financial record attached';

            if (ex.type === 'MISSING_MERCHANT_COUNTERPART' && ex.providerTransaction) {
                exposureMinor = BigInt(ex.providerTransaction.amountMinor);
                currency = ex.providerTransaction.currency;
                basis = 'Provider transaction gross';
            } else if (ex.type === 'MISSING_PROVIDER_COUNTERPART' && ex.merchantOrder) {
                exposureMinor = BigInt(ex.merchantOrder.amountMinor);
                currency = ex.merchantOrder.currency;
                basis = 'Merchant order amount';
            } else if (ex.type === 'AMOUNT_MISMATCH') {
                if (ex.providerTransaction && ex.merchantOrder) {
                    const diff = BigInt(ex.providerTransaction.amountMinor) - BigInt(ex.merchantOrder.amountMinor);
                    exposureMinor = diff < 0n ? -diff : diff;
                    currency = ex.providerTransaction.currency;
                    basis = 'Absolute delta between order and payment';
                } else if (ex.providerTransaction) {
                    exposureMinor = BigInt(ex.providerTransaction.amountMinor);
                    currency = ex.providerTransaction.currency;
                    basis = 'Provider transaction gross';
                }
            } else if (ex.type === 'STATUS_DISCREPANCY') {
                if (ex.providerTransaction) {
                    exposureMinor = BigInt(ex.providerTransaction.amountMinor);
                    currency = ex.providerTransaction.currency;
                    basis = 'Provider transaction gross';
                } else if (ex.merchantOrder) {
                    exposureMinor = BigInt(ex.merchantOrder.amountMinor);
                    currency = ex.merchantOrder.currency;
                    basis = 'Merchant order amount';
                }
            } else if (ex.type === 'AMBIGUOUS_MATCH') {
                if (ex.providerTransaction) {
                    exposureMinor = BigInt(ex.providerTransaction.amountMinor);
                    currency = ex.providerTransaction.currency;
                    basis = 'Provider transaction gross';
                }
            }

            // Accumulate currency totals
            if (currency && exposureMinor > 0n) {
                const normCurr = currency.toUpperCase();
                const existingTotal = totalCurrencyMap.get(normCurr) || { totalMinor: 0n, count: 0 };
                totalCurrencyMap.set(normCurr, {
                    totalMinor: existingTotal.totalMinor + exposureMinor,
                    count: existingTotal.count + 1,
                });
            }

            // Route to pattern group
            const pattern = patternMap.get(ex.type);
            if (pattern) {
                pattern.exceptions.push(ex);
                if (ex.reconciliationRunId) {
                    pattern.runIds.add(ex.reconciliationRunId);
                }

                const exDate = new Date(ex.createdAt);
                if (!pattern.firstObserved || exDate < pattern.firstObserved) {
                    pattern.firstObserved = exDate;
                }
                if (!pattern.lastObserved || exDate > pattern.lastObserved) {
                    pattern.lastObserved = exDate;
                }

                if (currency && exposureMinor > 0n) {
                    const normCurr = currency.toUpperCase();
                    const existingGroupCurr = pattern.currencyMap.get(normCurr) || { totalMinor: 0n, count: 0 };
                    pattern.currencyMap.set(normCurr, {
                        totalMinor: existingGroupCurr.totalMinor + exposureMinor,
                        count: existingGroupCurr.count + 1,
                    });
                }
            }

            // Calculate Operational Priority
            const { priority, score, reasons } = this.calculatePriority(ex, exposureMinor, now);

            prioritizedExceptions.push({
                exceptionId: ex.id,
                type: ex.type,
                status: ex.status,
                priority,
                priorityScore: score,
                priorityReasons: reasons,
                currency,
                exposureAmountMinor: exposureMinor > 0n ? exposureMinor.toString() : null,
                formattedExposure: currency && exposureMinor > 0n ? formatMinorAmount(exposureMinor, currency) : null,
                exposureBasis: basis,
                createdAt: ex.createdAt instanceof Date ? ex.createdAt.toISOString() : new Date(ex.createdAt).toISOString(),
                reconciliationRunId: ex.reconciliationRunId || null,
                merchantOrderId: ex.merchantOrderId || null,
                providerTransactionId: ex.providerTransactionId || null,
                detailsSummary: this.summarizeDetails(ex),
            });
        }

        // Sort prioritized exceptions by score descending
        prioritizedExceptions.sort((a, b) => b.priorityScore - a.priorityScore);

        // Format pattern groups
        const patternGroups: PatternGroup[] = Array.from(patternMap.values()).map((p) => {
            const exposureByCurrency: Record<string, CurrencyExposure> = {};
            for (const [curr, data] of p.currencyMap.entries()) {
                exposureByCurrency[curr] = {
                    currency: curr,
                    amountMinor: data.totalMinor.toString(),
                    formatted: formatMinorAmount(data.totalMinor, curr),
                    count: data.count,
                };
            }

            // Determine pattern group priority based on items
            let highestPriority: OperationalPriority = 'LOW';
            if (p.exceptions.some((e) => e.status === 'OPEN' && p.currencyMap.size > 0)) {
                if (p.groupKey === 'AMBIGUOUS_MATCH' || p.exceptions.length >= 10) {
                    highestPriority = 'CRITICAL';
                } else if (p.exceptions.length >= 5 || p.groupKey === 'STATUS_DISCREPANCY') {
                    highestPriority = 'HIGH';
                } else {
                    highestPriority = 'MEDIUM';
                }
            }

            return {
                groupKey: p.groupKey,
                label: p.label,
                description: p.description,
                exceptionCount: p.exceptions.length,
                priority: highestPriority,
                exposureByCurrency,
                firstObservedAt: p.firstObserved ? p.firstObserved.toISOString() : null,
                lastObservedAt: p.lastObserved ? p.lastObserved.toISOString() : null,
                affectedRunCount: p.runIds.size,
                sampleExceptionIds: p.exceptions.slice(0, 3).map((e) => e.id),
                aggregationBasis: p.aggregationBasis,
                filterType: p.filterType,
            };
        });

        // Format total exposure
        const totalExposureByCurrency: Record<string, CurrencyExposure> = {};
        for (const [curr, data] of totalCurrencyMap.entries()) {
            totalExposureByCurrency[curr] = {
                currency: curr,
                amountMinor: data.totalMinor.toString(),
                formatted: formatMinorAmount(data.totalMinor, curr),
                count: data.count,
            };
        }

        return {
            merchantId,
            generatedAt: now.toISOString(),
            window,
            totalExceptionsCount: exceptions.length,
            unresolvedCount,
            totalExposureByCurrency,
            patterns: patternGroups,
            topPrioritizedExceptions: prioritizedExceptions.slice(0, 25),
            priorityFormulaVersion: 'v1.0 (Exposure Cohort + Age Aging + Discrepancy Severity)',
            dataQualityNotes: [
                'Currency amounts are grouped strictly by ISO currency code to prevent cross-currency summation.',
                'Exposure calculations use deduplicated transaction gross or order amounts depending on exception counterpart.',
                'Operational priority score combines financial threshold, unresolved duration, and matching ambiguity.',
            ],
        };
    }

    private calculatePriority(
        exception: any,
        exposureMinor: bigint,
        now: Date,
    ): { priority: OperationalPriority; score: number; reasons: string[] } {
        const reasons: string[] = [];
        let score = 0;

        const ageMs = now.getTime() - new Date(exception.createdAt).getTime();
        const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

        // 1. Status Factor
        if (exception.status === 'RESOLVED' || exception.status === 'DISMISSED') {
            return {
                priority: 'LOW',
                score: 5,
                reasons: [`Exception already marked as ${exception.status}`],
            };
        }

        if (exception.status === 'OPEN') {
            score += 20;
            reasons.push('Unresolved and pending review');
        } else if (exception.status === 'INVESTIGATING') {
            score += 15;
            reasons.push('Actively under operator investigation');
        }

        // 2. Financial Exposure Factor (Minor units, 100 minor = 1.00)
        if (exposureMinor >= 50000n) {
            // >= 500.00
            score += 45;
            reasons.push('High financial exposure (≥ 500.00)');
        } else if (exposureMinor >= 10000n) {
            // >= 100.00
            score += 30;
            reasons.push('Material financial exposure (≥ 100.00)');
        } else if (exposureMinor > 0n) {
            score += 15;
            reasons.push('Discrepancy with financial impact');
        }

        // 3. Aging Factor
        if (ageHours >= 168) {
            // > 7 days
            score += 25;
            reasons.push(`Aged exception (> 7 days unresolved, ${Math.floor(ageHours / 24)}d old)`);
        } else if (ageHours >= 72) {
            // > 3 days
            score += 15;
            reasons.push(`Aged exception (> 3 days unresolved)`);
        } else if (ageHours >= 24) {
            score += 10;
            reasons.push('Open for > 24 hours');
        }

        // 4. Discrepancy Type Severity Factor
        if (exception.type === 'AMBIGUOUS_MATCH') {
            score += 20;
            reasons.push('Ambiguous candidate match requires manual operator reconciliation');
        } else if (exception.type === 'STATUS_DISCREPANCY') {
            score += 15;
            reasons.push('Lifecycle status conflict (risk of unfulfilled capture or unrefunded cancel)');
        } else if (exception.type === 'MISSING_MERCHANT_COUNTERPART') {
            score += 10;
            reasons.push('Orphaned captured payment without internal order record');
        }

        // Determine Band
        let priority: OperationalPriority = 'LOW';
        if (score >= 70) {
            priority = 'CRITICAL';
        } else if (score >= 50) {
            priority = 'HIGH';
        } else if (score >= 30) {
            priority = 'MEDIUM';
        }

        return { priority, score: Math.min(score, 100), reasons };
    }

    private summarizeDetails(exception: any): string {
        if (exception.type === 'MISSING_MERCHANT_COUNTERPART') {
            return exception.providerTransaction
                ? `Provider txn ${exception.providerTransaction.providerTxnId} captured with no order match`
                : 'Captured provider transaction missing merchant order';
        }
        if (exception.type === 'MISSING_PROVIDER_COUNTERPART') {
            return exception.merchantOrder
                ? `Merchant order ${exception.merchantOrder.externalOrderId} has no settled payment record`
                : 'Merchant order missing provider settlement counterpart';
        }
        if (exception.type === 'AMOUNT_MISMATCH') {
            return 'Settlement amount differs from merchant order record';
        }
        if (exception.type === 'STATUS_DISCREPANCY') {
            return 'Order status conflicts with provider transaction status';
        }
        if (exception.type === 'AMBIGUOUS_MATCH') {
            return 'Multiple provider transactions or orders matched same criteria';
        }
        return 'Reconciliation discrepancy requiring review';
    }
}
