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
