# Riad Management System

Internal operations platform for a riad (guesthouse) in Marrakech — multi-tenant SaaS
(every business table carries `riad_id`). Booking.com / Airbnb are **not** integrated in V1.

| Package           | What                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `apps/api`        | NestJS REST API (`/api/v1`), Prisma + PostgreSQL 16, Swagger at `/api/docs` |
| `apps/web`        | Next.js 15 (App Router): staff dashboard + guest QR check-in (no public website) |
| `packages/shared` | Shared constants, permission matrix, money helpers, Zod schemas      |

## Local setup

Requirements: Node 24 with tz data 2026c or newer (`node -p process.versions.tz`; Morocco
has been on UTC+0 since 20 Sept 2026), pnpm 9, Docker Desktop.

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

### Everything in Docker

To run the production builds of the app in Docker too (no Node needed on the machine once
`.env` exists):

```bash
pnpm docker:up              # = docker compose up -d --build
```

- Web: http://localhost:3200 — API: http://localhost:4100/api/docs
- Same database and files as `pnpm dev`; the API applies migrations on start. On an empty
  database, seed the demo accounts below once:
  `docker compose exec -e NODE_ENV=development api npx tsx prisma/seed.ts`.
- The API creates its storage buckets in MinIO when it starts (`pnpm dev` too), so no
  setup container is needed.

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
- **QR codes**: one per room, `<site>/checkin?room=<room qr_token>` (no riad-wide code: the
  scan tells which room), with no locale so the guest's phone language picks EN/FR/ES/AR.
  Set `NEXT_PUBLIC_SITE_URL` before printing. "New QR" invalidates a room code.

## Guest self check-in (phase 3)

Flow: passport photo → contact & stay → one passport per extra adult → consent (law
09-08 / CNDP text) + signature. Then:

- **Room free** (free or being cleaned, nobody booked for those nights): the guest is
  **checked in at once** — stay `CHECKED_IN` in that room at its base price (source
  Direct, staff can correct it), room `OCCUPIED`, "Guest checked in" notification.
- **Room not free** (occupied, out of service or booked): `PENDING` stay for that room,
  live `checkin:new` event and a "room not free — choose a room" notification; reception
  verifies and confirms in another room (or rejects, which deletes the stay and its files).

## Automatic stay cycle

Each riad sets two times in Settings (riad time): **check-out** (default 12:00) and
**rooms ready** (default 15:00). A job every 5 minutes (`StayCycleService`, so it also
catches up after downtime):

- checks out guests still in on their departure day at the check-out time — invoice
  issued, balance still due flagged on the invoice and in the notification, room « to
  clean »; logged as done by the system;
- frees rooms still « to clean » at the room-ready time (rooms that went « to clean » after
  it wait for the next day). Out-of-service rooms are never touched.

Staff can still check out or mark a room ready earlier by hand. Extra nights: edit the
departure date; the automatic check-out follows it. If another stay holds the room for any
of the new nights the change is refused (`ROOM_BOOKED`) with the rooms free for those
nights, and the edit dialog offers "Move to <room>".

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
  from Settings) and the total in words.
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
- **Guest cash in the box**: a cash payment goes into a cash box (`PAYMENT` movement linked
  to the payment) — the one chosen in the payment dialog, else the receiver's own box, else
  the riad's only box (none: not tracked in a box). Deleting the payment takes the cash back
  out (refused if the box no longer holds it). Each movement notifies managers and the holder.
- **Cash box page** (`/dashboard/cash-box`): balance, money in / out over a period, and every
  movement (guest payments, top-ups, expenses, corrections) with who did it and the balance
  right after it; filters by period and type. Reception sees only their own box.
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

## Settings & users (phase 8)

The original phase 8 (public website + booking form) was dropped: this is an internal
system. Phase 8 delivers spec §5.8 instead.

- **Riad settings** (`/dashboard/settings`, `settings.riad` = owner): name, address,
  contacts, invoice prefix (with a preview of the next number; numbering continues when the
  prefix changes), ICE / IF / RC / Patente printed on new invoices, Wi-Fi text shown to
  guests after online check-in, logo. The logo is re-encoded as a ≤512 px PNG (SVG refused),
  kept in the private documents bucket, served to signed-in staff by `GET /riad/logo`
  (versioned URL, cacheable) and drawn on new invoice PDFs. Every change is audit-logged.
- **Users** (`/dashboard/users`, `users.manage` = owner + manager): create (temporary
  password generated in the browser, handed over in person), edit, deactivate/reactivate,
  reset password; read-only role × permission matrix. Accounts are never deleted (the audit
  log points to them).
  - *No privilege escalation*: a role can only be given, and an account only managed, by
    someone holding all of its permissions — a manager cannot create, edit or reset an
    owner.
  - *No self-lockout*: nobody can deactivate themselves or change their own role, so an
    active owner always remains.
  - Deactivation, role change and password reset revoke the user's refresh tokens; the
    principal cache is cleared, so a deactivated user is refused on the next request.
