/**
 * GET /api/leads — list pipeline leads with business + score data
 *
 * Uses service role key to bypass RLS.
 * Query params:
 *   stage  — filter by stage string
 *   limit  — max rows (default 200)
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
  const stage = searchParams.get("stage") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let q = supabase
    .from("leads")
    .select("id, stage, business_id, promoted_at")
    .order("promoted_at", { ascending: false })
    .limit(limit);

  if (stage) q = q.eq("stage", stage);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const businessIds = rows.map((r: { business_id: string }) => r.business_id);
  const leadIds = rows.map((r: { id: string }) => r.id);

  // Fetch related data in parallel via explicit queries (no FK joins needed)
  const [
    { data: bizRows },
    { data: scoreRows },
    { data: scoredRows },
    { data: interactionRows },
  ] = await Promise.all([
    businessIds.length > 0
      ? supabase.from("businesses").select("id, name, industry, city, state, phone, email, website_url, has_website, gbp_rating, gbp_review_count").in("id", businessIds)
      : { data: [] },
    businessIds.length > 0
      ? supabase.from("opportunity_scores").select("business_id, total, breakdown").in("business_id", businessIds)
      : { data: [] },
    businessIds.length > 0
      ? supabase.from("businesses_scored").select("id, likely_fake_listing").in("id", businessIds)
      : { data: [] },
    leadIds.length > 0
      ? supabase.from("interactions").select("lead_id").in("lead_id", leadIds)
      : { data: [] },
  ]);

  // Build lookup maps
  type BizRow = { id: string; name: string; industry: string; city: string | null; state: string; phone: string | null; email: string | null; website_url: string | null; has_website: boolean; gbp_rating: number | null; gbp_review_count: number | null };
  type ScoreRow = { business_id: string; total: number; breakdown: Record<string, unknown> };
  type ScoredRow = { id: string; likely_fake_listing: boolean };
  type InteractionRow = { lead_id: string };

  const bizMap: Record<string, BizRow> = {};
  for (const b of (bizRows ?? []) as BizRow[]) bizMap[b.id] = b;

  const scoreMap: Record<string, ScoreRow> = {};
  for (const s of (scoreRows ?? []) as ScoreRow[]) scoreMap[s.business_id] = s;

  const fakeMap: Record<string, boolean> = {};
  for (const s of (scoredRows ?? []) as ScoredRow[]) fakeMap[s.id] = s.likely_fake_listing;

  const interactionCount: Record<string, number> = {};
  for (const i of (interactionRows ?? []) as InteractionRow[]) {
    interactionCount[i.lead_id] = (interactionCount[i.lead_id] ?? 0) + 1;
  }

  // Flatten into Lead shape
  const leads = rows.map((r: { id: string; business_id: string; stage: string; promoted_at: string }) => {
    const b = bizMap[r.business_id] ?? {} as BizRow;
    const s = scoreMap[r.business_id] ?? null;
    return {
      id: r.id,
      business_id: r.business_id,
      stage: r.stage,
      name: b.name ?? null,
      industry: b.industry ?? null,
      city: b.city ?? null,
      state: b.state ?? null,
      phone: b.phone ?? null,
      contact_email: null,
      business_email: b.email ?? null,
      website_url: b.website_url ?? null,
      has_website: b.has_website ?? false,
      gbp_rating: b.gbp_rating ?? null,
      gbp_review_count: b.gbp_review_count ?? null,
      opportunity_score: s?.total ?? null,
      score_breakdown: s?.breakdown ?? null,
      interaction_count: interactionCount[r.id] ?? 0,
      last_activity_at: null,
      likely_fake_listing: fakeMap[r.business_id] ?? false,
    };
  });

  return NextResponse.json(leads);
}
