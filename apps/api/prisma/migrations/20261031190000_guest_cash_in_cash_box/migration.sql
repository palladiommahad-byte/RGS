-- Guest cash payments go into a cash box: a PAYMENT movement linked to the payment.
ALTER TYPE "CashMovementType" ADD VALUE 'PAYMENT';

ALTER TABLE "cash_movements" ADD COLUMN "payment_id" UUID;
CREATE UNIQUE INDEX "cash_movements_payment_id_key" ON "cash_movements"("payment_id");
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
