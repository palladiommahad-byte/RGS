-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_requested_room_id_fkey" FOREIGN KEY ("requested_room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