- **Change my password** (key icon at the bottom of the menu, `POST /auth/change-password`):
  checks the current password, signs out every other device, keeps this one.
- Role permissions are stored in the database; editing the matrix itself is not in V1.

## Activity log

`/dashboard/audit` (`audit.read` = owner + manager) shows the audit trail newest first,
grouped by day: who did what (guest self check-ins show as "guest or system"), with the
recorded changes (before → after) under "Details" and a link to the stay when there is one.
Filters: area (stays, payments, expenses, rooms, staff, finance, users & settings), person
and day range (riad time). `GET /audit` and `GET /audit/users` are read-only; areas and
action kinds live in `packages/shared/src/audit.ts`. A new audit action needs a label under
`auditAction` in the three message files, otherwise the page shows its raw name.

## Notification center

The bell (top right) lists, live over Socket.io, with a read state per person:

| Notification | When | Who sees it |
| ------------ | ---- | ----------- |
| QR check-in, room not free: choose a room | a guest checks in but their room is not free | `stays.read` |
| Guest checked in | QR check-in into a free room, or staff confirm / check in | `rooms.read` |
| Room checked out (to clean, or balance due), by staff or automatically | check-out | `rooms.read` |
| Check-out tomorrow / today | 24 h before the riad check-out time, once per stay and date | `rooms.read` |
| Cash box topped up / corrected / paid from / expense changed or deleted | every cash box movement | `expenses.read_all` + the box holder |

Nobody is notified about their own action; housekeeping sees rooms, never guest names. A
job checks the reminders every 15 minutes and deletes notifications after 90 days
(`apps/api/src/notifications`).

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: lint, type checks, unit
tests, the API e2e tests against a throwaway Postgres, and production builds of the API
and web app. The secrets in it are test-only values.

## Scripts

| Command          | Does                                       |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | Builds shared, runs api + web in watch mode |
| `pnpm test`      | All unit tests (Vitest in shared, Jest in api) |
| `pnpm test:e2e`  | API end-to-end tests against `<db>_test` (created automatically; dev data is untouched) |
| `pnpm typecheck` | `tsc --noEmit` in every package            |
| `pnpm db:reset`  | Drops, re-migrates and re-seeds the database |
| `pnpm db:seed-demo` | Adds 3 months of demo activity for the finance pages |

## Tests

- **Unit** (`pnpm test`): money parsing and rounding, TTC → HT, the bill (taxe de séjour,
  TPT, TVA per rate) plus 2 000 random bills checked against the balancing rules
  (`billing.invariants.test.ts`), invoice numbering, KPIs (occupancy, ADR, RevPAR, margin),
  expense/recurring dates, payroll net and payroll → expense, badge-clock rules, time zones,
  the default permission matrix and the no-escalation rule.
- **End-to-end** (`pnpm test:e2e`, real Postgres, storage faked): every module, including
  HR invisible to reception and housekeeping, riad isolation, and `routes.e2e-spec.ts`,
  which lists **every** route of the app and fails if one has no access policy, if the
  public surface changes, or if an HR / finance / settings / users route loses its
  permission.

## Deployment (VPS + Docker)

One riad = one small VPS (2 vCPU, 4 GB RAM, 40 GB disk is plenty; EU or Morocco region).
Everything runs in Docker: Caddy (automatic HTTPS), web, api, Postgres 16, MinIO, backups.
Files are in [`deploy/`](deploy/).

### 1. Server

```bash
# Ubuntu 24.04, as root
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
git clone <this repository> /opt/riad && cd /opt/riad/deploy
```

DNS: two A records to the server's IP — the app (`riad.example.com`) and the file links
(`files.riad.example.com`). With Cloudflare, either use "DNS only" (grey cloud) or set SSL
to "Full (strict)"; behind the orange cloud, rate limits see Cloudflare's IPs unless you
also restore the client IP.

### 2. Configuration

```bash
cp .env.production.example .env.production
nano .env.production        # every CHANGE_ME, the domains, the owner account
chmod 600 .env.production
```

Generate secrets with `openssl rand -base64 48` (and `openssl rand -base64 32` for
`FIELD_ENCRYPTION_KEY`). **Store `FIELD_ENCRYPTION_KEY` and `FIELD_HASH_KEY` in a password
manager**: passport numbers and CINs in the database and in every backup are unreadable
without them.

