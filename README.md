# Personal CRM with AI Memory

A local-first personal CRM that turns the messy reality of relationship
management — "when did I last talk to Sam? What did we talk about? Is their
birthday coming up? What should I say to follow up?" — into a small, fast,
searchable timeline with AI-assisted follow-up drafts and a "last talked
about" recap.

Manual contact CRUD + manual interaction logging + a per-contact memory
timeline + LLM-generated follow-up suggestions + birthday/milestone alerts.
No Gmail/Slack/Calendar ingestion yet (that's the stretch goal — see
"What I'd do differently" below).

---

## Features

- **Manual contact CRUD** — name, email, phone, company, role, birthday,
  notes, comma-separated tags. Tag filter + free-text search in the left
  rail.
- **Manual interaction logging** — type (`meeting` / `call` / `email` /
  `note` / `other`), free-text summary, timestamp. Each interaction is one
  card in the timeline.
- **Per-contact memory timeline** — chronological feed of interactions,
  newest first, with type badge + timestamp + delete.
- **AI follow-up suggestions** — pick a tone preset (casual / formal /
  warm), click **Generate follow-up**, get 2-3 draft variations persisted
  to the `FollowUpDraft` table. The prompt carries the contact's full
  profile + their 5 most recent interactions + a register-matching tone
  example.
- **"Last talked about" recap** — a pure-function `summarizeInteractions`
  path returns top-K keywords (BM25-style term frequency over tokenized
  summaries) + a 1-sentence summary + the date range. Toggle on "Use LLM
  narrative" to additionally run hybrid (BM25 + hashing-vector) retrieval
  over date-bucketed interaction chunks and feed the most relevant days to
  the LLM for a grounded 2-3 sentence narrative.
- **Birthday + milestone alerts** — pure functions `upcomingBirthdays`
  (next 30 days) and `nextMilestone` (next round number 10 / 25 / 50 /
  100 / 150 / ...). Surfaced in the left rail (compact) and the right
  dashboard (full).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, RSC, Route Handlers) |
| Language | **TypeScript 5** (strict) |
| Styling | **Tailwind CSS 4** + **shadcn/ui** (New York style) + lucide-react |
| Database | **Prisma 6** + **SQLite** (local file at `./db/custom.db`) |
| LLM | **z-ai-web-dev-sdk** (non-streaming `chat.completions.create` for drafts + recap narrative) |
| Embeddings | pluggable — deterministic hashing-embedder by default, OpenAI-compatible endpoint when `EMBEDDINGS_API_KEY` is set |
| Retrieval | BM25 + vector cosine + **Reciprocal Rank Fusion** (RRF) |
| Tests | **bun test** (35+ unit tests across 9 modules) |
| Lint | `eslint-config-next` |

---

## Architecture

```
                                ┌─────────────────────────────────────────────┐
                                │                  Browser (RSC + client)       │
                                │                                              │
                                │   /  (src/app/page.tsx — single 3-col page)   │
                                │   ┌──────────┬───────────────┬─────────────┐  │
                                │   │ LEFT     │ CENTER        │ RIGHT       │  │
                                │   │ alerts + │ contact detail│ dashboard   │  │
                                │   │ contact  │ + timeline    │ + recap     │  │
                                │   │ list     │ + follow-ups  │ panel       │  │
                                │   └────┬─────┴───────┬───────┴──────┬──────┘  │
                                │        │            │              │         │
                                └────────┼────────────┼──────────────┼─────────┘
                                         │            │              │
                                         ▼            ▼              ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                       Next.js Route Handlers (/api)                       │
   │  contacts  contacts/[id]  interactions  follow-up  recap  alerts          │
   └─────────┬───────────────────┬──────────────────────┬──────────────────┬┘
             │                   │                      │                  │
             ▼                   ▼                      ▼                  ▼
   ┌──────────────┐    ┌──────────────────┐   ┌─────────────────┐  ┌──────────────┐
   │ Prisma 6     │    │ src/lib/ai.ts     │   │ src/lib/recap.ts│  │ src/lib/     │
   │ SQLite       │    │  ChatProvider     │   │  summarize()    │  │ alerts.ts    │
   │              │    │  generateDrafts() │   │  retrieve()     │  │  upcoming    │
   │ Contact      │    └────────┬─────────┘   └────────┬────────┘  │  nextMile    │
   │ Interaction  │             │                      │           └──────────────┘
   │ FollowUpDraft│             │                      │
   │ ChatSession  │             ▼                      ▼
   │ ChatMessage  │    ┌──────────────────────────────────────┐
   └──────────────┘    │ z-ai-web-dev-sdk (LLM)  OR  Mock     │
                       │                                      │
                       │ src/lib/{chunker, bm25, embeddings,  │
                       │ hybrid-search, tokenizer, tone-      │
                       │ presets} — pure, unit-tested          │
                       └──────────────────────────────────────┘
```

