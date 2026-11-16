/**
 * POST /api/promote-batch
 *
 * Promotes the next N highest-scoring businesses (score >= min_score)
 * that are not yet in the pipeline. Defaults: min_score=60, limit=10.
 *
 * Body: { min_score?: number, limit?: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const minScore = Number((body as { min_score?: unknown }).min_score ?? 60);
  const limit = Math.min(Number((body as { limit?: unknown }).limit ?? 10), 50);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Get business_ids already in the pipeline
  const { data: existingLeads } = await supabase
    .from("leads")
    .select("business_id");

  const promotedIds = new Set((existingLeads ?? []).map((l: { business_id: string }) => l.business_id));

  // Get top-scoring businesses not yet promoted
  const { data: scores, error: scoresErr } = await supabase
    .from("opportunity_scores")
    .select("business_id, total")
    .gte("total", minScore)
    .order("total", { ascending: false })
    .limit(limit + promotedIds.size); // fetch extra to account for already-promoted

  if (scoresErr) {
    return NextResponse.json({ error: scoresErr.message }, { status: 500 });
  }

  const candidates = (scores ?? [])
    .filter((s: { business_id: string; total: number }) => !promotedIds.has(s.business_id))
    .slice(0, limit);

  if (candidates.length === 0) {
    return NextResponse.json({ promoted: 0 });
  }

  const rows = candidates.map((s: { business_id: string }) => ({
    business_id: s.business_id,
    stage: "new",
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("leads")
    .insert(rows)
    .select("id");

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ promoted: (inserted ?? []).length });
}
