import { ApiClientError } from './types';

export type PortfolioWindow = '24h' | '7d' | '30d' | 'all';
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

export interface IntelligenceApiClient {
    getPortfolioAnalysis(
        merchantId: string,
        window?: PortfolioWindow,
        signal?: AbortSignal,
    ): Promise<PortfolioIntelligenceResult>;
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
}

export class MockIntelligenceApiClient implements IntelligenceApiClient {
    async getPortfolioAnalysis(
        merchantId: string,
        window: PortfolioWindow = '30d',
    ): Promise<PortfolioIntelligenceResult> {
        return {
            merchantId,
            generatedAt: new Date().toISOString(),
            window,
            totalExceptionsCount: 14,
            unresolvedCount: 9,
            totalExposureByCurrency: {
                USD: {
                    currency: 'USD',
                    amountMinor: '284500',
                    formatted: 'USD 2,845.00',
                    count: 7,
                },
                EUR: {
                    currency: 'EUR',
                    amountMinor: '94200',
                    formatted: 'EUR 942.00',
                    count: 2,
                },
            },
            patterns: [
                {
                    groupKey: 'MISSING_MERCHANT_COUNTERPART',
                    label: 'Orphaned Gateway Captures',
                    description: 'Captured provider transactions where no corresponding internal merchant order exists.',
                    exceptionCount: 4,
                    priority: 'HIGH',
                    exposureByCurrency: {
                        USD: { currency: 'USD', amountMinor: '185000', formatted: 'USD 1,850.00', count: 3 },
                        EUR: { currency: 'EUR', amountMinor: '45000', formatted: 'EUR 450.00', count: 1 },
                    },
                    firstObservedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
                    lastObservedAt: new Date().toISOString(),
                    affectedRunCount: 2,
                    sampleExceptionIds: ['ex-mock-001', 'ex-mock-002'],
                    aggregationBasis: 'Provider transaction gross',
                    filterType: 'MISSING_MERCHANT_COUNTERPART',
                },
                {
                    groupKey: 'AMOUNT_MISMATCH',
                    label: 'Settlement Amount Discrepancies',
                    description: 'Difference between order recorded total and provider settled transaction amount.',
                    exceptionCount: 3,
                    priority: 'MEDIUM',
                    exposureByCurrency: {
                        USD: { currency: 'USD', amountMinor: '49500', formatted: 'USD 495.00', count: 2 },
                        EUR: { currency: 'EUR', amountMinor: '49200', formatted: 'EUR 492.00', count: 1 },
                    },
                    firstObservedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
                    lastObservedAt: new Date().toISOString(),
                    affectedRunCount: 1,
                    sampleExceptionIds: ['ex-mock-003'],
                    aggregationBasis: 'Absolute delta between order and payment',
                    filterType: 'AMOUNT_MISMATCH',
                },
                {
                    groupKey: 'AMBIGUOUS_MATCH',
                    label: 'Ambiguous Match Candidates',
                    description: 'Multiple potential matching candidates detected during automated reconciliation.',
                    exceptionCount: 2,
                    priority: 'CRITICAL',
                    exposureByCurrency: {
                        USD: { currency: 'USD', amountMinor: '50000', formatted: 'USD 500.00', count: 2 },
                    },
                    firstObservedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                    lastObservedAt: new Date().toISOString(),
                    affectedRunCount: 1,
                    sampleExceptionIds: ['ex-mock-004'],
                    aggregationBasis: 'Provider transaction gross',
                    filterType: 'AMBIGUOUS_MATCH',
                },
            ],
            topPrioritizedExceptions: [
                {
                    exceptionId: 'ex-mock-004',
                    type: 'AMBIGUOUS_MATCH',
                    status: 'OPEN',
                    priority: 'CRITICAL',
                    priorityScore: 85,
                    priorityReasons: [
                        'Ambiguous candidate match requires manual operator reconciliation',
                        'High financial exposure (≥ 500.00)',
                        'Unresolved and pending review',
                    ],
                    currency: 'USD',
                    exposureAmountMinor: '50000',
                    formattedExposure: 'USD 500.00',
                    exposureBasis: 'Provider transaction gross',
                    createdAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
                    reconciliationRunId: 'run-mock-001',
                    merchantOrderId: null,
                    providerTransactionId: 'ptxn-mock-004',
                    detailsSummary: 'Multiple provider transactions or orders matched same criteria',
                },
                {
                    exceptionId: 'ex-mock-001',
                    type: 'MISSING_MERCHANT_COUNTERPART',
                    status: 'OPEN',
                    priority: 'HIGH',
                    priorityScore: 65,
                    priorityReasons: [
                        'Material financial exposure (≥ 100.00)',
                        'Orphaned captured payment without internal order record',
                        'Aged exception (> 3 days unresolved)',
                    ],
                    currency: 'USD',
                    exposureAmountMinor: '120000',
                    formattedExposure: 'USD 1,200.00',
                    exposureBasis: 'Provider transaction gross',
                    createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString(),
                    reconciliationRunId: 'run-mock-001',
                    merchantOrderId: null,
                    providerTransactionId: 'ptxn-mock-001',
                    detailsSummary: 'Provider txn TXN-89X captured with no order match',
                },
            ],
            priorityFormulaVersion: 'v1.0 (Exposure Cohort + Age Aging + Discrepancy Severity)',
            dataQualityNotes: [
                'Currency amounts are grouped strictly by ISO currency code to prevent cross-currency summation.',
                'Exposure calculations use deduplicated transaction gross or order amounts depending on exception counterpart.',
                'Operational priority score combines financial threshold, unresolved duration, and matching ambiguity.',
            ],
        };
    }
}

export const intelligenceApiClient = new HttpIntelligenceApiClient();
