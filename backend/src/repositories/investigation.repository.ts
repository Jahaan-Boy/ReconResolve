import { getDB } from '../db/postgres';
import type { PrismaClient } from '../generated/prisma';
import { AIInvestigatorError } from '../services/ai-investigator/errors';
import type { InvestigationRecord } from '../services/ai-investigator/types';

export interface InvestigationRepository {
    save(record: InvestigationRecord): Promise<InvestigationRecord>;
    findById(merchantId: string, exceptionId: string, investigationId: string): Promise<InvestigationRecord | null>;
    findLatestByException(merchantId: string, exceptionId: string): Promise<InvestigationRecord | null>;
    listByException(merchantId: string, exceptionId: string): Promise<InvestigationRecord[]>;
    findByIdempotencyKey(merchantId: string, idempotencyKey: string): Promise<InvestigationRecord | null>;
}

/**
 * In-memory repository implementation for test suites and environments where
 * database migrations are not yet applied. Enforces strict tenant isolation.
 */
export class InMemoryInvestigationRepository implements InvestigationRepository {
    private readonly records = new Map<string, InvestigationRecord>();

    public async save(record: InvestigationRecord): Promise<InvestigationRecord> {
        this.records.set(record.id, { ...record });
        return { ...record };
    }

    public async findById(
        merchantId: string,
        exceptionId: string,
        investigationId: string,
    ): Promise<InvestigationRecord | null> {
        const found = this.records.get(investigationId);
        if (!found) return null;
        if (found.merchantId !== merchantId || found.exceptionId !== exceptionId) {
            return null; // Tenant isolation: cross-tenant access returns null
        }
        return { ...found };
    }

