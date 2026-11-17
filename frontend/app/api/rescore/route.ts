/**
 * POST /api/rescore?limit=20
 *
 * Fetches unscored businesses from Supabase, crawls each website, scores them
 * using the same weights as the Python backend (WEIGHTS_VERSION v1), and writes
 * results to opportunity_scores.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY (server-side only) to bypass RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Weights (mirrors backend/app/services/scoring.py) ────────────────────────
const WEIGHTS_VERSION = "v1";
const MAX = {
  no_website: 25,
  outdated_website: 15,
  poor_mobile: 10,
  weak_gbp: 10,
  low_reviews: 15,
  no_contact_form: 10,
  no_quote_request: 5,
  poor_seo: 10,
} as const;

const QUOTE_RE =
  /free (estimate|quote)|request (a )?(quote|estimate)|get (a )?(quote|estimate)|schedule (service|now|online)|book (now|online)/i;

const BUILDER_HINTS: Record<string, string[]> = {
  wix: ["wix.com", "wixstatic", "wixsite"],
  godaddy: ["godaddy", "wsimg.com"],
  squarespace: ["squarespace"],
  weebly: ["weebly"],
  wordpress: ["wp-content", "wp-includes"],
  duda: ["dudaone", "duda.co"],
};

const SOCIAL_PREFIXES = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "yelp.com",
  "youtube.com",
];

function isSocialOnly(url: string | null): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return SOCIAL_PREFIXES.some((s) => lower.includes(s));
}

function currentYear(): number {
  return new Date().getFullYear();
}

// ── Site signals ──────────────────────────────────────────────────────────────
interface SiteSignals {
  url: string | null;
  reachable: boolean;
  statusCode: number | null;
  isHttps: boolean | null;
  hasViewportMeta: boolean | null;
  hasContactForm: boolean | null;
  hasQuoteCta: boolean | null;
  hasTitle: boolean | null;
  hasMetaDescription: boolean | null;
  hasH1: boolean | null;
  hasSchemaOrg: boolean | null;
  copyrightYear: number | null;
  detectedBuilder: string | null;
  loadMs: number | null;
  error: string | null;
}

async function analyzeWebsite(url: string | null): Promise<SiteSignals> {
  const blank: SiteSignals = {
    url,
    reachable: false,
    statusCode: null,
    isHttps: null,
    hasViewportMeta: null,
    hasContactForm: null,
    hasQuoteCta: null,
    hasTitle: null,
    hasMetaDescription: null,
    hasH1: null,
    hasSchemaOrg: null,
    copyrightYear: null,
    detectedBuilder: null,
    loadMs: null,
    error: null,
  };

  if (!url || isSocialOnly(url)) {
    return { ...blank, error: "no_real_website" };
  }

  const sig: SiteSignals = { ...blank };

  try {
    const t0 = Date.now();
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GrowthOS-Auditor/1.0; +https://signalsyncagency.com/bot)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    sig.loadMs = Date.now() - t0;
    sig.statusCode = resp.status;
    sig.isHttps = resp.url.startsWith("https://");

    // Bot-blocked (Cloudflare etc.) — site works for humans
    if ([401, 403, 405, 406, 409, 429].includes(resp.status)) {
      sig.reachable = true;
      sig.error = "bot_blocked";
      return sig;
    }

    sig.reachable = resp.status < 400;
    if (!sig.reachable) return sig;

    const html = await resp.text();

    // ── Parse with regex (no DOM parser in Node edge runtime) ────────────────
    const lower = html.toLowerCase();

    sig.hasViewportMeta = /name=["']viewport["']/i.test(html);
    sig.hasTitle = /<title[^>]*>[^<]+<\/title>/i.test(html);
    sig.hasMetaDescription =
      /name=["']description["'][^>]+content=["'][^"']+["']/i.test(html) ||
      /content=["'][^"']+["'][^>]+name=["']description["']/i.test(html);
    sig.hasH1 = /<h1[\s>]/i.test(html);
    sig.hasSchemaOrg = html.includes("schema.org");
    sig.hasContactForm =
      /<form[\s>]/i.test(html) ||
      /type=["']email["']/i.test(html);
    sig.hasQuoteCta = QUOTE_RE.test(html);

    // Copyright year
    const yearMatches = Array.from(
      html.matchAll(/(?:©|&copy;|copyright)\s*(20\d{2})/gi),
    ).map((m) => parseInt(m[1]));
    sig.copyrightYear =
      yearMatches.length > 0 ? Math.max(...yearMatches) : null;

    // Builder detection
    for (const [builder, hints] of Object.entries(BUILDER_HINTS)) {
      if (hints.some((h) => lower.includes(h))) {
        sig.detectedBuilder = builder;
        break;
      }
    }
  } catch (e: unknown) {
    sig.error = e instanceof Error ? e.constructor.name : "FetchError";
    sig.reachable = false;
  }

  return sig;
}

// ── Scoring (mirrors backend/app/services/scoring.py compute_score) ───────────
interface ScoreEntry {
  points: number;
  max: number;
  reason: string;
}

function computeScore(
  row: BusinessRow,
  site: SiteSignals
): [number, Record<string, ScoreEntry>] {
  const b: Record<string, ScoreEntry> = {};
  const noSite = !row.has_website || !site.reachable;
  const blocked = site.error === "bot_blocked";
  const UNKNOWN =
    "couldn't inspect (site blocks automated tools) — verify manually";

  // 1. No website
  if (noSite) {
    const reason = !row.has_website
      ? "No website at all"
      : `Website listed but unreachable (${site.error ?? site.statusCode})`;
    b.no_website = { points: MAX.no_website, max: MAX.no_website, reason };
  } else if (row.website_discovered) {
    b.no_website = {
      points: 10,
      max: MAX.no_website,
      reason:
        "Has a website, but it's NOT linked on their Google Business Profile — customers finding them on Maps never see it",
    };
  } else {
    b.no_website = {
      points: 0,
      max: MAX.no_website,
      reason: blocked
        ? "Has a website (blocked our inspection)"
        : "Has a working website",
    };
  }

  // 2. Outdated website
  let pts = 0;
  const reasons: string[] = [];
  if (!noSite && !blocked) {
    if (site.isHttps === false) {
      pts += 6;
      reasons.push("no HTTPS (browsers flag it 'Not Secure')");
    }
    if (site.copyrightYear && site.copyrightYear <= currentYear() - 3) {
      pts += 5;
      reasons.push(`copyright frozen at ${site.copyrightYear}`);
    }
    if (
      site.detectedBuilder &&
      ["wix", "godaddy", "weebly"].includes(site.detectedBuilder)
    ) {
      pts += 4;
      reasons.push(`legacy DIY builder (${site.detectedBuilder})`);
    }
  }
  b.outdated_website = {
    points: Math.min(pts, MAX.outdated_website),
    max: MAX.outdated_website,
    reason:
      reasons.join("; ") ||
      (noSite ? "n/a — no site" : blocked ? UNKNOWN : "Site looks current"),
  };

  // 3. Poor mobile
  if (noSite) {
    b.poor_mobile = { points: 0, max: MAX.poor_mobile, reason: "n/a — no site" };
  } else if (blocked) {
    b.poor_mobile = { points: 0, max: MAX.poor_mobile, reason: UNKNOWN };
  } else if (site.hasViewportMeta === false) {
    b.poor_mobile = {
      points: MAX.poor_mobile,
      max: MAX.poor_mobile,
      reason: "No viewport meta tag — site not mobile-responsive",
    };
  } else if ((site.loadMs ?? 0) > 6000) {
    b.poor_mobile = {
      points: 5,
      max: MAX.poor_mobile,
      reason: `Slow load (${site.loadMs}ms)`,
    };
  } else {
    b.poor_mobile = { points: 0, max: MAX.poor_mobile, reason: "Mobile-ready" };
  }

  // 4. Weak GBP
  pts = 0;
  const gbpReasons: string[] = [];
  if (row.gbp_rating == null) {
    pts += 5;
    gbpReasons.push("no rating (unclaimed or brand-new profile)");
  } else if (row.gbp_rating < 4.0) {
    pts += 4;
    gbpReasons.push(`rating ${row.gbp_rating} below 4.0`);
  }
  if ((row.gbp_photo_count ?? 0) < 3) {
    pts += 5;
    gbpReasons.push(`only ${row.gbp_photo_count ?? 0} photos on profile`);
  }
  b.weak_gbp = {
    points: Math.min(pts, MAX.weak_gbp),
    max: MAX.weak_gbp,
    reason: gbpReasons.join("; ") || "Healthy Google profile",
  };

  // 5. Low reviews — linear ramp: 0 reviews = full points, 25+ = 0
  const rc = row.gbp_review_count ?? 0;
  const reviewPts = Math.max(
    0,
    Math.round(MAX.low_reviews * (1 - Math.min(rc, 25) / 25))
  );
  b.low_reviews = {
    points: reviewPts,
    max: MAX.low_reviews,
    reason: `${rc} Google reviews${rc === 0 ? " — no reviews yet" : ""}`,
  };

  // 6 & 7. Contact form / quote request
  if (blocked) {
    b.no_contact_form = { points: 0, max: MAX.no_contact_form, reason: UNKNOWN };
    b.no_quote_request = { points: 0, max: MAX.no_quote_request, reason: UNKNOWN };
  } else {
    b.no_contact_form = {
      points: noSite || site.hasContactForm === false ? MAX.no_contact_form : 0,
      max: MAX.no_contact_form,
      reason:
        noSite || site.hasContactForm === false
          ? "No way to contact them online except calling"
          : "Has contact form",
    };
    b.no_quote_request = {
      points: noSite || site.hasQuoteCta === false ? MAX.no_quote_request : 0,
      max: MAX.no_quote_request,
      reason:
        noSite || site.hasQuoteCta === false
          ? "No online estimate/quote request — losing after-hours jobs"
          : "Has quote CTA",
    };
  }

  // 8. Poor SEO basics
  pts = 0;
  const seoReasons: string[] = [];
  if (noSite) {
    pts = MAX.poor_seo;
    seoReasons.push("no site to rank");
  } else if (blocked) {
    seoReasons.push(UNKNOWN);
  } else {
    if (!site.hasTitle) { pts += 3; seoReasons.push("missing <title>"); }
    if (!site.hasMetaDescription) { pts += 3; seoReasons.push("missing meta description"); }
    if (!site.hasH1) { pts += 2; seoReasons.push("missing H1"); }
    if (!site.hasSchemaOrg) { pts += 2; seoReasons.push("no LocalBusiness schema markup"); }
  }
  b.poor_seo = {
    points: Math.min(pts, MAX.poor_seo),
    max: MAX.poor_seo,
    reason: seoReasons.join("; ") || "SEO basics in place",
  };

  const total = Math.min(
    Object.values(b).reduce((sum, v) => sum + v.points, 0),
    100
  );
  return [total, b];
}

// ── Business row type ─────────────────────────────────────────────────────────
interface BusinessRow {
  id: string;
  website_url: string | null;
  has_website: boolean;
  gbp_rating: number | null;
  gbp_review_count: number | null;
  gbp_photo_count: number | null;
  website_discovered: boolean;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export const maxDuration = 60; // Vercel Pro: up to 300s; Hobby: 60s

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Missing Supabase env vars" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);

  // If specific IDs passed via header (from /api/ingest), score only those
  const idsHeader = req.headers.get("x-business-ids");
  if (idsHeader) {
    const ids = idsHeader.split(",").map((s) => s.trim()).filter(Boolean);
    const { data: businesses, error } = await supabase
      .from("businesses")
      .select("id, website_url, has_website, gbp_rating, gbp_review_count, gbp_photo_count, website_discovered")
      .in("id", ids);
    if (error || !businesses) {
      return NextResponse.json({ error: error?.message ?? "fetch failed" }, { status: 500 });
    }
    return scoreAndReturn(supabase, businesses as BusinessRow[]);
  }

  // Use PostgREST left-join to find businesses with no score row directly.
  // ?select=...&opportunity_scores(business_id)=is.null filters to unscored rows.
  const { data: businesses, error: bizFetchErr } = await supabase
    .from("businesses")
    .select("id, website_url, has_website, gbp_rating, gbp_review_count, gbp_photo_count, website_discovered, opportunity_scores!left(business_id)")
    .is("opportunity_scores.business_id", null)
    .order("id")
    .limit(limit);

  if (bizFetchErr) {
    // Fallback: manual two-pass if left-join syntax unsupported
    const { data: allBiz, error: fallbackErr } = await supabase
      .from("businesses")
      .select("id, website_url, has_website, gbp_rating, gbp_review_count, gbp_photo_count, website_discovered")
      .order("id")
      .limit(500);

    if (fallbackErr || !allBiz) {
      return NextResponse.json({ error: fallbackErr?.message ?? "fetch failed" }, { status: 500 });
    }

    const candidateIds = allBiz.map((b: BusinessRow) => b.id);
    const { data: alreadyScored } = await supabase
      .from("opportunity_scores")
      .select("business_id")
      .in("business_id", candidateIds);

    const scoredSet = new Set((alreadyScored ?? []).map((r: { business_id: string }) => r.business_id));
    const unscored = allBiz.filter((b: BusinessRow) => !scoredSet.has(b.id)).slice(0, limit);

    if (!unscored.length) {
      return NextResponse.json({ scored: 0, message: "No unscored businesses found" });
    }
    return scoreAndReturn(supabase, unscored as BusinessRow[]);
  }

  // Strip the joined opportunity_scores field before scoring
  const unscored = (businesses ?? []).map(({ opportunity_scores: _os, ...b }) => b) as BusinessRow[];

  if (!unscored.length) {
    return NextResponse.json({ scored: 0, message: "No unscored businesses found" });
  }

  return scoreAndReturn(supabase, unscored);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scoreAndReturn(
  supabase: ReturnType<typeof createClient<any, any, any>>,
  businesses: BusinessRow[]
) {
  if (businesses.length === 0) {
    return NextResponse.json({ scored: 0, message: "All businesses already scored" });
  }

  const results: Array<{ id: string; score: number; error?: string }> = [];

  for (const biz of businesses) {
    try {
      const site = await analyzeWebsite(biz.website_url);
      const [total, breakdown] = computeScore(biz, site);

      // Delete any existing score rows for this business then insert fresh.
      // opportunity_scores has no unique constraint on business_id (multiple
      // rows allowed), so we can't upsert. Delete + insert is the safe path.
      await supabase
        .from("opportunity_scores")
        .delete()
        .eq("business_id", biz.id);

      const { error: insertErr } = await supabase
        .from("opportunity_scores")
        .insert({
          business_id: biz.id,
          total,
          breakdown,
          weights_version: WEIGHTS_VERSION,
        });

      if (insertErr) {
        results.push({ id: biz.id, score: total, error: insertErr.message });
      } else {
        results.push({ id: biz.id, score: total });
      }
    } catch (e: unknown) {
      results.push({
        id: biz.id,
        score: 0,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  const succeeded = results.filter((r) => !r.error).length;
  return NextResponse.json({
    scored: succeeded,
    total_attempted: results.length,
    results,
  });
}
