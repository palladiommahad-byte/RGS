-- DropForeignKey
ALTER TABLE "booking_requests" DROP CONSTRAINT "booking_requests_riad_id_fkey";

-- AlterTable
ALTER TABLE "riads" ADD COLUMN     "checkin_key" TEXT NOT NULL DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text);

-- DropTable
DROP TABLE "booking_requests";

-- DropEnum
DROP TYPE "BookingRequestStatus";

-- CreateIndex
CREATE UNIQUE INDEX "riads_checkin_key_key" ON "riads"("checkin_key");

