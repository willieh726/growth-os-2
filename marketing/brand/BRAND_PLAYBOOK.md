# SignalSync Brand & Presence Playbook

The operating manual for making SignalSync look established before outreach begins.
Everything here is lean-budget, enterprise-presentation. Work top to bottom in the
Execution Order at the end.

---

## 1. Brand Identity

### The core idea
The "signal" is a customer searching for help. Contractors are surrounded by signals
they can't hear — searches they don't show up for, calls they miss, reviews they never
ask for. **SignalSync hears the signal and syncs the business to it.** Every brand
choice reinforces: *we detect, we connect, you win.*

### Logo concepts (in priority order)
1. **The Beacon** — a solid dot with 2–3 concentric arcs radiating up-right (like a
   signal/radar mark), arcs in emerald on charcoal. Reads as "broadcast + growth"
   without any AI cliché. Works at favicon size.
2. **The Pulse-S** — a single waveform line (heartbeat/audio pulse) whose peaks trace
   an implied "S". Communicates liveness and measurement.
3. **Sync Bars** — three vertical rounded bars of increasing height (equalizer meets
   bar chart), the tallest tipped in emerald. Simplest to execute cleanly in Canva.

Avoid: robots, brains, circuit boards, hexagons, handshakes, swooshes.

### Color palette (already shipped on the site — stay consistent)
- **Charcoal** `#030712` (gray-950) — primary background, authority
- **Emerald** `#34D399` / deep `#10B981` — the accent; signal, growth, "go"
- **Off-white** `#F9FAFB` — text on dark, light-mode background
- **Slate** `#9CA3AF` — secondary text
- Rule: emerald is scarce. It marks CTAs, results, and the "Sync" in the wordmark —
  nothing else. Scarcity is what makes it feel premium.

### Typography (free, Google Fonts)
- **Headlines:** Space Grotesk (bold) — modern SaaS without being cold
- **Body/UI:** Inter — invisible workhorse, renders well everywhere
- Wordmark: "Signal" in off-white + "Sync" in emerald, Space Grotesk Bold, with the
  ⚡ or Beacon mark. This is already the de facto pattern on the site — formalize it.

### Brand personality
The plain-spoken operator. Measured claims, receipts for everything, zero jargon.
Sounds like a sharp local businessperson who happens to run serious software — not a
marketing agency, not a Silicon Valley pitch deck. House rules:
- Every number we state is one we measured.
- "You win first" appears somewhere on everything client-facing.
- We say "your phone rings more," never "omnichannel presence optimization."

### How we appear to SMB owners
Established, local-friendly, technical-but-translating. The premium feel comes from
restraint: lots of dark space, one accent color, short sentences, real screenshots of
real audits (redacted) instead of stock photos.

---

## 2. Email Identity

Signatures live in `email-signatures.html` (same folder) — three variants
(Founder / Sales / Support), table-based HTML that pastes cleanly into Gmail
(Settings → See all settings → Signature → paste). Text-based mark, no images —
image signatures break in dark mode, clip in mobile, and hurt cold-email
deliverability.

**Usage rules:**
- Founder signature: warm conversations, proposals, client emails.
- Sales signature: only AFTER a prospect replies. Cold/first-touch emails from the
  platform stay near-plain-text on purpose — heavy signatures scream "mass email"
  to spam filters during domain warm-up.
- Support signature: once support@ traffic is real.
- Fill the phone placeholder once there's a business number (see Execution Order —
  a free Google Voice number is fine to start).

---

## 3. Email Sending Infrastructure — current truth + what remains

### Already DONE (production, verified)
- **Outbound cold outreach:** `getsignalsync.com` via Resend — SPF, DKIM verified,
  DMARC published, inbound reply-routing live, warm-up automation running weekdays.
  This is deliberate architecture: cold email risk lives on the expendable domain,
  never the brand.
- **Inbound brand mail:** Namecheap forwarding on `signalsyncagency.com`
  (info@/sales@/support@/will@ → Gmail). Free, working.

### What the acronyms do (plain English)
- **SPF** — a DNS list of servers allowed to send as your domain. Receivers check it.
- **DKIM** — a cryptographic signature on each email proving it wasn't altered and
  really came from an authorized sender.
- **DMARC** — the policy that tells receivers what to do when SPF/DKIM fail
  (nothing / spam-folder it / reject it) and where to send reports.

### Do NOW: anti-spoofing armor on the brand domain

⚠️ CORRECTION (found via Search Console DNS readout): the domain ALREADY has an SPF
record that Namecheap created for email forwarding:
`v=spf1 include:spf.efwd.registrar-servers.com ~all`
**Do NOT add a second SPF record and do NOT replace it with `v=spf1 -all`** — two SPF
records is an automatic fail at every receiver, and `-all` would break forwarding.
Leave that record exactly as it is.

Add only DMARC, in Namecheap Advanced DNS:

| Type | Host    | Value                                                        | Purpose                        |
|------|---------|--------------------------------------------------------------|--------------------------------|
| TXT  | `_dmarc`| `v=DMARC1; p=quarantine; rua=mailto:will@signalsyncagency.com`| Spoofed mail → spam; reports to you |

Start at `p=quarantine` (not `reject`) while forwarding is in play — forwarded mail
can legitimately fail SPF checks, and quarantine avoids silently losing real mail.
Tighten to `p=reject` after moving to a real mailbox (below).