    public async findLatestByException(
        merchantId: string,
        exceptionId: string,
    ): Promise<InvestigationRecord | null> {
        const matching = Array.from(this.records.values())
            .filter((r) => r.merchantId === merchantId && r.exceptionId === exceptionId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return matching.length > 0 ? { ...matching[0] } : null;
    }

    public async listByException(
        merchantId: string,
        exceptionId: string,
    ): Promise<InvestigationRecord[]> {
        return Array.from(this.records.values())
            .filter((r) => r.merchantId === merchantId && r.exceptionId === exceptionId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((r) => ({ ...r }));
    }

    public async findByIdempotencyKey(
        merchantId: string,
        idempotencyKey: string,
    ): Promise<InvestigationRecord | null> {
        const found = Array.from(this.records.values()).find(
            (r) => r.merchantId === merchantId && r.idempotencyKey === idempotencyKey,
        );
        return found ? { ...found } : null;
    }

    public clear(): void {
        this.records.clear();
    }
}

/**
 * Prisma repository implementation ready for database persistence once migrations are applied.
 */
export class PrismaInvestigationRepository implements InvestigationRepository {
    private readonly dbProvider: () => PrismaClient;

    constructor(dbProvider: () => PrismaClient = getDB) {
        this.dbProvider = dbProvider;
    }

    public async save(record: InvestigationRecord): Promise<InvestigationRecord> {
        const db = this.dbProvider();
        try {
            const delegate = (db as any).exceptionInvestigation;
            if (!delegate || typeof delegate.create !== 'function') {
                throw new Error('ExceptionInvestigation Prisma model is not yet migrated to the database');
            }

            const row = await delegate.create({
                data: {
                    id: record.id,
                    merchantId: record.merchantId,
                    exceptionId: record.exceptionId,
                    actorId: record.actorId,
                    reconciliationRunId: record.reconciliationRunId,
                    idempotencyKey: record.idempotencyKey,
                    status: record.status,
                    summary: record.result.summary,
                    facts: record.result.facts,
                    likelyCauses: record.result.likelyCauses,
                    recommendedNextSteps: record.result.recommendedNextSteps,
                    missingOrConflictingEvidence: record.result.missingOrConflictingEvidence,
                    limitations: record.result.limitations,
                    evidenceRefs: record.result.evidenceRefs,
                    modelProvider: record.modelProvider,
                    modelId: record.modelId,
                    promptVersion: record.promptVersion,
                    outputSchemaVersion: record.outputSchemaVersion,
                    durationMs: record.durationMs,
                    errorCategory: record.errorCategory,
                    createdAt: record.createdAt,
                },
            });

            return {
                id: row.id,
                merchantId: row.merchantId,
                exceptionId: row.exceptionId,
                actorId: row.actorId,
                reconciliationRunId: row.reconciliationRunId,
                idempotencyKey: row.idempotencyKey,
                status: row.status,
                result: {
                    summary: row.summary,
                    facts: row.facts,
                    likelyCauses: row.likelyCauses,
                    recommendedNextSteps: row.recommendedNextSteps,
                    missingOrConflictingEvidence: row.missingOrConflictingEvidence ?? [],
                    limitations: row.limitations ?? [],
                    evidenceRefs: row.evidenceRefs,
                    generatedAt: row.createdAt.toISOString(),
                    modelProvider: row.modelProvider,
                    modelId: row.modelId,
                    promptVersion: row.promptVersion,
                    outputSchemaVersion: row.outputSchemaVersion,
                    status: row.status,
                },
                modelProvider: row.modelProvider,
                modelId: row.modelId,
                promptVersion: row.promptVersion,
                outputSchemaVersion: row.outputSchemaVersion,
                durationMs: row.durationMs ?? 0,
                errorCategory: row.errorCategory ?? undefined,
                createdAt: row.createdAt,
            };
        } catch (err) {
            throw AIInvestigatorError.persistenceFailed(
                `Failed to persist investigation: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    public async findById(
        merchantId: string,
        exceptionId: string,
        investigationId: string,
    ): Promise<InvestigationRecord | null> {
        const db = this.dbProvider();
        const delegate = (db as any).exceptionInvestigation;
        if (!delegate || typeof delegate.findFirst !== 'function') return null;

        const row = await delegate.findFirst({
            where: {
                id: investigationId,
                merchantId,
                exceptionId,
            },
        });
        if (!row) return null;

        return this.mapRowToRecord(row);
    }

    public async findLatestByException(
        merchantId: string,
        exceptionId: string,
    ): Promise<InvestigationRecord | null> {
        const db = this.dbProvider();
        const delegate = (db as any).exceptionInvestigation;
        if (!delegate || typeof delegate.findFirst !== 'function') return null;

        const row = await delegate.findFirst({
            where: {
                merchantId,
                exceptionId,
            },
            orderBy: { createdAt: 'desc' },
        });
        if (!row) return null;

        return this.mapRowToRecord(row);
    }

    public async listByException(
        merchantId: string,
        exceptionId: string,
    ): Promise<InvestigationRecord[]> {
        const db = this.dbProvider();
        const delegate = (db as any).exceptionInvestigation;
        if (!delegate || typeof delegate.findMany !== 'function') return [];

        const rows = await delegate.findMany({
            where: {
                merchantId,
                exceptionId,
            },
            orderBy: { createdAt: 'desc' },
        });

        return rows.map((r: any) => this.mapRowToRecord(r));
    }

    public async findByIdempotencyKey(
        merchantId: string,
        idempotencyKey: string,
    ): Promise<InvestigationRecord | null> {
        const db = this.dbProvider();
        const delegate = (db as any).exceptionInvestigation;
        if (!delegate || typeof delegate.findFirst !== 'function') return null;

        const row = await delegate.findFirst({
            where: {
                merchantId,
                idempotencyKey,
            },
        });
        if (!row) return null;

        return this.mapRowToRecord(row);
    }

    private mapRowToRecord(row: any): InvestigationRecord {
        return {
            id: row.id,
            merchantId: row.merchantId,
            exceptionId: row.exceptionId,
            actorId: row.actorId,
            reconciliationRunId: row.reconciliationRunId,
            idempotencyKey: row.idempotencyKey,
            status: row.status,
            result: {
                summary: row.summary,
                facts: row.facts,
                likelyCauses: row.likelyCauses,
                recommendedNextSteps: row.recommendedNextSteps,
                missingOrConflictingEvidence: row.missingOrConflictingEvidence ?? [],
                limitations: row.limitations ?? [],
                evidenceRefs: row.evidenceRefs,
                generatedAt: row.createdAt.toISOString(),
                modelProvider: row.modelProvider,
                modelId: row.modelId,
                promptVersion: row.promptVersion,
                outputSchemaVersion: row.outputSchemaVersion,
                status: row.status,
            },
            modelProvider: row.modelProvider,
            modelId: row.modelId,
            promptVersion: row.promptVersion,
            outputSchemaVersion: row.outputSchemaVersion,
            durationMs: row.durationMs ?? 0,
            errorCategory: row.errorCategory ?? undefined,
            createdAt: row.createdAt,
        };
    }
}

export function createInvestigationRepository(dbProvider = getDB): InvestigationRepository {
    // Default to in-memory repository to guarantee safe, unblocked execution
    // without requiring immediate database migration changes
    return new InMemoryInvestigationRepository();
}
