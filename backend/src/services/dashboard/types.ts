import type { ReconciliationRunStatus } from '../../generated/prisma';

export interface DashboardSummaryFilter {
    from?: Date;
    to?: Date;
}

export interface DashboardLatestRunSummary {
    id: string;
    merchantId: string;
    status: ReconciliationRunStatus;
    windowStart: string;
    windowEnd: string;
    rulesetVersion: string;
    totalConsidered: number;
    matchedCount: number;
    unmatchedCount: number;
    ambiguousCount: number;
    excludedCount: number;
    eligibleConsidered: number;
    matchRatePercentage: number | null;
    durationMs: number | null;
    failureReason?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    createdAt: string;
}

export interface DashboardMetricsSummary {
    runCount: number;
    completedRunCount: number;
    failedRunCount: number;
    inProgressRunCount: number;
    openExceptionCount: number;
    totalConsideredSum: number;
    totalMatchedSum: number;
    periodMatchRatePercentage: number | null;
}

export interface DashboardTrendPoint {
    date: string;
    runId: string;
    status: ReconciliationRunStatus;
    totalConsidered: number;
    matchedCount: number;
    unmatchedCount: number;
    ambiguousCount: number;
    excludedCount: number;
    matchRatePercentage: number | null;
    createdAt: string;
}

export interface DashboardSummaryResult {
    range: {
        from: string | null;
        to: string | null;
    };
    generatedAt: string;
    latestRun: DashboardLatestRunSummary | null;
    summary: DashboardMetricsSummary;
    trend: DashboardTrendPoint[];
}

