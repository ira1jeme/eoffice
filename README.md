# e-Office Management System — Phase 1 + Phase 2

An internal task and file movement management system: authentication with
role-based access, task creation/assignment/sub-assignment, a full
audit-grade movement timeline, a monitoring dashboard, leave management,
document/media uploads, in-app notifications, exportable reports, and a
system-wide audit log.

**Phase 1** (auth, tasks, assignment, sub-assignment, movement history,
dashboard, pending-task monitoring, basic user management) and **Phase 2**
(Leave Management, Documents/Media upload, Notifications, Reports, Audit
Log) are both included. Only the **e-Files module** (Section 17 of the
original spec — a separate file/dossier tracker conceptually parallel to
tasks) remains unbuilt.

> **Not tested end-to-end.** This code was written directly to spec but
> could not be run in the environment that produced it (no network access
> to install packages or start a Postgres instance). Do a careful first run
> following the steps below, and treat step 6 (smoke test) as mandatory
> before relying on this for real data. Please report anything that doesn't
> work as expected.

## Architecture

```
eoffice/
├── server/     Node.js + Express + TypeScript API, Prisma ORM, PostgreSQL
└── client/     React + TypeScript + Vite + Tailwind CSS SPA
```

- **Auth:** email/password, bcrypt hashing, JWT bearer tokens, password
  reset flow, rate-limited login, login/logout audit trail.
- **RBAC:** `SUPER_ADMIN`, `ADMIN` (Office Head), `STAFF`. Enforced both in
  API middleware and hidden/shown in the UI.
- **Tasks:** full lifecycle state machine (`NEW → ASSIGNED → ACKNOWLEDGED →
  IN_PROGRESS → (PENDING) → SUBMITTED → UNDER_REVIEW → COMPLETED → CLOSED`,
  with `RETURNED` as a correction loop). Invalid transitions are rejected
  server-side.
- **Sub-assignment:** any user with `canSubAssign = true` who is the
  current assignee (or any Admin) can sub-assign a task to someone else.
  Each assignment is a new row in `TaskAssignment`, so the full assignment
  chain is preserved — nothing is overwritten.
- **Movement history:** every state-changing action inserts an immutable
  row into `TaskMovement`. No application code updates or deletes these
  rows — it's an append-only log by construction.
- **Pending-task monitoring:** computed live from `TaskAssignment.createdAt`
  vs. now, bucketed into the 0–3 / 4–7 / 8–15 / 16–30 / 30+ day ranges
  from the spec.
- **Leave Management:** apply / approve / reject / cancel, with a
  validated state machine (`PENDING_APPROVAL → APPROVED/REJECTED`,
  cancellable before review). Dashboard shows staff on leave today.
- **Documents/Media:** generic `Attachment` model usable on either a Task
  or a LeaveRequest. Files are stored on local disk (`UPLOAD_DIR`),
  filtered by MIME type and size, and served only through an
  authenticated, access-checked download route — never as static files.
- **Notifications:** in-app only for now (no email/SMS transport wired
  up — see Roadmap). Created automatically on task assignment,
  sub-assignment, return, approval, and leave approval/rejection. The
  frontend polls every 60 seconds.
- **Reports:** Task, Staff-wise, Time-based, and Leave reports, each
  exportable as CSV, Excel (`.xlsx`, via `exceljs`), or PDF (via
  `pdfkit`), with an optional date range.
- **Audit Log:** system-wide, append-only, separate from task movement
  history. Captures login/logout, task lifecycle events, user management
  changes, and file uploads/downloads. Searchable by admins.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ (running locally, or a connection string to a hosted
  instance)

## Setup

### 1. Database

Create an empty database:

```bash
createdb eoffice
```

(Or use any Postgres client/GUI to create a database named `eoffice`, or
point at an existing one — you'll configure the connection string next.)

### 2. Backend

```bash
cd server
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — your Postgres connection string
- `JWT_SECRET` — replace with a long random string
  (e.g. `openssl rand -hex 32`)
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — demo admin login (change
  the password after first login in a real deployment)
- `UPLOAD_DIR` — where uploaded documents/media are stored (created
  automatically; defaults to `./uploads` inside `server/`)
- `MAX_UPLOAD_MB` — per-file upload size limit (default 25MB)

Install, generate the Prisma client, run migrations, and seed demo data:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

Start the API:

```bash
npm run dev
```

The API listens on `http://localhost:4000` (health check:
`GET /api/health`).

