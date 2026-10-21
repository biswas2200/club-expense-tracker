# NoCap

No cap, where every rupee went. A transparent expense tracker for Sparks Club (NMIT): every rupee
collected or spent is recorded with proof, visible to members, and can never be silently edited
or deleted.

**Current version: v0.2, verification and cash.** Runs on localhost only, with no external integrations.

## What it does

- Events with a budget, and a ledger of money in (fees, sponsorship) and money out (vendors).
- Every entry needs proof: a UPI screenshot, bill photo or receipt (JPG, PNG, WebP or PDF, up to 5 MB).
- The ledger is append-only. A mistake is fixed by adding a correction that points at the
  original; the original stays visible, marked as replaced. A correction with amount 0 voids a
  duplicate. Every version is shown in the entry's history.
- Totals per event: budget, collected, spent, left in budget, and balance in hand.
- Roles: admins add entries and corrections; members and the faculty viewer can see everything.
- Every entry is checked by the other party (v0.2): the member who paid confirms or disputes it from
  **My payments**; anything else is checked by an admin who did not record it. Nobody verifies their
  own entry.
- Cash can be recorded without a photo; it stays unverified until the member confirms or an admin
  attaches the bill. UPI entries still need the screenshot.
- Event fees: a fee per member, a paid / awaiting / disputed / unpaid list, and payments made on
  someone else's behalf.
- Cash counts: what the cash box should hold (cash in minus cash out) against what was counted.
- An activity log of every entry, correction, check and count, open to every member.
- Login is a local "pick a person" screen for development. Phone and PIN login arrives in v0.4.

## Run it

You need Node.js 22 or later and Docker.

```bash
npm install
cp .env.example .env      # only the first time
npm run db:up             # starts MongoDB 7 in Docker
npm run seed              # loads a demo club: 10 people, 2 events
npm run dev               # API on :4000, web app on http://localhost:5173
```

Open http://localhost:5173 and pick a person. Priya Nair is the treasurer (admin).

## Tests

The project is built test-first. Two suites:

```bash
npm test                  # unit + API tests (Vitest + Supertest, on the Docker MongoDB)
npm run test:e2e          # browser tests (Playwright), desktop and phone viewports
```

The browser tests start their own API on port 4100 and web app on 5174, against a separate
`nocap_e2e` database that is reset before each run, so they never touch your dev data.
The first time, install the browser with `npx playwright install chromium`.

Other checks: `npm run test:coverage`, `npm run typecheck`, `npm run lint`, `npm run format`.

## Layout

```
shared/   Types and money helpers used by both server and client (amounts are whole paise)
server/   Express 5 + Mongoose 8 API
  src/models/     Member, Event, LedgerEntry, Verification, CashCount, AuditEvent (all append-only)
  src/services/   ledger totals, entries and corrections, verification, fees, cash, audit
  src/routes/     auth, events, entries, members, me, activity, proofs
  tests/          API and model tests
client/   React 19 + Vite app (React Router 7)
e2e/      Playwright browser tests
```

## Environment

| Variable         | Default                           | Purpose                                  |
| ---------------- | --------------------------------- | ---------------------------------------- |
| `API_PORT`       | `4000`                            | API port                                 |
| `MONGODB_URI`    | `mongodb://localhost:27017/nocap` | Database                                 |
| `SESSION_SECRET` | dev-only value                    | Signs the login cookie; required in prod |
| `UPLOAD_DIR`     | `uploads` (inside `server/`)      | Where proof files are stored             |
