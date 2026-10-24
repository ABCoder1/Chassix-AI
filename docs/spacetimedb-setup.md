# SpaceTimeDB setup — live run-event layer

**What this is:** Chassix AI keeps its system of record in Postgres (ADR-D5). SpaceTimeDB (a
hackathon sponsor) is used **only** for the real-time run-monitoring layer (ADR-D8): the
orchestrator writes each run event to the authoritative Postgres log, then publishes it to a
SpaceTimeDB `run_event` table that browsers subscribe to for a low-latency live tail.

**What's already scaffolded in the repo (`apps/realtime`, `@chassix/realtime`):**

- `src/transport.ts` — `SpaceTimeDBEventTransport` implementing the shared `EventTransport` seam (drop-in replacement for the orchestrator's `InMemoryEventTransport`).
- `src/publisher.ts` — `connectionPublisher(conn)` (calls the `publish_run_event` reducer) + an in-memory fake for tests.
- `src/subscribe.ts` — `subscribeToRunEvents(conn, runId, onEvent)` (single-table live subscription).
- `module/run_events.ts` — reference **server module** (the `run_event` table + `publish_run_event` reducer).
- `examples/connection.example.ts` — reference **client wiring** (`DbConnection.builder()…`).

The compiled `src/` is binding-agnostic and fully tested without a host. The steps below produce the live host + generated bindings that wire it up.

---

## Your steps

### 1. Install the CLI

```bash
curl -sSf https://install.spacetimedb.com | sh     # macOS/Linux; see spacetimedb.com/install for Windows
spacetime --version
```

### 2. Pick a host

- **Cloud (fastest for the hackathon):** `spacetime login` (opens the browser; this is your sponsor account). Your server URI will be the SpaceTimeDB Maincloud `wss://` URL shown after login.
- **Self-host (local):** `spacetime start` — serves at `ws://localhost:3000`. (Add `--pg-port <n>` only if you also want its optional PGWire port; we do **not** use that — Postgres is separate.)

### 3. Create the module project and add our table/reducer

```bash
spacetime init --lang typescript chassix-realtime
cd chassix-realtime
```

Copy the table + reducer from `apps/realtime/module/run_events.ts` into the generated module's
entry file, reconciling the exact `spacetimedb/server` API shapes with what `init` scaffolded
(the decorator/helper names can shift by SDK version — the columns and the `publish_run_event`
reducer are what matter). Keep the table **public** so clients can subscribe.

### 4. Publish

```bash
spacetime publish chassix-realtime            # add --server <cloud-url> when using cloud
```

Note the module name/identity it prints.

### 5. Generate TypeScript client bindings into our repo

```bash
# from the module project:
spacetime generate --lang typescript --out-dir ../apps/realtime/src/module_bindings
```

Then move `apps/realtime/examples/connection.example.ts` into `apps/realtime/src/`, drop the
`// @ts-nocheck`, and fix the import to `./module_bindings`. It will now type-check against the
real generated `DbConnection` (our `transport`/`publisher`/`subscribe` already satisfy it).

### 6. Set env vars (add to `.env`, which is gitignored)

```bash
SPACETIME_URI=ws://localhost:3000          # or your Maincloud wss:// URL
SPACETIME_MODULE=chassix-realtime
SPACETIME_TOKEN=                            # optional OIDC JWT; blank = anonymous identity
```

### 7. Wire it into the orchestrator

In the run API wiring, replace the default `InMemoryEventTransport` with:

```ts
import { makeTransport } from "@chassix/realtime/examples/connection"; // after you move it into src/
const transport = await makeTransport({
  uri: process.env.SPACETIME_URI!,
  moduleName: process.env.SPACETIME_MODULE!,
  token: process.env.SPACETIME_TOKEN,
});
// pass `transport` where the orchestrator currently gets InMemoryEventTransport
```

The browser run-monitor then subscribes with `subscribeToRunEvents(conn, runId, …)` for the live
tail, and still uses the Postgres snapshot/replay endpoint for authoritative gap-free history.

---

## Notes / gotchas

- **Not our Postgres.** SpaceTimeDB is not a drop-in Postgres (no prepared statements/transactions over PGWire); Drizzle stays on Postgres. This layer is live events only.
- **Writes go through reducers** only — clients can't write tables directly; that's why publishing uses `publish_run_event`.
- **Subscriptions are single-table** — we subscribe to `run_event` filtered by `run_id`.
- **Auth:** for a real deployment, authorize `publish_run_event` against the caller `ctx.sender`'s workspace membership, and gate subscriptions with row-level security (experimental) or views.
- Versions move fast (currently SDK `spacetimedb@2.x`); if `init`/`generate` output differs from the references here, trust the generated output and adjust the reducer/table to match.
