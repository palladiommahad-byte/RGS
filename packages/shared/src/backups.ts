/** A backup older than this (or a failed one) raises an alert to the owner. */
export const BACKUP_STALE_HOURS = 26;

export type BackupRunStatus = 'REQUESTED' | 'RUNNING' | 'OK' | 'FAILED';

export type BackupRunDto = {
  id: string;
  /** SCHEDULED (nightly) | MANUAL (Back up now or before an upgrade) */
  trigger: 'SCHEDULED' | 'MANUAL';
  status: BackupRunStatus;
  /** Stamp to give the restore script, e.g. 2026-10-31_030000. */
  name: string | null;
  /** Database + files, bytes (encrypted size). */
  size: number | null;
  encrypted: boolean;
  offsite: boolean;
  error: string | null;
  requestedAt: string;
  finishedAt: string | null;
  requestedBy: string | null;
};

export type BackupStatusDto = {
  /** Last successful backup. */
  lastOk: BackupRunDto | null;
  /** Last OK backup within BACKUP_STALE_HOURS. */
  healthy: boolean;
  /** A backup is waiting or running ("Back up now" is disabled). */
  inProgress: boolean;
  /** No backup ever recorded: the backup service is probably not running. */
  neverRan: boolean;
  runs: BackupRunDto[];
};

export type BackupNotificationData = {
  kind: 'FAILED' | 'STALE';
  runId: string | null;
  error: string | null;
  /** Last successful backup, if any. */
  lastOkAt: string | null;
};
