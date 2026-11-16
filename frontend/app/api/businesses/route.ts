/**
 * GET /api/businesses
 *
 * Returns paginated business list with opportunity scores.
 * Uses service role key to bypass RLS.
 *
 * Query params: industry, min_score, has_website (false), q, limit, offset
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const industry = searchParams.get("industry") ?? "";
  const minScore = Number(searchParams.get("min_score") ?? 0);
  const noSite = searchParams.get("has_website") === "false";
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Build query against businesses_scored view (has likely_fake_listing computed)
  let countQ = supabase
    .from("businesses_scored")
    .select("id", { count: "exact", head: true });

  let dataQ = supabase
    .from("businesses_scored")
    .select(`
      id, name, industry, city, state, phone, email,
      website_url, has_website, gbp_rating, gbp_review_count,
      business_status, likely_fake_listing,
      opportunity_score
    `)
    .order("opportunity_score", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (industry) {
    countQ = countQ.eq("industry", industry);
    dataQ = dataQ.eq("industry", industry);
  }
  if (noSite) {
    countQ = countQ.eq("has_website", false);
    dataQ = dataQ.eq("has_website", false);
  }
  if (q) {
    countQ = countQ.ilike("name", `%${q}%`);
    dataQ = dataQ.ilike("name", `%${q}%`);
  }
  if (minScore > 0) {
    countQ = countQ.gte("opportunity_score", minScore);
    dataQ = dataQ.gte("opportunity_score", minScore);
  }

  const [{ count, error: countErr }, { data, error: dataErr }] = await Promise.all([
    countQ,
    dataQ,
  ]);

  if (countErr || dataErr) {
    return NextResponse.json({ error: (countErr ?? dataErr)?.message }, { status: 500 });
  }

  return NextResponse.json({ total: count ?? 0, items: data ?? [] });
}