### 3. First start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
# Riad, roles, rooms, categories, TVA 10 % and the owner account (no demo data):
docker compose -f docker-compose.prod.yml --env-file .env.production exec api npx tsx prisma/seed.ts
```

The API applies database migrations on every start. Then sign in at
`https://riad.example.com/fr/login` as the owner, change the password (key icon), remove
`SEED_OWNER_PASSWORD` from `.env.production`, and in **Paramètres** fill in the legal IDs,
Wi-Fi and logo; in **Taxes** enter the rates validated by the accountant; in **Chambres**
rename the rooms and print the QR codes; in **Utilisateurs** create the staff accounts.

### 4. Updates

```bash
cd /opt/riad && git pull
cd deploy
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backup once
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### 5. Backups

**What**: every night at `BACKUP_HOUR` (03:00 Marrakech) the `backup` service
(`deploy/backup`) saves the database (`pg_dump`) and **every stored file**, object by object
(passport photos, receipts, contracts, invoices, logo — restorable into MinIO or R2).

**Where — 3 copies, 2 providers, 1 off the server**:

1. on the server, `deploy/backups/` — kept `BACKUP_KEEP_DAYS` (14);
2. **off the server**, on another provider (Cloudflare R2 recommended: free up to 10 GB, no
   download fees for restores) — daily copies kept `BACKUP_REMOTE_KEEP_DAYS` (30), copies of
   the 1st of each month kept `BACKUP_REMOTE_KEEP_MONTHS` (12);
3. the VPS provider's own weekly snapshots (turn them on in its panel).

Everything leaving the server is **encrypted** (AES-256, `BACKUP_PASSPHRASE`): the storage
provider cannot read guest data.

**Set up** (once): create an R2 bucket and an API token with read & write on it, fill the
`BACKUP_*` lines of `.env.production`, then `docker compose ... up -d --build backup` and
check **Settings → Backups** after a minute: "copied off the server · encrypted".

**Watch**: Settings → Backups (owner) shows the last good backup, the history and **Back up
now**. The owner gets a red notification when a backup fails, and every day while the last
good one is older than 26 h. Each run is in the `backup_runs` table.

**Restore** — the name is the stamp shown under each backup in Settings (or `latest`):

```bash
cd /opt/riad/deploy
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'
dc --profile restore run --rm restore list                       # what can be restored
dc --profile restore run --rm restore latest --into riad_check   # TEST: into a spare database
dc stop api web                                                  # REAL restore: stop the app,
dc --profile restore run --rm restore 2026-10-31_030000 --yes    # replace database + files,
dc start api web                                                 # start again
```

Add `--offsite` to fetch from off-site storage (a new server after a crash: install the
stack with the same `.env.production`, then restore with `--offsite --yes`), `--db-only`
to leave the files alone. A test restore never touches the live data; a real one refuses to
run without `--yes`. Drop a test database afterwards:
`dc exec postgres dropdb -U riad riad_check`.

**Owner checklist**

- [ ] Keep `BACKUP_PASSPHRASE`, `FIELD_ENCRYPTION_KEY` and the R2 keys **off the server**: in
      a password manager **and** on paper in a safe. Without the passphrase no backup can be
      read; without the field key passport and CIN numbers stay unreadable.
- [ ] Turn on the VPS provider's weekly snapshots.
- [ ] Once a month: a test restore (`--into riad_check`) and a look at Settings → Backups.
- [ ] Before every upgrade: `dc run --rm backup once`.

Locally: `docker compose --profile backup up -d --build backup` runs the same service, with
the local MinIO standing in for the off-server storage (bucket `riad-offsite-test`, create it
first).

### Notes

- **Time zone**: dates use the runtime's tz database. Morocco moved to permanent UTC+0 on
  20 Sept 2026 (tzdata 2026c). The images use `node:24-bookworm-slim`; check the API log
  after a deploy — it warns at start-up if Node's tz data is older (rebuild on a newer Node
  image then).
- **Storage**: MinIO runs in the stack; signed links (5 min) go through
  `FILES_DOMAIN`. To use Cloudflare R2 instead, drop the `minio*` services and set
  `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (no `S3_PUBLIC_ENDPOINT` needed).
- **OCR**: Tesseract downloads its English model once into the `ocrcache` volume (needs
  outbound HTTPS on first passport scan). With `GOOGLE_VISION_API_KEY`, passport images are
  sent to Google: mention it in the privacy notice.
- **Health**: `GET /api/v1/health` (used by the container health check; point an uptime
  monitor at it).
- **Internal API address**: the web image routes `/api/v1/*` to `http://api:4000` (the
  compose service name). Next.js bakes that address in at build time, so changing
  `API_INTERNAL_URL` needs a rebuild, not just a restart.
- **Before go-live**: consent text and CNDP declaration (lawyer), tax rates (accountant),
  backups copied off the server and one test restore (see 5).