The whole AI + retrieval stack (`chunker`, `tokenizer`, `embeddings`,
`bm25`, `hybrid-search`, `recap`, `alerts`, `ai`, `tone-presets`) is pure
or provider-pluggable, so it runs identically in `bun test` (with the
deterministic hashing embedder + mock LLM) and in production (with the
real SDK).

---

## Setup

```bash
# 1. Install deps (bun preferred; npm/yarn/pnpm also work)
bun install

# 2. Push the Prisma schema to the local SQLite file
#    (the script inlines DATABASE_URL="$(pwd)/db/custom.db" so you can
#     run it from anywhere — the .env file pins the absolute path for the
#     Next.js server runtime)
bun run db:push

# 3. Generate the Prisma client
bun run db:generate

# 4. Run the unit tests
bun test

# 5. Start the dev server
bun run dev
#    -> open http://localhost:3000
```

The first time you load `/` with an empty database you'll see an empty
contact list. Click **New Contact** in the header to add one, then **Log
interaction** on the contact to populate the timeline. **Generate
follow-up** and **Recap** light up once you have at least one
interaction (though follow-up also works as a cold-outreach draft when
there are zero interactions).

---

## Tests

```bash
bun test
```

35+ unit tests across 9 modules — every pure function has its own
`*.test.ts`:

| File | Covers |
|---|---|
| `tokenizer.test.ts` | lowercase / markdown-strip / stop-word / CJK / URL handling |
| `chunker.test.ts` | interaction-by-date grouping, sorting, invalid-date drop, recentChunks |
| `embeddings.test.ts` | hashing-embed determinism, L2 norm, cosine ordering, serialize round-trip |
| `bm25.test.ts` | ranking, IDF weighting, topK, empty-corpus edge cases |
| `hybrid-search.test.ts` | Reciprocal Rank Fusion, fuseHits, k/topK parameters |
| `ai.test.ts` | `generateFollowUpPrompt` includes contact info + recent interactions + tone; `generateDrafts` calls the provider N times; mock provider |
| `recap.test.ts` | `summarizeInteractions` keyword frequency, dedup, topK, date range, summary fallback; `retrieveRelevantChunks` hybrid retrieval + recent fallback |
| `alerts.test.ts` | `upcomingBirthdays` (boundary, sort, turningAge, ISO string), `nextMilestone` (10/25/50/100/150/...), `buildMilestoneAlerts` |
| `tone-presets.test.ts` | every preset has systemPrompt + example; casual/formal/warm defined; fallback to default |

---

## Environment variables

See `.env.example`.

| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | `file:.../db/custom.db` | Absolute path to the SQLite file. The `db:push` / `db:generate` npm scripts override this inline with `$(pwd)/db/custom.db` so they work from any CWD. |
| `CRM_DISABLE_LLM` | no | unset | `1` forces the mock LLM (deterministic drafts + recap narrative) even when the SDK config is present. Useful for offline demos. |
| `EMBEDDINGS_API_KEY` | no | unset | If set, the embeddings provider calls an OpenAI-compatible endpoint. Otherwise the deterministic hashing embedder is used (zero network, zero cost). |
| `EMBEDDINGS_BASE_URL` | no | `https://api.openai.com/v1` | OpenAI-compatible base URL. |
| `EMBEDDINGS_MODEL` | no | `text-embedding-3-small` | Model name passed to the embeddings endpoint. |

