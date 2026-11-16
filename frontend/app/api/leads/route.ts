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
    .select(`
      id, stage, business_id, created_at,
      businesses (
        name, industry, city, state, phone, email,
        website_url, has_website, gbp_rating, gbp_review_count
      ),
      opportunity_scores ( total, breakdown ),
      interactions ( id )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (stage) q = q.eq("stage", stage);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also fetch likely_fake_listing from businesses_scored view
  const businessIds = (data ?? []).map((r: Record<string, unknown>) => r.business_id as string);
  let fakeMap: Record<string, boolean> = {};
  if (businessIds.length > 0) {
    const { data: scored } = await supabase
      .from("businesses_scored")
      .select("id, likely_fake_listing")
      .in("id", businessIds);
    if (scored) {
      for (const row of scored as { id: string; likely_fake_listing: boolean }[]) {
        fakeMap[row.id] = row.likely_fake_listing;
      }
    }
  }

  // Flatten into Lead shape
  const leads = (data ?? []).map((r: Record<string, unknown>) => {
    const b = (r.businesses as Record<string, unknown>) ?? {};
    const s = Array.isArray(r.opportunity_scores)
      ? ((r.opportunity_scores[0] as Record<string, unknown>) ?? {})
      : ((r.opportunity_scores as Record<string, unknown>) ?? {});
    const interactions = Array.isArray(r.interactions) ? r.interactions : [];
    return {
      id: r.id,
      business_id: r.business_id,
      stage: r.stage,
      name: b.name,
      industry: b.industry,
      city: b.city,
      state: b.state,
      phone: b.phone,
      contact_email: null,
      business_email: b.email,
      website_url: b.website_url,
      has_website: b.has_website,
      gbp_rating: b.gbp_rating,
      gbp_review_count: b.gbp_review_count,
      opportunity_score: (s.total as number | null) ?? null,
      score_breakdown: (s.breakdown as Record<string, unknown>) ?? null,
      interaction_count: interactions.length,
      last_activity_at: null,
      likely_fake_listing: fakeMap[r.business_id as string] ?? false,
    };
  });

  return NextResponse.json(leads);
}
