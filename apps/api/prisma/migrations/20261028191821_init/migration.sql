-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('FREE', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "StaySource" AS ENUM ('BOOKING', 'AIRBNB', 'EXPEDIA', 'DIRECT', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "StayStatus" AS ENUM ('PENDING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExtraCategory" AS ENUM ('FOOD', 'HAMMAM', 'TRANSFER', 'EXCURSION', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OTA_COLLECTED');

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'CHEQUE', 'PETTY_CASH');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('TOP_UP', 'EXPENSE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TaxCode" AS ENUM ('TVA_ACCOMMODATION', 'TVA_FOOD', 'TAXE_SEJOUR', 'TPT');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('PERCENT', 'PER_PERSON_PER_NIGHT');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CDI', 'CDD', 'ANAPEC', 'FREELANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BookingRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'DECLINED');

-- CreateTable
CREATE TABLE "riads" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Marrakech',
    "phone" TEXT,
    "email" TEXT,
    "logo_key" TEXT,
    "tax_category" TEXT,
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV',
    "wifi_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name_fr" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "base_price" INTEGER NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'FREE',
    "qr_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stays" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "room_id" UUID,
    "requested_room_id" UUID,
    "source" "StaySource" NOT NULL DEFAULT 'DIRECT',
    "external_ref" TEXT,
    "check_in_date" DATE NOT NULL,
    "check_out_date" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "price_per_night" INTEGER NOT NULL DEFAULT 0,
    "total_accommodation" INTEGER NOT NULL DEFAULT 0,
    "ota_commission" INTEGER NOT NULL DEFAULT 0,
    "status" "StayStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "stay_id" UUID NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "sex" TEXT,
    "nationality" TEXT,
    "birth_date" DATE,
    "document_type" TEXT,
    "document_number" TEXT,
    "document_number_hash" TEXT,
    "document_expiry" DATE,
    "phone" TEXT,
    "email" TEXT,
    "passport_photo_key" TEXT,
    "signature_key" TEXT,
    "consent_at" TIMESTAMP(3),
    "mrz_raw" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stay_extras" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "stay_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "category" "ExtraCategory" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "stay_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "stay_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "riad_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("riad_id","year")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "stay_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "total_ht" INTEGER NOT NULL,
    "tva_amount" INTEGER NOT NULL,
    "taxe_sejour" INTEGER NOT NULL,
    "tpt" INTEGER NOT NULL,
    "total_ttc" INTEGER NOT NULL,
    "breakdown" JSONB,
    "pdf_key" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "key" TEXT,
    "name_fr" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "default_category_id" UUID,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "supplier_id" UUID,
    "amount_ttc" INTEGER NOT NULL,
    "tva_amount" INTEGER NOT NULL DEFAULT 0,
    "date" DATE NOT NULL,
    "payment_method" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "receipt_key" TEXT,
    "recurring_id" UUID,
    "wallet_id" UUID,
    "payroll_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "day_of_month" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_wallets" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "holder_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "cash_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "expense_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "cin" TEXT,
    "cin_hash" TEXT,
    "cnss_number" TEXT,
    "phone" TEXT,
    "position" TEXT NOT NULL,
    "contract_type" "ContractType" NOT NULL DEFAULT 'CDI',
    "hire_date" DATE NOT NULL,
    "base_salary" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "contract_file_key" TEXT,
    "clock_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "check_in_at" TIMESTAMP(3) NOT NULL,
    "check_out_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaves" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "LeaveType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entries" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "base_salary" INTEGER NOT NULL,
    "bonuses" INTEGER NOT NULL DEFAULT 0,
    "advances" INTEGER NOT NULL DEFAULT 0,
    "deductions" INTEGER NOT NULL DEFAULT 0,
    "net_paid" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_settings" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "code" "TaxCode" NOT NULL,
    "mode" "TaxMode" NOT NULL,
    "value" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "tax_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "diff" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_requests" (
    "id" UUID NOT NULL,
    "riad_id" UUID NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "room_type" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" "BookingRequestStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_riad_id_idx" ON "users"("riad_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_riad_id_key_key" ON "roles"("riad_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_qr_token_key" ON "rooms"("qr_token");

-- CreateIndex
CREATE INDEX "rooms_riad_id_status_idx" ON "rooms"("riad_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_riad_id_name_key" ON "rooms"("riad_id", "name");

-- CreateIndex
CREATE INDEX "stays_riad_id_status_idx" ON "stays"("riad_id", "status");

-- CreateIndex
CREATE INDEX "stays_riad_id_check_in_date_idx" ON "stays"("riad_id", "check_in_date");

-- CreateIndex
CREATE INDEX "stays_riad_id_check_out_date_idx" ON "stays"("riad_id", "check_out_date");

-- CreateIndex
CREATE INDEX "guests_riad_id_last_name_idx" ON "guests"("riad_id", "last_name");

-- CreateIndex
CREATE INDEX "guests_riad_id_document_number_hash_idx" ON "guests"("riad_id", "document_number_hash");

-- CreateIndex
CREATE INDEX "guests_stay_id_idx" ON "guests"("stay_id");

-- CreateIndex
CREATE INDEX "stay_extras_stay_id_idx" ON "stay_extras"("stay_id");

-- CreateIndex
CREATE INDEX "payments_riad_id_paid_at_idx" ON "payments"("riad_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_stay_id_idx" ON "payments"("stay_id");

-- CreateIndex
CREATE INDEX "invoices_riad_id_issued_at_idx" ON "invoices"("riad_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_riad_id_number_key" ON "invoices"("riad_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_riad_id_year_sequence_key" ON "invoices"("riad_id", "year", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_riad_id_key_key" ON "expense_categories"("riad_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_riad_id_name_key" ON "suppliers"("riad_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_payroll_entry_id_key" ON "expenses"("payroll_entry_id");

-- CreateIndex
CREATE INDEX "expenses_riad_id_date_idx" ON "expenses"("riad_id", "date");

-- CreateIndex
CREATE INDEX "expenses_riad_id_category_id_idx" ON "expenses"("riad_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_recurring_id_date_key" ON "expenses"("recurring_id", "date");

-- CreateIndex
CREATE INDEX "recurring_expenses_riad_id_is_active_idx" ON "recurring_expenses"("riad_id", "is_active");

-- CreateIndex
CREATE INDEX "cash_wallets_riad_id_idx" ON "cash_wallets"("riad_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_expense_id_key" ON "cash_movements"("expense_id");

-- CreateIndex
CREATE INDEX "cash_movements_wallet_id_created_at_idx" ON "cash_movements"("wallet_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "employees_clock_token_key" ON "employees"("clock_token");

-- CreateIndex
CREATE INDEX "employees_riad_id_is_active_idx" ON "employees"("riad_id", "is_active");

-- CreateIndex
CREATE INDEX "attendances_riad_id_check_in_at_idx" ON "attendances"("riad_id", "check_in_at");

-- CreateIndex
CREATE INDEX "attendances_employee_id_check_in_at_idx" ON "attendances"("employee_id", "check_in_at");

-- CreateIndex
CREATE INDEX "leaves_riad_id_start_date_idx" ON "leaves"("riad_id", "start_date");

-- CreateIndex
CREATE INDEX "payroll_entries_riad_id_month_idx" ON "payroll_entries"("riad_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entries_employee_id_month_key" ON "payroll_entries"("employee_id", "month");

-- CreateIndex
CREATE INDEX "tax_settings_riad_id_code_valid_from_idx" ON "tax_settings"("riad_id", "code", "valid_from");

-- CreateIndex
CREATE INDEX "audit_logs_riad_id_created_at_idx" ON "audit_logs"("riad_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_riad_id_entity_entity_id_idx" ON "audit_logs"("riad_id", "entity", "entity_id");

-- CreateIndex
CREATE INDEX "booking_requests_riad_id_created_at_idx" ON "booking_requests"("riad_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_extras" ADD CONSTRAINT "stay_extras_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_extras" ADD CONSTRAINT "stay_extras_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "recurring_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "cash_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payroll_entry_id_fkey" FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_wallets" ADD CONSTRAINT "cash_wallets_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_wallets" ADD CONSTRAINT "cash_wallets_holder_id_fkey" FOREIGN KEY ("holder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "cash_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_riad_id_fkey" FOREIGN KEY ("riad_id") REFERENCES "riads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
