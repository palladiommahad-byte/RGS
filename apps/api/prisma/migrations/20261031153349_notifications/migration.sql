-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "user_id" UUID,
    "actor_id" UUID,
    "entity_id" UUID,
    "data" JSONB NOT NULL,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_reads" (
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id","user_id")
);

-- CreateIndex
CREATE INDEX "notifications_riad_id_created_at_idx" ON "notifications"("riad_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_riad_id_dedupe_key_key" ON "notifications"("riad_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "notification_reads_user_id_idx" ON "notification_reads"("user_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
