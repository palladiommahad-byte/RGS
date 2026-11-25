/** A backup older than this (or a failed one) raises an alert to the owner. */
export const BACKUP_STALE_HOURS = 26;

/** What the owner types to confirm a restore (it replaces every current record and file). */
export const RESTORE_CONFIRM_WORD = 'RESTORE';

/** Backup names are their stamps: 2026-10-31_030000. */
export const BACKUP_NAME = /^\d{4}-\d{2}-\d{2}_\d{6}$/;

export type BackupRunStatus = 'REQUESTED' | 'RUNNING' | 'OK' | 'FAILED';

export type BackupRunDto = {
  id: string;
  /** SCHEDULED (nightly) | MANUAL (Back up now or before an upgrade) | RESTORE (a restore of `name`) */
  trigger: 'SCHEDULED' | 'MANUAL' | 'RESTORE';
  status: BackupRunStatus;
  /** Stamp to give the restore script, e.g. 2026-10-31_030000 (for RESTORE: the backup restored). */
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
  /** A restore is waiting or running: the app restarts when it is done. */
  restoring: boolean;
  /** Only owners may restore. */
  canRestore: boolean;
  runs: BackupRunDto[];
};

export type BackupNotificationData = {
  kind: 'FAILED' | 'STALE';
  runId: string | null;
  error: string | null;
  /** Last successful backup, if any. */
  lastOkAt: string | null;
};