Note: adding OTHER TXT records (e.g. Google Search Console verification) is fine —
the one-per-domain rule applies only to SPF records.

### Do LATER (at first paying client): real mailbox
Buy **Google Workspace Starter** (~$7/mo) for `will@signalsyncagency.com` — real
sending, calendar invites, professional threading. Migration checklist:
1. Add Workspace's MX records in Namecheap (this REPLACES the forwarding MX — do all
   five in one sitting).
2. EDIT the existing SPF record (`v=spf1 include:spf.efwd.registrar-servers.com ~all`)
   to `v=spf1 include:_spf.google.com ~all` — edit it, never add a second one.
3. Add Google's DKIM record from the Workspace admin console.
4. Soften DMARC to `p=quarantine` for 2 weeks, then back to `p=reject`.
5. Send/receive test both directions before telling anyone the address.
Until then, replying from Gmail is fine — every prospect already has your Gmail
thread from the forward.

---

## 4. Public Presence

### Google Business Profile (business.google.com)
- **Name:** SignalSync  ·  **Type:** Service-area business (HIDE street address —
  it's a home address; you're Bay Area-based, so set it up with your real CA
  location hidden. Note: GBP service areas are meant to be local — since clients
  are remote/nationwide, the GBP is a trust checkpoint more than a lead source;
  LinkedIn + the website carry the "serving nationwide" story)
- **Primary category:** Marketing agency. Secondary: Website designer,
  Internet marketing service.
- **Description (use verbatim, 733 chars fits the 750 limit):**
  "SignalSync helps local contractors get found, get chosen, and get booked. We fix
  what's costing tree service, excavation, septic, and concrete businesses real jobs:
  invisible Google listings, missing or broken websites, unanswered calls, and review
  counts that don't reflect the quality of the work. Every engagement starts with a
  free written visibility audit — a plain-English report of where customers find you,
  where they don't, and the fixes that would win the most work. No contracts, month
  to month, and every claim we make is backed by something we measured. Built in the
  San Francisco Bay Area, working with contractors and local service businesses
  nationwide. If your phone doesn't ring more, fire us."
- **Services:** list the six from the website, outcome names first.
- **Photos needed:** logo (720×720 PNG), cover (1024×576 — the Beacon mark on
  charcoal with "We make your phone ring"), 2–3 "work" images (redacted audit
  screenshots, dashboard screenshot).
- **Verification:** usually video or postcard for service-area businesses; have the
  domain email set up first (done) — it strengthens the case.

### Social profiles (in priority order)
1. **LinkedIn company page** — credibility checkpoint when owners google you.
   Logo, banner (same as GBP cover), the description above, website link.
2. **Facebook business page** — contractors actually live here. Same assets. Post
   the audit-offer once; boost nothing yet.
3. **Instagram** — before/after website screenshots, audit snippets. Nice-to-have.
4. **X/Twitter** — skip. Your buyers aren't there; an empty account hurts more
   than no account.
Consistency rule: same logo, same one-liner ("We make your phone ring — digital
growth for contractors"), same domain email, same link everywhere.

---

## 5. Website Trust Signals Checklist

Already live: outcome-led homepage, pricing anchors, no-contract promise, real
service framing. Add, in order:
- [ ] Favicon + social share image (og:image) — the mark on charcoal
- [ ] **About page:** real name, real face, real story ("I grew up around the
      trades..."). For local SMBs a real human beats a fake team page 10-0.
- [ ] **Contact page:** domain email, phone number, service area map/town list
- [ ] Privacy policy + terms (free generator, footer links — quiet trust)
- [ ] **First case study** (after client #1), structure: *The problem in their
      words → what we measured → what we fixed → the numbers 60 days later →
      one-sentence quote.* One real case study outranks every badge.
- [ ] Audit sample page — a redacted real audit as the "free sample"
- Never: fake testimonials, stock-photo "teams", invented "as seen on" logos, fake
  countdown timers. One detected fake nukes all accumulated trust.

---

## 6. Execution Order (impact ÷ cost ÷ speed)

| # | Action                                            | Cost      | Time    |
|---|---------------------------------------------------|-----------|---------|
| 1 | Add DMARC TXT on brand domain (leave SPF alone)   | $0        | 5 min   |
| 2 | Gmail signatures installed (founder first)        | $0        | 15 min  |
| 3 | Logo: Beacon mark in Canva (or Fiverr ~$50)       | $0–50     | 1–2 hrs |
| 4 | Favicon + og:image on the website                 | $0        | 30 min  |
| 5 | Google Voice business number → signatures + site  | $0        | 20 min  |
| 6 | LinkedIn company page + Facebook business page    | $0        | 1 hr    |
| 7 | Google Business Profile + start verification      | $0        | 1 hr + wait |
| 8 | About page + contact page on site                 | $0        | 1 hr    |
| 9 | Privacy/terms pages                               | $0        | 30 min  |
| 10| First case study (unblocks after client #1)       | $0        | 2 hrs   |
| 11| Google Workspace mailbox (at first revenue)       | $7/mo     | 1 hr    |

Total cash to enterprise-looking: **$0–57.** Everything above the line before
Monday's calls: items 1, 2, 3, 5.
