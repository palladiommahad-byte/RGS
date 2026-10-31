-- Every room has its own QR code: the riad-wide entrance code is gone.
DROP INDEX IF EXISTS "riads_checkin_key_key";
ALTER TABLE "riads" DROP COLUMN "checkin_key";

-- Automatic stay cycle: check-out time, and when rooms « to clean » become free.
ALTER TABLE "riads" ADD COLUMN "checkout_time" TEXT NOT NULL DEFAULT '12:00',
ADD COLUMN "room_ready_time" TEXT NOT NULL DEFAULT '15:00';
