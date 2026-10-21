# NoCap

No cap, where every rupee went. A transparent expense tracker for Sparks Club (NMIT): every rupee
collected or spent is recorded with proof, visible to members, and can never be silently edited
or deleted.

**Current version: v0.3, bot logic and chat simulator.** Runs on localhost only, with no external integrations.

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
- The same UPI transaction ID can't be recorded twice (v0.3), whether from the form or from chat.
- The NoCap bot (v0.3), tried out in a WhatsApp-style **Chat simulator** before it goes on WhatsApp
  in v0.6:
  - In the class group it answers when tagged: `@NoCap who hasn't paid for freshers?`,
    `how much is left`, `how much was spent`, `my status`. Answers are fixed templates filled from
    the database, never made up.
  - In an admin's private chat, a payment screenshot (or `cash in 500 from Rahul Das`) is read back
    first; reply `1` to save it or `2` to fix the amount, name, direction or event.
  - When money is recorded for a member, the bot asks them in their private chat; `YES` confirms
    it, `NO` asks what's wrong and records a dispute.
  - Until the AI reader arrives in v0.5, the simulator's sample screenshots carry their payment
    details inside the PNG, and a mock reader reads those. Any other image counts as unreadable,
    and the bot asks for the details as text.
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

Open http://localhost:5173 and pick a person. Priya Nair is the treasurer (admin). The **Chat
simulator** link in the header (development only) opens the bot: start in the class group, or in
Priya's private chat to record a payment.

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
  src/models/     Member, Event, LedgerEntry, Verification, CashCount, AuditEvent, BotMessage
                  (all append-only); BotChat and BotPing hold the bot's conversation state
  src/services/   ledger totals, entries and corrections, verification, fees, cash, audit
  src/bot/        the bot engine: intents, reply templates, drafts, payment checks, screenshot reader
  src/routes/     auth, events, entries, members, me, activity, proofs, simulator (dev only)
  tests/          API and model tests
client/   React 19 + Vite app (React Router 7); src/sim/ draws the sample screenshots
e2e/      Playwright browser tests
```

## Environment

| Variable         | Default                           | Purpose                                  |
| ---------------- | --------------------------------- | ---------------------------------------- |
| `API_PORT`       | `4000`                            | API port                                 |
| `MONGODB_URI`    | `mongodb://localhost:27017/nocap` | Database                                 |
| `SESSION_SECRET` | dev-only value                    | Signs the login cookie; required in prod |
| `UPLOAD_DIR`     | `uploads` (inside `server/`)      | Where proof files are stored             |
