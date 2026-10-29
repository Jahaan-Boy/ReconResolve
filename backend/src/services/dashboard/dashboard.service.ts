import type { PrismaClient, ReconciliationRunStatus } from '../../generated/prisma';
import { getDB } from '../../db/postgres';
import type {
    DashboardLatestRunSummary,
    DashboardMetricsSummary,
    DashboardSummaryFilter,
    DashboardSummaryResult,
    DashboardTrendPoint,
} from './types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days maximum range

export class DashboardError extends Error {
    readonly code: 'DASHBOARD_INVALID_INPUT' | 'DASHBOARD_MERCHANT_NOT_FOUND' | 'DASHBOARD_ERROR';
    readonly fields: readonly string[];

    constructor(
        code: 'DASHBOARD_INVALID_INPUT' | 'DASHBOARD_MERCHANT_NOT_FOUND' | 'DASHBOARD_ERROR',
        message: string,
        fields: readonly string[] = [],
    ) {
        super(message);
        this.name = 'DashboardError';
        this.code = code;
        this.fields = fields;
    }
}

export function calculateMatchRate(
    matchedCount: number,
    totalConsidered: number,
    excludedCount: number,
): number | null {
    const eligible = Math.max(0, totalConsidered - excludedCount);
    if (eligible <= 0) return null;
    const rate = (matchedCount / eligible) * 100;
    return Math.round(rate * 100) / 100;
}

export interface DashboardServiceDb {
    reconciliationRun: Pick<
        PrismaClient['reconciliationRun'],
        'findFirst' | 'count' | 'aggregate' | 'findMany'
    >;
    reconciliationException: Pick<PrismaClient['reconciliationException'], 'count'>;
    merchant?: Pick<PrismaClient['merchant'], 'findUnique'>;
}

export interface DashboardServiceDeps {
    db: DashboardServiceDb;
}

export class DashboardService {
    private readonly db: DashboardServiceDb;

    constructor(deps: DashboardServiceDeps) {
        this.db = deps.db;
    }

