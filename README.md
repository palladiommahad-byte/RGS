# Riad Management System

Internal operations platform for a riad (guesthouse) in Marrakech — multi-tenant SaaS
(every business table carries `riad_id`). Booking.com / Airbnb are **not** integrated in V1.

| Package           | What                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `apps/api`        | NestJS REST API (`/api/v1`), Prisma + PostgreSQL 16, Swagger at `/api/docs` |
| `apps/web`        | Next.js 15 (App Router): staff dashboard + guest QR check-in (no public website) |
| `packages/shared` | Shared constants, permission matrix, money helpers, Zod schemas      |

## Local setup

Requirements: Node 20+, pnpm 9, Docker Desktop.

```bash
pnpm install
cp .env.example .env        # then replace the secrets (see comments in the file)
pnpm db:up                  # postgres (host port 5433) + MinIO (9000, console 9001)
pnpm --filter @riad/shared build
pnpm db:migrate             # applies Prisma migrations
pnpm db:seed                # demo riad, users, rooms, categories, tax settings
pnpm dev                    # api on :4000, web on :3100
```

- Web: http://localhost:3100 (staff login at `/fr/login` or `/ar/login`)
- API docs: http://localhost:4000/api/docs
- MinIO console: http://localhost:9001 (minioadmin / minioadmin)

### Demo accounts (from the seed)

Password for all: value of `SEED_DEFAULT_PASSWORD` in `.env` (default `Demo1234!`).

| Role         | Email                     |
| ------------ | ------------------------- |
| Owner        | owner@riad.local          |
| Manager      | manager@riad.local        |
| Reception    | reception@riad.local      |
| Housekeeping | housekeeping@riad.local   |

## Conventions

- **Money** is integer centimes everywhere (`Int` in Prisma, `number` in TS). Use
  `parseMadToCentimes`, `percentOf`, `formatMad` from `@riad/shared`.
- **Tenancy**: `riadId` comes from the authenticated principal (JWT → DB), never from
  the request body.
- **RBAC** is deny-by-default: every route must be `@Public()`, `@AuthenticatedOnly()` or
  `@RequirePermissions(...)`. A route with no decorator returns 403 even for the owner.
  Permissions live in the DB (`permissions`, `role_permissions`); the default matrix is in
  `packages/shared/src/permissions.ts`. Role edits take effect within 30 s (principal cache).
- **Tax rates** are data (`tax_settings`), never code. Only TVA accommodation 10 % is
  seeded; the rest must be entered and validated with the accountant.
- **Sensitive identifiers** (`document_number`, `cin`) are AES-256-GCM encrypted by
  `FieldEncryption`; `*_hash` columns hold an HMAC blind index for exact search.
- **Errors** always have the shape `{ code, message, details }`.
- **Auth**: access JWT (15 min) + rotating refresh token (30 days, stored hashed), both
  httpOnly cookies. The browser reaches the API through a Next.js rewrite of `/api/v1/*`,
  so cookies stay first-party. Re-using a revoked refresh token revokes all sessions.
- **Calendar dates** (check-in/out, birth date) travel as `YYYY-MM-DD` and are stored as
  Postgres `DATE`. "Today" is computed in Africa/Casablanca (`todayIso()`), never UTC.
- **Stay lifecycle**: `PENDING → CHECKED_IN → CHECKED_OUT`, or `PENDING → CANCELLED`
  (`packages/shared/src/stays.ts`). A room becomes `OCCUPIED` only through check-in, with
  an atomic conditional update, so two receptionists can never put guests in the same room.
  Checkout sets the room to `CLEANING`. Staff can set only `FREE`, `CLEANING` and
  `OUT_OF_SERVICE` by hand.
- **QR codes**: the entrance encodes `<site>/checkin?r=<riad checkin_key>`, each room
  `<site>/checkin?room=<room qr_token>`, with no locale so the guest's phone language picks
  EN/FR/ES/AR. Set `NEXT_PUBLIC_SITE_URL` before printing. "New QR" invalidates a room code.

## Guest self check-in (phase 3)

Flow: passport photo → contact & stay → one passport per extra adult → consent (law
09-08 / CNDP text) + signature → `PENDING` stay, live `checkin:new` Socket.io event to
staff with `stays.read`, who verify the photo and confirm (or reject, which deletes the
stay and its files).