---

## Project structure

```
19-personal-crm-ai-memory/
├── prisma/
│   └── schema.prisma              # Contact, Interaction, FollowUpDraft, ChatSession, ChatMessage
├── db/
│   └── custom.db                  # SQLite file (created by `bun run db:push`)
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Geist fonts + Toaster
│   │   ├── page.tsx               # 3-column client page (alerts+list | detail+timeline+drafts | dashboard+recap)
│   │   ├── globals.css            # Tailwind 4 + shadcn tokens + thin-scrollbar
│   │   └── api/
│   │       ├── contacts/
│   │       │   ├── route.ts                       # GET (list, ?q, ?tag) + POST (create)
│   │       │   └── [id]/
│   │       │       ├── route.ts                   # GET (detail) + PATCH + DELETE
│   │       │       ├── interactions/route.ts      # POST (log) + GET (list)
│   │       │       ├── follow-up/route.ts        # POST (generate drafts)
│   │       │       └── recap/route.ts            # POST (pure + optional LLM narrative)
│   │       ├── interactions/[id]/route.ts        # DELETE
│   │       └── alerts/route.ts                   # GET (birthdays + milestones)
│   ├── components/ui/             # shadcn/ui (button, card, input, label, textarea,
│   │                              #   badge, select, dialog, tabs, scroll-area,
│   │                              #   separator, avatar, skeleton, toast, toaster, sonner)
│   ├── hooks/
│   │   └── use-toast.ts
│   └── lib/
│       ├── db.ts                  # Prisma client singleton
│       ├── utils.ts               # cn() helper
│       ├── tokenizer.ts          # lowercase / markdown-strip / CJK / stop-words
│       ├── chunker.ts             # split interactions by date (recap retrieval unit)
│       ├── embeddings.ts          # hashing embedder + OpenAI-compatible provider
│       ├── bm25.ts                # in-memory Okapi BM25
│       ├── hybrid-search.ts       # Reciprocal Rank Fusion
│       ├── ai.ts                  # ChatProvider + generateFollowUpPrompt + generateDrafts
│       ├── tone-presets.ts        # casual / formal / warm (systemPrompt + example each)
│       ├── recap.ts              # summarizeInteractions + retrieveRelevantChunks
│       ├── alerts.ts             # upcomingBirthdays + nextMilestone + buildMilestoneAlerts
│       └── __tests__/            # 9 *.test.ts files (bun:test)
├── .env                           # DATABASE_URL (absolute)
├── .env.example
├── .gitignore
├── package.json                   # db: scripts inline DATABASE_URL="$(pwd)/db/custom.db"
├── tsconfig.json                  # @/* -> ./src/*
├── next.config.ts
├── postcss.config.mjs
├── tailwind.config.ts
├── components.json                # shadcn config
├── eslint.config.mjs
├── LICENSE                        # MIT
└── README.md
```

---

## Case study — the AI memory timeline + follow-up suggestions

### The problem

The thing a personal CRM is actually for is *not* storing names — it's
**remembering the through-line of a relationship**. The hard part of
"reach back out to Sam" isn't typing the email; it's recalling what you
last talked about, picking a register that matches the relationship, and
writing something that references a specific detail so the other person
feels like you were paying attention. Most CRMs store the raw interaction
log and stop there. The user still has to read the last 5 interactions,
mentally summarize, pick a tone, and draft — every single time.

### The design

This project turns that last-mile work into two clicks:

1. **The memory timeline** is just the interaction log, but it's the
   *center* of the contact detail view, not a side tab. Newest first, one
   card per interaction, type-badged, with the timestamp formatted as
   "Mar 15, 2026 at 2:00 PM". The whole point is that the user can
   *skim* it in 5 seconds before reaching for the follow-up button.

