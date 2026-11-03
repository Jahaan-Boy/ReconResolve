import { getDB, connectDB, closeDB } from './postgres';
import { sanitizeErrorMessage } from '../services/outbox/error-sanitizer';

export interface MigrationResult {
    applied: boolean;
    alreadyExisted: boolean;
    tables: string[];
    message: string;
}

export async function applyCopilotMigration(): Promise<MigrationResult> {
    try {
        await connectDB();
    } catch (err) {
        return {
            applied: false,
            alreadyExisted: false,
            tables: [],
            message: `PostgreSQL connection unavailable: ${sanitizeErrorMessage(err)}. Schema migration 20261101090839_copilot_intelligence_schema is staged and ready for auto-apply on database boot.`,
        };
    }

    const prisma = getDB();

    try {
        // 1. Check if copilot tables already exist
        const existingTables: Array<{ table_name: string }> = await prisma.$queryRaw`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name IN ('copilot_sessions', 'copilot_messages')
        `;

        const existingNames = existingTables.map((t) => t.table_name);
        if (existingNames.includes('copilot_sessions') && existingNames.includes('copilot_messages')) {
            return {
                applied: true,
                alreadyExisted: true,
                tables: existingNames,
                message: 'Copilot persistence tables (copilot_sessions, copilot_messages) are already present and verified in PostgreSQL.',
            };
        }

        // 2. Apply tables idempotently
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "copilot_sessions" (
                "id" UUID NOT NULL,
                "merchant_id" UUID NOT NULL,
                "created_by_user_id" UUID NOT NULL,
                "title" VARCHAR(100),
                "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "archived_at" TIMESTAMPTZ(6),
                "version" INTEGER NOT NULL DEFAULT 1,
                CONSTRAINT "copilot_sessions_pkey" PRIMARY KEY ("id")
            );

            CREATE INDEX IF NOT EXISTS "copilot_sessions_merchant_id_created_by_user_id_last_messag_idx" 
            ON "copilot_sessions"("merchant_id", "created_by_user_id", "last_message_at" DESC);

            CREATE INDEX IF NOT EXISTS "copilot_sessions_merchant_id_last_message_at_idx" 
            ON "copilot_sessions"("merchant_id", "last_message_at" DESC);

            CREATE TABLE IF NOT EXISTS "copilot_messages" (
                "id" UUID NOT NULL,
                "session_id" UUID NOT NULL,
                "merchant_id" UUID NOT NULL,
                "role" VARCHAR(32) NOT NULL,
                "content" TEXT NOT NULL,
                "answer_payload" JSONB,
                "request_id" VARCHAR(128),
                "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "copilot_messages_pkey" PRIMARY KEY ("id")
            );

            CREATE INDEX IF NOT EXISTS "copilot_messages_merchant_id_session_id_created_at_idx" 
            ON "copilot_messages"("merchant_id", "session_id", "created_at" ASC);

            CREATE INDEX IF NOT EXISTS "copilot_messages_session_id_created_at_idx" 
            ON "copilot_messages"("session_id", "created_at" ASC);
        `;

        // Add foreign keys defensively
        await prisma.$executeRaw`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'copilot_sessions_merchant_id_fkey'
                ) THEN
                    ALTER TABLE "copilot_sessions" 
                    ADD CONSTRAINT "copilot_sessions_merchant_id_fkey" 
                    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'copilot_sessions_created_by_user_id_fkey'
                ) THEN
                    ALTER TABLE "copilot_sessions" 
                    ADD CONSTRAINT "copilot_sessions_created_by_user_id_fkey" 
                    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'copilot_messages_session_id_fkey'
                ) THEN
                    ALTER TABLE "copilot_messages" 
                    ADD CONSTRAINT "copilot_messages_session_id_fkey" 
                    FOREIGN KEY ("session_id") REFERENCES "copilot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'copilot_messages_merchant_id_fkey'
                ) THEN
                    ALTER TABLE "copilot_messages" 
                    ADD CONSTRAINT "copilot_messages_merchant_id_fkey" 
                    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
                END IF;
            END $$;
        `;

        return {
            applied: true,
            alreadyExisted: false,
            tables: ['copilot_sessions', 'copilot_messages'],
            message: 'Successfully applied Copilot persistence schema migration to PostgreSQL database.',
        };
    } catch (err) {
        return {
            applied: false,
            alreadyExisted: false,
            tables: [],
            message: `Migration execution failed: ${sanitizeErrorMessage(err)}`,
        };
    } finally {
        await closeDB().catch(() => undefined);
    }
}

if (require.main === module) {
    applyCopilotMigration().then((res) => {
        console.log(JSON.stringify(res, null, 2));
    });
}