- **Photos**: compressed in the browser (≤1600 px JPEG), re-encoded server side with sharp
  (EXIF/GPS stripped), stored under `pending/` in the private passports bucket and moved
  under `riads/<id>/stays/<id>/` on submit. Staff see them through 5-minute signed URLs;
  each view is audit-logged.
- **OCR**: `PassportOcrProvider` — `TesseractProvider` (default, local; downloads the
  English model once into `OCR_CACHE_DIR`, bake it into the Docker image for offline
  servers) or `GoogleVisionProvider` when `GOOGLE_VISION_API_KEY` is set (more accurate on
  phone photos, but images leave the server — mention it in the privacy notice). The MRZ is
  parsed with `mrz` plus repair heuristics for typical Tesseract misreads; check digits
  decide which reading wins. The guest always reviews the fields.
- **Abuse protection**: 10 submissions and 30 scans per hour per IP, honeypot field, the
  photo reference is HMAC-signed and bound to the riad.
- **Retention**: a nightly job (03:30 Casablanca) deletes passport photos
  `PASSPORT_IMAGE_RETENTION_DAYS` (default 90) after departure and abandoned uploads after
  24 h; the text register is kept.
- **Live updates**: dev connects the socket straight to the API
  (`NEXT_PUBLIC_SOCKET_URL=http://localhost:4000`); in production leave it empty and route
  `/api/v1/socket.io` to the API in the reverse proxy (WebSocket upgrade enabled).
- **To validate before go-live**: the consent text and the CNDP declaration number with a
  lawyer.

## Checkout, payments & invoices (phase 4)

- **Bill maths** (`packages/shared/src/billing.ts`, unit-tested): room prices and extras
  are TTC and TVA is extracted per line (`HT = round(TTC × 10000 / (10000 + rate))`);
  FOOD extras use `TVA_FOOD` (falls back to the accommodation rate), others
  `TVA_ACCOMMODATION`; taxe de séjour and TPT are added on top without TVA
  (`PER_PERSON_PER_NIGHT` × adults × nights, or `PERCENT` of accommodation HT). Rates come
  from `tax_settings` in force on the invoice date; missing ones count as 0 with a warning.
  **Have the accountant validate these conventions.**
- **Checkout** requires the balance to be settled, or an explicit "balance due" choice
  (audit-logged). It issues a gapless yearly number `<invoice_prefix>-<year>-00001`
  (atomic counter in `invoice_sequences`), freezes the bill in `invoices.breakdown`,
  renders a French A4 PDF (pdfkit) into the private documents bucket and frees the room for
  cleaning. Extras lock once invoiced; payments can still be added to settle a balance.
- **Invoices** print the riad's ICE / IF / RC / Patente when set (`riads` table; editable
  from Settings in phase 8) and the total in words.
- **Guest register** (`/dashboard/guests`): everyone who checked in or out, searchable by
  name or exact document number (blind index); CSV (semicolon, UTF-8 BOM, formula-injection
  safe) and Excel exports in police fiche order, max 366 days, audit-logged.

## Expenses (phase 5)

- **Quick add** (`/dashboard/expenses`, floating "+" on phones): amount, category tile,
  optional supplier (accent-insensitive autocomplete via Postgres `unaccent`; a new name
  creates the supplier and remembers its category) and receipt photo/PDF (re-encoded,
  private bucket, signed links).
- **Permissions**: `expenses.write` (owner/manager) records, edits and deletes anything;
  `expenses.write_petty_cash` (reception) can only spend from their own wallet and sees
  only what they entered. Routes accepting either use `@RequireAnyPermission`.
- **Petty cash**: managers open wallets, top them up and correct them after a cash count;
  expenses debit the wallet atomically and a wallet can never go negative. Editing or
  deleting a petty-cash expense re-credits the wallet.
- **Recurring expenses**: generated every night at 00:15 (Casablanca) on their day of the
  month (last day for short months), never for a month before they were created, and
  idempotent via a unique `(recurring_id, date)` index. "Générer maintenant" runs it on
  demand.
- `ReceiptOcrProvider` is an empty interface reserved for V2.

## Finance & taxes (phase 6)