2. **The follow-up generator** builds a prompt that carries the full
   contact profile (name, email, phone, company, role, tags, notes) +
   the 5 most recent interactions + the tone preset's *example message*
   (not a template — a fully-written sample that teaches the model the
   register without giving it a structure to copy). It calls the
   provider 3 times with a per-call variation suffix ("variation #1 of
   3, make each meaningfully different"), persists each as a
   `FollowUpDraft` row, and shows them stacked. The user picks one,
   tweaks it, sends it.

3. **The "last talked about" recap** is the bit I'm most happy with. The
   *default* path is pure — `summarizeInteractions` tokenizes every
   interaction summary, ranks terms by frequency, returns the top-5
   keywords + a 1-sentence "You've mostly talked about X, Y, Z." + the
   date range. Zero network, zero cost, deterministic. But pure
   keyword-frequency misses *narrative* — "we kept coming back to the
   hiring plan across three different calls" is a sentence the keyword
   list can't produce. So the toggle turns on an LLM narrative that runs
   **hybrid retrieval** (BM25 + hashing-vector + RRF) over
   date-bucketed interaction chunks, surfaces the *most relevant* past
   day (not just the most recent), and asks the LLM to write a 2-3
   sentence recap grounded in that context. The retrieval query is the
   contact's profile (role + company + tags + notes) so the "relevant"
   surface is biased toward what matters for this person, not just what
   happened most recently.

### What I'd do differently (stretch goals)

This MVP is manual-only on purpose — the value is in the *AI layer over
the log*, not in the log itself. But a real personal CRM lives or dies
on ingestion:

- **Real Gmail / Slack ingestion via OAuth.** Manual logging is the
  death of every personal CRM — nobody keeps it up. The right move is a
  read-only OAuth scope on Gmail (per-contact message thread import) +
  Slack (per-channel DM import), deduped by sender email, auto-tagged
  `email` / `slack`. The `Interaction` table already supports arbitrary
  `type` strings, so this is a new ingestion worker + a `source`
  discriminator, not a schema change. The hard part is OAuth state
  management and thread pagination, not the CRM.
- **Real Resend integration.** Right now the user generates a draft,
  copies it, pastes it into Gmail. The right loop is: generate draft →
  click "send via Resend" → the draft is sent as a reply to the last
  logged email thread, and the *send itself* becomes a new `email`
  interaction in the timeline (closing the loop — no manual logging of
  the outreach). Resend's API is one `POST /emails` call; the hard part
  is thread-id tracking.
- **Real Clearbit / Apollo enrichment.** Company + role + birthday are
  the fields users most often skip when adding a contact manually. A
  "Enrich" button on the contact detail that takes the email and hits
  Clearbit's Person + Company endpoints (or Apollo's bulk enrichment)
  would backfill those fields automatically. Cost is ~$0.03/enrichment;
  worth it for the contacts you actually care about.
- **Calendar auto-blocking.** The birthday + milestone alerts are
  passive — they show up in the dashboard and the user has to act. The
  right move is a Google Calendar integration that, on a milestone
  approaching, auto-creates a 15-minute "reach back out to Sam"
  recurring task on the user's calendar with a link back to the
  contact's recap page. The alert becomes a *trigger*, not a *signal*.
- **Streaming follow-up drafts.** The current `complete()` is
  non-streaming (the drafts page waits for all 3 to finish). For a
  better UX, stream the first draft token-by-token and generate the
  remaining 2 lazily on a "more variations" click. The `ChatProvider`
  interface already supports adding a `stream()` method alongside
  `complete()` — the parent project this was adapted from ships a
  streaming `ZaiProvider`, so this is a known path.

### Resume bullet

> Built a local-first personal CRM (Next.js 16 + Prisma + SQLite) with an
> AI memory timeline: manual contact/interaction CRUD feeds a per-contact
> memory timeline, LLM-generated follow-up drafts across 3 tone presets,
> and a hybrid-retrieval "last talked about" recap (BM25 + hashing-vector
> + Reciprocal Rank Fusion over date-bucketed interactions). 35+ unit
> tests across 9 pure-function modules; the AI + retrieval stack runs
> identically against a deterministic mock in tests and the real LLM in
> production via a pluggable `ChatProvider`.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Push to GitHub

```bash
gh repo create personal-crm-ai-memory --public --source=. --remote=origin --push
```
