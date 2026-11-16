/**
 * GET  /api/leads/:id — full lead detail with interactions
 * PATCH /api/leads/:id — update stage
 * POST  /api/leads/:id/interactions handled separately
 *
 * Uses service role key to bypass RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

function makeClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = makeClient();
  if (!supabase) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const { id } = params;

  const { data, error } = await supabase
    .from("leads")
    .select(`
      id, stage, business_id,
      businesses (
        name, industry, city, state, phone, email,
        website_url, has_website, gbp_rating, gbp_review_count
      ),
      opportunity_scores ( total, breakdown ),
      interactions ( id, type, subject, occurred_at )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: error ? 500 : 404 });
  }

  // Get likely_fake_listing from the businesses_scored view
  const b = (data.businesses as Record<string, unknown>) ?? {};
  let likelyFakeListing = false;
  const { data: scored } = await supabase
    .from("businesses_scored")
    .select("likely_fake_listing")
    .eq("id", data.business_id as string)
    .single();
  if (scored) likelyFakeListing = (scored as { likely_fake_listing: boolean }).likely_fake_listing;

  const s = Array.isArray(data.opportunity_scores)
    ? ((data.opportunity_scores[0] as Record<string, unknown>) ?? {})
    : ((data.opportunity_scores as Record<string, unknown>) ?? {});
  const interactions = Array.isArray(data.interactions)
    ? (data.interactions as Array<{ id: string; type: string; subject: string | null; occurred_at: string }>)
    : [];

  const lead = {
    id: data.id,
    business_id: data.business_id,
    stage: data.stage,
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
    last_activity_at: interactions[0]?.occurred_at ?? null,
    likely_fake_listing: likelyFakeListing,
    interactions,
  };

  return NextResponse.json(lead);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = makeClient();
  if (!supabase) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { stage } = body as { stage?: string };

  if (!stage) {
    return NextResponse.json({ error: "stage required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("leads")
    .update({ stage })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