- **Dashboard** (`/dashboard/finance`, `finance.reports`): today / this month / last month /
  30 days / custom, each compared with the previous period of the same length. All amounts
  are **HT** (TVA, taxe de séjour and TPT excluded) and accrual-based:
  - accommodation revenue = nights spent inside the period × price, TVA removed, for
    checked-in and checked-out stays (pending and cancelled ones are ignored);
  - extras count on the day they were added; expenses = TTC − deductible TVA on their date;
  - occupancy = occupied nights / (active rooms × days); ADR, RevPAR and cost per occupied
    night follow from it (formulas in `packages/shared/src/finance.ts`, unit-tested).
  - "Net by source" spreads each OTA commission over the stay's nights; it is a view only
    (the commission is already an expense when it is booked as one).
- **Alerts**: a category whose spending this month is more than 25 % above its average
  over the previous full months (at least two months of history).
- **P&L export**: the last 12 months as Excel or landscape PDF, audit-logged (the page shows 6).
- **Tax report** (`/dashboard/taxes`): built from the invoices *issued* in the month (their
  frozen breakdown) and the expenses dated in it: TVA collected per rate, deductible TVA,
  TVA due (or credit), taxe de séjour, TPT. The Excel export for the accountant has a
  summary, the invoice list and the deductible-TVA list.
- **Tax settings** (`tax.settings`): each rate has a validity period. Adding a rate closes
  the previous open-ended one the day before; overlapping periods are refused; TVA is
  always a percentage. Issued invoices keep the rates they were computed with.
- **Demo data**: `pnpm db:seed-demo` adds ~3 months of stays, extras, payments, invoices and
  expenses (deterministic, refuses to run with `NODE_ENV=production`, removes its own
  previous rows first). Any taxe de séjour / TPT values it adds are placeholders: replace
  them with the accountant's figures.

## HR (phase 7)

- **Access**: every `/hr/*` route needs `hr.read` (view) or `hr.write` (change); reception
  and housekeeping get 403 everywhere (e2e-tested). CIN is AES-256-GCM encrypted with a
  blind index (exact search), returned only by `GET /hr/employees/:id`, never written to
  the audit log. Contracts live in the private documents bucket; each view is audit-logged.
- **Badge clock** (`/staff/clock`, reception tablet): each employee has a printable QR
  badge (`/dashboard/hr/badges`) holding only a random token. Any signed-in staff session
  can scan (camera via jsQR, or a USB/Bluetooth reader typing into the field); the answer
  is the first name only. One scan = arrival, the next = departure; a second scan within
  60 s is ignored; a shift open for more than 16 h counts as a forgotten check-out and a new
  shift starts. Scans of one employee are serialised with a row lock. "New badge" disables
  the old QR at once.
- **Attendance report**: days, hours, approved leave days and shifts without check-out per
  employee and month; managers can add, correct or delete shifts (audit-logged).
- **Leaves**: employees have no account, so a manager records the request, then approves
  or rejects it (once). Pending and approved leaves of one employee cannot overlap.
- **Payroll**: "Préparer la paie" creates draft lines from base salaries for active
  employees hired by the end of the month (idempotent). Net = base + bonuses − advances −
  deductions. **CNSS, AMO and IR are not computed** — the accountant provides them and they
  are entered as deductions. Marking a line paid creates, in the same transaction, a
  "Salaires" expense for the net, dated on the payment day, noted `Salaire YYYY-MM`
  without the employee's name, and locked in the expenses screens. "Annuler le paiement"
  deletes that expense. Advances handed out during the month are not recorded as
  expenses by the system. Excel export per month.
- **Time zone**: local dates and month bounds use the runtime's tz database. Morocco moved
  to permanent UTC+0 on 20 Sept 2026 (tzdata **2026c**); the API logs a warning at start-up
  when Node's `process.versions.tz` is older. Use a Node release (and Docker base image)
  that ships 2026c or later.

## Scripts

| Command          | Does                                       |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | Builds shared, runs api + web in watch mode |
| `pnpm test`      | All unit tests (Vitest in shared, Jest in api) |
| `pnpm test:e2e`  | API end-to-end tests against `<db>_test` (created automatically; dev data is untouched) |
| `pnpm typecheck` | `tsc --noEmit` in every package            |
| `pnpm db:reset`  | Drops, re-migrates and re-seeds the database |
| `pnpm db:seed-demo` | Adds 3 months of demo activity for the finance pages |

Deployment (VPS + Docker) is documented in phase 9.
