import type { ExceptionStatus, ExceptionType } from '../../generated/prisma';

export type PortfolioWindow = '24h' | '7d' | '30d' | 'all';

export type OperationalPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface CurrencyExposure {
    readonly currency: string;
    readonly amountMinor: string;
    readonly formatted: string;
    readonly count: number;
}

export interface PatternGroup {
    readonly groupKey: string;
    readonly label: string;
    readonly description: string;
    readonly exceptionCount: number;
    readonly priority: OperationalPriority;
    readonly exposureByCurrency: Record<string, CurrencyExposure>;
    readonly firstObservedAt: string | null;
    readonly lastObservedAt: string | null;
    readonly affectedRunCount: number;
    readonly sampleExceptionIds: string[];
    readonly aggregationBasis: string;
    readonly filterType?: ExceptionType;
}

export interface PrioritizedException {
    readonly exceptionId: string;
    readonly type: ExceptionType;
    readonly status: ExceptionStatus;
    readonly priority: OperationalPriority;
    readonly priorityScore: number;
    readonly priorityReasons: string[];
    readonly currency: string | null;
    readonly exposureAmountMinor: string | null;
    readonly formattedExposure: string | null;
    readonly exposureBasis: string;
    readonly createdAt: string;
    readonly reconciliationRunId: string | null;
    readonly merchantOrderId: string | null;
    readonly providerTransactionId: string | null;
    readonly detailsSummary: string;
}

export interface PortfolioIntelligenceResult {
    readonly merchantId: string;
    readonly generatedAt: string;
    readonly window: PortfolioWindow;
    readonly totalExceptionsCount: number;
    readonly unresolvedCount: number;
    readonly totalExposureByCurrency: Record<string, CurrencyExposure>;
    readonly patterns: PatternGroup[];
    readonly topPrioritizedExceptions: PrioritizedException[];
    readonly priorityFormulaVersion: string;
    readonly dataQualityNotes: string[];
}

export type TrendWindow = '7d' | '30d' | '90d';

export interface RunSeriesItem {
    readonly id: string;
    readonly createdAt: string;
    readonly windowStart: string;
    readonly windowEnd: string;
    readonly status: string;
    readonly totalConsidered: number;
    readonly matchedCount: number;
    readonly unmatchedCount: number;
    readonly ambiguousCount: number;
    readonly excludedCount: number;
    readonly matchRate: number;
}

export interface MatchRateDelta {
    readonly currentMatchRate: number | null;
    readonly previousMatchRate: number | null;
    readonly delta: number | null;
    readonly direction: 'improving' | 'worsening' | 'stable' | 'insufficient_history';
}

export interface ExceptionMovement {
    readonly newInflowCount: number;
    readonly resolvedOutflowCount: number;
    readonly netChange: number;
    readonly countsByStatus: Record<string, number>;
    readonly countsByType: Record<string, number>;
}

export interface RecurringPatternTrend {
    readonly groupKey: string;
    readonly label: string;
    readonly description: string;
    readonly filterType: ExceptionType;
    readonly recurrenceCount: number;
    readonly status: 'NEW' | 'RECURRING' | 'IMPROVING' | 'WORSENING';
    readonly exposureByCurrency: Record<string, CurrencyExposure>;
}

export interface AgingBucketItem {
    readonly count: number;
    readonly exposureByCurrency: Record<string, CurrencyExposure>;
}

export interface AgingBuckets {
    readonly lessThan24h: AgingBucketItem;
    readonly oneToSevenDays: AgingBucketItem;
    readonly sevenToThirtyDays: AgingBucketItem;
    readonly moreThanThirtyDays: AgingBucketItem;
    readonly oldestUnresolved: {
        readonly id: string;
        readonly ageDays: number;
        readonly type: ExceptionType;
        readonly currency: string;
        readonly formattedExposure: string;
    } | null;
}

export interface PortfolioTrendsResult {
    readonly merchantId: string;
    readonly window: TrendWindow;
    readonly generatedAt: string;
    readonly runSeries: RunSeriesItem[];
    readonly matchRateDelta: MatchRateDelta;
    readonly exceptionMovement: ExceptionMovement;
    readonly exposureByCurrency: Record<string, CurrencyExposure>;
    readonly recurringPatterns: RecurringPatternTrend[];
    readonly agingBuckets: AgingBuckets;
    readonly dataLimitations: string[];
}
