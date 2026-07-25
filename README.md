# Growth OS — AI Growth Platform for Contractors

Internal operating system for finding blue-collar businesses with weak digital presence, scoring them, and running AI-personalized outreach. Phase 1 verticals: tree service, excavation, septic, concrete. Rollout: CT → MA, RI, NY, NJ, PA, MD, VA, NC, SC.

## Architecture

```
Google Places API (New) ─┐
State registry CSVs ─────┤→ Ingestion pipeline → dedup (3-tier) → Supabase Postgres
                         │        ↓
                         │  Website analyzer → Opportunity Score (0–100, versioned)
                         │        ↓
Next.js dashboard  ←──  FastAPI  →  Claude (audits, emails, call scripts)
        ↑                 ↓  ↑
   public audit pages   Resend (send + inbound reply webhook → auto-stop sequences)
                          ↑
                   n8n (15-min follow-up cron, weekly ingestion sweep)
```

- `backend/` — FastAPI + asyncpg (raw SQL by design; queries are the product)
- `frontend/` — Next.js 14 + Tailwind; thin client over the API; `/a/[slug]` is the public audit page
- `supabase/migrations/` — run in order in the Supabase SQL editor (001 → 003)
- `n8n/` — importable workflow JSONs

## Setup (≈30 min)

1. **Supabase**: create project → SQL Editor → run `001_core.sql`, `002_crm.sql`, `003_audits_outreach.sql`.
2. **Env**: copy `.env.example` → `backend/.env`; fill `DATABASE_URL`, `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `INTERNAL_API_KEY`.
3. **Backend**: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`. Check `GET /health`.
4. **Frontend**: `cd frontend && npm install && npm run dev` with `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local`.
5. **Google Cloud**: enable **Places API (New)**, create a key. Cost control: set a daily quota; a full CT sweep of one industry (~50 cities) is roughly 2,500 Text Search Pro calls.
6. **Resend**: verify your sending domain (SPF/DKIM), enable **inbound** on the same domain, add webhook `POST {api}/webhooks/resend` for `email.received`, `email.bounced`, `email.opened`; put the svix secret in `RESEND_WEBHOOK_SECRET`. Inbound is what powers automatic reply-stop.
7. **n8n**: import both JSONs, set env vars `GROWTH_OS_API` and `GROWTH_OS_INTERNAL_KEY`, activate.
8. **Deploy**: backend → Railway (Dockerfile auto-detected, set env vars, `AUTH_DISABLED=false`); frontend → Vercel (root dir `frontend`).

## Daily operating loop

1. **Ingestion** page → start a run (or let the Monday n8n sweep do it). Businesses are fetched, deduped, crawled, scored.
2. **Businesses** page → filter score 60+ → "Promote all 60+ to pipeline".
3. **Lead detail** → Generate audit → Draft cold email (references the audit link) → Send, or Enroll in sequence for the automated 4-touch flow.
4. Replies hit the Resend webhook → sequence stops, stage moves to `replied`, it's in your Timeline.
5. **Dashboard** tracks reply rate — the metric that tunes everything else.

## Opportunity Score v1 (100 pts)

no website 25 · low reviews 15 · outdated site 15 · poor mobile 10 · weak GBP 10 · no contact form 10 · poor SEO 10 · no quote request 5. Weights live in `backend/app/services/scoring.py`, are versioned, and scores are append-only — re-tune freely once reply data accumulates.

## Deliberate limitations (upgrade paths noted in code)

- Background work runs in-process (`BackgroundTasks`); move `run_ingestion`/`process_due` to ARQ or Celery when volume demands it — signatures already take only IDs.
- Website analysis is static HTML (no headless browser). Covers ~95% of contractor sites.
- Email discovery: Places doesn't return emails; leads without an email get call scripts instead. Add a Hunter.io/Outscraper enrichment adapter when email coverage matters.
- Sending has no daily cap yet. Warm your domain: keep sends < 30/day for the first 2 weeks. Add a cap in `process_due` before scaling.

## Roadmap after Phase 1

Review management → AI phone answering → quoting/invoicing → website hosting for the sites you sell → payments. Same spine: every module hangs off `businesses`/`leads`/`interactions`, which is what makes this a Growth OS rather than a lead tool.
