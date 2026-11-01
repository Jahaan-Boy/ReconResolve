-- CreateTable
CREATE TABLE "copilot_sessions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "title" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "copilot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_messages" (
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

-- CreateIndex
CREATE INDEX "copilot_sessions_merchant_id_created_by_user_id_last_messag_idx" ON "copilot_sessions"("merchant_id", "created_by_user_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "copilot_sessions_merchant_id_last_message_at_idx" ON "copilot_sessions"("merchant_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "copilot_messages_merchant_id_session_id_created_at_idx" ON "copilot_messages"("merchant_id", "session_id", "created_at" ASC);

-- CreateIndex
CREATE INDEX "copilot_messages_session_id_created_at_idx" ON "copilot_messages"("session_id", "created_at" ASC);

-- AddForeignKey
ALTER TABLE "copilot_sessions" ADD CONSTRAINT "copilot_sessions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_sessions" ADD CONSTRAINT "copilot_sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "copilot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
