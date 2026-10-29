-- AlterTable
ALTER TABLE "recurring_expenses" ADD COLUMN     "payment_method" "ExpensePaymentMethod" NOT NULL DEFAULT 'TRANSFER',
ADD COLUMN     "supplier_id" UUID;

-- CreateIndex
CREATE INDEX "expenses_riad_id_created_by_idx" ON "expenses"("riad_id", "created_by");

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
