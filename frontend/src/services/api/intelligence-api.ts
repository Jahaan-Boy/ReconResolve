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
    runId: string;
    startedAt: string;
    completedAt: string | null;
    totalConsidered: number;
    totalMatched: number;
    totalExceptions: number;
    matchRatePercentage: number;
    status: string;
}

export interface DailyRatePoint {
    date: string;
    matchRatePercentage: number;
    runCount: number;
    totalEvaluated: number;
    totalMatched: number;
    totalExceptions: number;
}

export interface CurrencyExposureMovement {
    currency: string;
    currentExposureMinor: string;
    previousExposureMinor: string;
    deltaMinor: string;
    direction: 'increasing' | 'decreasing' | 'stable';
    currentCount: number;
    previousCount: number;
}

export interface RecurringPatternTrend {
    patternKey: string;
    label: string;
    priority: OperationalPriority;
    currentWindowCount: number;
    previousWindowCount: number;
    velocityDelta: number;
    direction: 'worsening' | 'improving' | 'stable';
    firstSeenAt: string;
    lastSeenAt: string;
}

export interface AgingDistribution {
    lessThan24h: number;
    oneToThreeDays: number;
    fourToSevenDays: number;
    olderThanSevenDays: number;
}

export interface ResolutionVelocity {
    averageResolutionHours: number | null;
    openAverageAgeHours: number;
}

export interface PortfolioTrendsResult {
    merchantId: string;
    generatedAt: string;
    window: TrendWindow;
    trendStatus: 'sufficient' | 'insufficient';
    insufficientReason: string | null;
    runSeries: RunSeriesItem[];
    dailyMatchRatePoints: DailyRatePoint[];
    overallMatchRateChange: number | null;
    exposureMovements: Record<string, CurrencyExposureMovement>;
    recurringPatternTrends: RecurringPatternTrend[];
    agingDistribution: AgingDistribution;
    overallVelocity: ResolutionVelocity;
}

export interface IntelligenceApiClient {
    getPortfolioAnalysis(
        merchantId: string,
        window?: PortfolioWindow,
        signal?: AbortSignal,
    ): Promise<PortfolioIntelligenceResult>;
    getPortfolioSnapshot(
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
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/intelligence/portfolio?window=${encodeURIComponent(window)}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
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
                    : 'Failed to fetch portfolio intelligence',
                response.status,
                errorBody['details'],
            );
        }

        return await response.json();
    }

    async getPortfolioSnapshot(
        merchantId: string,
        window: PortfolioWindow = '30d',
        signal?: AbortSignal,
    ): Promise<PortfolioIntelligenceResult> {
        return this.getPortfolioAnalysis(merchantId, window, signal);
    }

    async getPortfolioTrends(
        merchantId: string,
        window: TrendWindow = '30d',
        signal?: AbortSignal,
    ): Promise<PortfolioTrendsResult> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/intelligence/trends?window=${encodeURIComponent(window)}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
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
                    : 'Failed to fetch portfolio trends',
                response.status,
                errorBody['details'],
            );
        }

        return await response.json();
    }
}

export const intelligenceApiClient: IntelligenceApiClient = new HttpIntelligenceApiClient();