### 3. Frontend

In a second terminal:

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

### 4. Demo logins

Printed by the seed script, and also here for reference:

| Role        | Email                        | Password      |
|-------------|-------------------------------|----------------|
| Super Admin | admin@eoffice.local           | Admin@12345    |
| Admin (Office Head) | priya.sharma@eoffice.local | Staff@12345 |
| Staff       | rahul.verma@eoffice.local     | Staff@12345    |

(Four more staff accounts are seeded — see `server/prisma/seed.ts` for the
full list. All staff passwords are `Staff@12345`.)

**Change these before any real/shared deployment** — they're for local
evaluation only, per the "demo credentials" deliverable.

### 5. Useful commands

| Command (run in `server/`) | Purpose |
|---|---|
| `npm run studio` | Opens Prisma Studio — a GUI to browse/edit the database directly |
| `npm run prisma:migrate` | Create & apply a new migration after editing `schema.prisma` |
| `npm run build && npm start` | Production build/run |

### 6. Smoke test checklist

Since this hasn't been run in a live environment yet, before trusting it:

**Phase 1**
1. `npm run dev` (server) starts without errors and `GET /api/health`
   returns `{"status":"ok"}`.
2. Log in as the seeded admin from the frontend.
3. Dashboard loads with non-zero stat cards (seed data should populate
   these).
4. Create a task, assign it to a staff member.
5. Log in as that staff member, acknowledge → progress → submit the task.
6. Log in as admin/office head, approve (or return) the task, confirm the
   movement timeline shows every step in order.
7. If a staff member has "can sub-assign" enabled (Rahul Verma, in the
   seed data), confirm they can sub-assign a task they're holding.

**Phase 2**
8. As a staff member, apply for leave; confirm it shows under "My
   Requests".
9. As admin, switch to "All Staff" in Leave, approve or reject the
   request; confirm the applicant sees a notification (bell icon) and the
   status updates.
10. On a task detail page, upload a document; confirm it appears in the
    Documents list and can be downloaded.
11. As admin, open Reports and export each of the four reports in CSV,
    Excel, and PDF — confirm each downloads and opens correctly.
12. As admin, open Audit Log; confirm login events and the actions above
    (task creation, leave approval, file upload) appear.

## Roadmap (not yet built)

- **e-Files module** — a distinct `EFile` + `EFileMovement` model,
  conceptually parallel to tasks but for file/dossier tracking (Section
  17 of the original spec).
- **Email/SMS/WhatsApp notifications** — the `Notification` model and
  in-app delivery exist; wiring an actual transport (e.g. SMTP, Twilio)
  is listed under the brief's "Future Expansion" section.
- **Organizational hierarchy enforcement** — `Department` already supports
  a parent/child tree; task visibility currently checks only the
  immediate department, not the full subtree — worth revisiting once
  more departments are in real use.
- **OTP login, digital signatures, DSC integration, mobile app,
  e-Office noting sheets, document version control** — all explicitly
  deferred in the original brief's "Future Expansion" section.

## Security notes

- Passwords are hashed with bcrypt (never stored/logged in plaintext).
- JWT secret must be set via environment variable — the server refuses to
  start without one.
- Login and password-reset requests are rate-limited.
- All task/user/leave mutation routes are behind `requireAuth` +
  role/permission checks.
- File uploads are validated by MIME type and size; downloads are served
  through an authenticated route with per-file access checks (task
  participants/admins for task attachments, the applicant/admins for
  leave attachments) — never as static files directly off disk.
- Helmet sets standard security headers; CORS is restricted to
  `CLIENT_ORIGIN`.
- Input is validated with Zod on every write endpoint.
- The task movement trail and the system-wide audit log are both
  insert-only from the API surface — there is no update or delete route
  for either.

Before a real internal deployment, also add: HTTPS termination (reverse
proxy), a production-grade secrets manager (rather than a `.env` file),
antivirus/malware scanning on uploaded files, and off-server backup of
the `uploads/` directory alongside database backups.

#   e o f f i c e  
 