    async getSummary(
        merchantId: string,
        filter: DashboardSummaryFilter = {},
    ): Promise<DashboardSummaryResult> {
        // 1. Merchant ID validation
        if (!merchantId || !UUID_REGEX.test(merchantId)) {
            throw new DashboardError(
                'DASHBOARD_INVALID_INPUT',
                'merchantId must be a valid UUID',
                ['merchantId'],
            );
        }

        // 2. Date range validation
        if (filter.from && filter.to) {
            if (filter.to < filter.from) {
                throw new DashboardError(
                    'DASHBOARD_INVALID_INPUT',
                    'Invalid date range: "from" timestamp must be earlier than or equal to "to" timestamp',
                    ['from', 'to'],
                );
            }
            if (filter.to.getTime() - filter.from.getTime() > MAX_RANGE_MS) {
                throw new DashboardError(
                    'DASHBOARD_INVALID_INPUT',
                    'Date range cannot exceed 90 days',
                    ['from', 'to'],
                );
            }
        }

        const dateCondition: { gte?: Date; lte?: Date } = {};
        if (filter.from) dateCondition.gte = filter.from;
        if (filter.to) dateCondition.lte = filter.to;
        const hasDateFilter = Object.keys(dateCondition).length > 0;

        const runWhere = {
            merchantId,
            ...(hasDateFilter ? { createdAt: dateCondition } : {}),
        };

        // 3. Parallelized SQL/Prisma aggregates
        const [
            latestRunRecord,
            runCount,
            completedRunCount,
            failedRunCount,
            inProgressRunCount,
            periodAggregates,
            openExceptionCount,
            trendRecords,
        ] = await Promise.all([
            // Overall latest run for this merchant
            this.db.reconciliationRun.findFirst({
                where: { merchantId },
                orderBy: { createdAt: 'desc' },
            }),
            // Bounded run counts in selected period
            this.db.reconciliationRun.count({ where: runWhere }),
            this.db.reconciliationRun.count({ where: { ...runWhere, status: 'COMPLETED' } }),
            this.db.reconciliationRun.count({ where: { ...runWhere, status: 'FAILED' } }),
            this.db.reconciliationRun.count({
                where: { ...runWhere, status: { in: ['PENDING', 'RUNNING'] } },
            }),
            // Aggregate sums in selected period
            this.db.reconciliationRun.aggregate({
                where: runWhere,
                _sum: {
                    totalConsidered: true,
                    matchedCount: true,
                    excludedCount: true,
                },
            }),
            // Current open exceptions (regardless of run/date window)
            this.db.reconciliationException.count({
                where: {
                    merchantId,
                    status: { in: ['OPEN', 'INVESTIGATING'] },
                },
            }),
            // Trend points (up to 30 bounded recent runs in chronological order)
            this.db.reconciliationRun.findMany({
                where: runWhere,
                orderBy: { createdAt: 'asc' },
                take: 30,
                select: {
                    id: true,
                    status: true,
                    totalConsidered: true,
                    matchedCount: true,
                    unmatchedCount: true,
                    ambiguousCount: true,
                    excludedCount: true,
                    createdAt: true,
                },
            }),
        ]);

        // 4. Map latest run summary
        let latestRun: DashboardLatestRunSummary | null = null;
        if (latestRunRecord) {
            const eligibleConsidered = Math.max(
                0,
                latestRunRecord.totalConsidered - latestRunRecord.excludedCount,
            );
            const matchRate = calculateMatchRate(
                latestRunRecord.matchedCount,
                latestRunRecord.totalConsidered,
                latestRunRecord.excludedCount,
            );

            let durationMs: number | null = null;
            if (latestRunRecord.startedAt && latestRunRecord.completedAt) {
                durationMs = Math.max(
                    0,
                    latestRunRecord.completedAt.getTime() - latestRunRecord.startedAt.getTime(),
                );
            }

            latestRun = {
                id: latestRunRecord.id,
                merchantId: latestRunRecord.merchantId,
                status: latestRunRecord.status as ReconciliationRunStatus,
                windowStart: latestRunRecord.windowStart.toISOString(),
                windowEnd: latestRunRecord.windowEnd.toISOString(),
                rulesetVersion: latestRunRecord.rulesetVersion,
                totalConsidered: latestRunRecord.totalConsidered,
                matchedCount: latestRunRecord.matchedCount,
                unmatchedCount: latestRunRecord.unmatchedCount,
                ambiguousCount: latestRunRecord.ambiguousCount,
                excludedCount: latestRunRecord.excludedCount,
                eligibleConsidered,
                matchRatePercentage: matchRate,
                durationMs,
                failureReason: latestRunRecord.failureReason ?? null,
                startedAt: latestRunRecord.startedAt?.toISOString() ?? null,
                completedAt: latestRunRecord.completedAt?.toISOString() ?? null,
                createdAt: latestRunRecord.createdAt.toISOString(),
            };
        }

        // 5. Calculate summary totals & period rate
        const totalConsideredSum = periodAggregates._sum.totalConsidered ?? 0;
        const totalMatchedSum = periodAggregates._sum.matchedCount ?? 0;
        const totalExcludedSum = periodAggregates._sum.excludedCount ?? 0;
        const periodMatchRatePercentage = calculateMatchRate(
            totalMatchedSum,
            totalConsideredSum,
            totalExcludedSum,
        );

        const summary: DashboardMetricsSummary = {
            runCount,
            completedRunCount,
            failedRunCount,
            inProgressRunCount,
            openExceptionCount,
            totalConsideredSum,
            totalMatchedSum,
            periodMatchRatePercentage,
        };

        // 6. Map trend points
        const trend: DashboardTrendPoint[] = trendRecords.map((r) => {
            const matchRate = calculateMatchRate(
                r.matchedCount,
                r.totalConsidered,
                r.excludedCount,
            );
            return {
                date: r.createdAt.toISOString().slice(0, 10),
                runId: r.id,
                status: r.status as ReconciliationRunStatus,
                totalConsidered: r.totalConsidered,
                matchedCount: r.matchedCount,
                unmatchedCount: r.unmatchedCount,
                ambiguousCount: r.ambiguousCount,
                excludedCount: r.excludedCount,
                matchRatePercentage: matchRate,
                createdAt: r.createdAt.toISOString(),
            };
        });

        return {
            range: {
                from: filter.from ? filter.from.toISOString() : null,
                to: filter.to ? filter.to.toISOString() : null,
            },
            generatedAt: new Date().toISOString(),
            latestRun,
            summary,
            trend,
        };
    }
}

export interface CreateDashboardServiceDeps {
    getDb?: () => PrismaClient;
}

export function createDashboardService(
    deps: CreateDashboardServiceDeps = {},
): DashboardService {
    const dbProvider = deps.getDb ?? getDB;
    const prisma = dbProvider();
    return new DashboardService({
        db: prisma as any,
    });
}

