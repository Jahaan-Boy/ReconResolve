import { ApiClientError } from './types';

export type PortfolioWindow = '24h' | '7d' | '30d' | 'all';
export type TrendWindow = '7d' | '30d' | '90d';
export type OperationalPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface CurrencyExposure {
    currency: string;
    amountMinor: string;
    formatted: string;
    count: number;
}

export interface PatternGroup {
    groupKey: string;
    label: string;
    description: string;
    exceptionCount: number;
    priority: OperationalPriority;
    exposureByCurrency: Record<string, CurrencyExposure>;
    firstObservedAt: string | null;
    lastObservedAt: string | null;
    affectedRunCount: number;
    sampleExceptionIds: string[];
    aggregationBasis: string;
    filterType?: string;
}

export interface PrioritizedException {
    exceptionId: string;
    type: string;
    status: string;
    priority: OperationalPriority;
    priorityScore: number;
    priorityReasons: string[];
    currency: string | null;
    exposureAmountMinor: string | null;
    formattedExposure: string | null;
    exposureBasis: string;
    createdAt: string;
    reconciliationRunId: string | null;
    merchantOrderId: string | null;
    providerTransactionId: string | null;
    detailsSummary: string;
}

export interface PortfolioIntelligenceResult {
    merchantId: string;
    generatedAt: string;
    window: PortfolioWindow;
    totalExceptionsCount: number;
    unresolvedCount: number;
    totalExposureByCurrency: Record<string, CurrencyExposure>;
    patterns: PatternGroup[];
    topPrioritizedExceptions: PrioritizedException[];
    priorityFormulaVersion: string;
    dataQualityNotes: string[];
}

export interface RunSeriesItem {
    id: string;
    createdAt: string;
    windowStart: string;
    windowEnd: string;
    status: string;
    totalConsidered: number;
    matchedCount: number;
    unmatchedCount: number;
    ambiguousCount: number;
    excludedCount: number;
    matchRate: number;
}

export interface MatchRateDelta {
    currentMatchRate: number | null;
    previousMatchRate: number | null;
    delta: number | null;
    direction: 'improving' | 'worsening' | 'stable' | 'insufficient_history';
}

export interface ExceptionMovement {
    newInflowCount: number;
    resolvedOutflowCount: number;
    netChange: number;
    countsByStatus: Record<string, number>;
    countsByType: Record<string, number>;
}

export interface RecurringPatternTrend {
    groupKey: string;
    label: string;
    description: string;
    filterType: string;
    recurrenceCount: number;
    status: 'NEW' | 'RECURRING' | 'IMPROVING' | 'WORSENING';
    exposureByCurrency: Record<string, CurrencyExposure>;
}

export interface AgingBucketItem {
    count: number;
    exposureByCurrency: Record<string, CurrencyExposure>;
}

export interface AgingBuckets {
    lessThan24h: AgingBucketItem;
    oneToSevenDays: AgingBucketItem;
    sevenToThirtyDays: AgingBucketItem;
    moreThanThirtyDays: AgingBucketItem;
    oldestUnresolved: {
        id: string;
        ageDays: number;
        type: string;
        currency: string;
        formattedExposure: string;
    } | null;
}

export interface PortfolioTrendsResult {
    merchantId: string;
    window: TrendWindow;
    generatedAt: string;
    runSeries: RunSeriesItem[];
    matchRateDelta: MatchRateDelta;
    exceptionMovement: ExceptionMovement;
    exposureByCurrency: Record<string, CurrencyExposure>;
    recurringPatterns: RecurringPatternTrend[];
    agingBuckets: AgingBuckets;
    dataLimitations: string[];
}

export interface IntelligenceApiClient {
    getPortfolioAnalysis(
        merchantId: string,
        window?: PortfolioWindow,
        signal?: AbortSignal,
    ): Promise<PortfolioIntelligenceResult>;
    getPortfolioTrends(
        merchantId: string,
        window?: TrendWindow,
        signal?: AbortSignal,
    ): Promise<PortfolioTrendsResult>;
}

export class HttpIntelligenceApiClient implements IntelligenceApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    async getPortfolioAnalysis(
        merchantId: string,
        window: PortfolioWindow = '30d',
        signal?: AbortSignal,
    ): Promise<PortfolioIntelligenceResult> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/intelligence/portfolio?window=${window}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal,
            },
        );

        if (!response.ok) {
            let errorBody: Record<string, unknown> = {};
            try {
                errorBody = (await response.json()) as Record<string, unknown>;
            } catch {
                // non-json
            }
            throw new ApiClientError(
                typeof errorBody['error'] === 'string' ? errorBody['error'] : 'INTELLIGENCE_ERROR',
                typeof errorBody['message'] === 'string'
                    ? errorBody['message']
                    : 'Failed to fetch portfolio intelligence analysis',
                response.status,
                errorBody['details'],
            );
        }

        return await response.json();
    }

    async getPortfolioTrends(
        merchantId: string,
        window: TrendWindow = '30d',
        signal?: AbortSignal,
    ): Promise<PortfolioTrendsResult> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/intelligence/trends?window=${window}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal,
            },
        );

        if (!response.ok) {
            let errorBody: Record<string, unknown> = {};
            try {
                errorBody = (await response.json()) as Record<string, unknown>;
            } catch {
                // non-json
            }
            throw new ApiClientError(
                typeof errorBody['error'] === 'string' ? errorBody['error'] : 'INTELLIGENCE_ERROR',
                typeof errorBody['message'] === 'string'
                    ? errorBody['message']
                    : 'Failed to fetch portfolio trends analysis',
                response.status,
                errorBody['details'],
            );
        }

        return await response.json();
    }
}

export const intelligenceApiClient = new HttpIntelligenceApiClient();
