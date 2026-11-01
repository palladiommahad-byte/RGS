-- Backup history (written by the backup container, shown to the owner).
CREATE TABLE "backup_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_by" UUID,
    "name" TEXT,
    "db_bytes" BIGINT,
    "files_bytes" BIGINT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "offsite" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "backup_runs_status_requested_at_idx" ON "backup_runs"("status", "requested_at");
