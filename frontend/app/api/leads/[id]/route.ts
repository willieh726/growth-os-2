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

  const { data: leadRow, error } = await supabase
    .from("leads")
    .select("id, stage, business_id")
    .eq("id", id)
    .single();

  if (error || !leadRow) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: error ? 500 : 404 });
  }

  const bizId = leadRow.business_id as string;

  // Fetch related data in parallel (no FK joins — not in schema cache)
  const [
    { data: bizRow },
    { data: scoreRow },
    { data: scoredRow },
    { data: interactionRows },
  ] = await Promise.all([
    supabase.from("businesses").select("name, industry, city, state, phone, email, website_url, has_website, gbp_rating, gbp_review_count").eq("id", bizId).single(),
    supabase.from("opportunity_scores").select("total, breakdown").eq("business_id", bizId).maybeSingle(),
    supabase.from("businesses_scored").select("likely_fake_listing").eq("id", bizId).single(),
    supabase.from("interactions").select("id, type, subject, occurred_at").eq("lead_id", id).order("occurred_at", { ascending: false }),
  ]);

  type BizRow = { name: string; industry: string; city: string | null; state: string; phone: string | null; email: string | null; website_url: string | null; has_website: boolean; gbp_rating: number | null; gbp_review_count: number | null };
  const b = (bizRow as BizRow | null) ?? {} as BizRow;
  const s = scoreRow as { total: number; breakdown: Record<string, unknown> } | null;
  const likelyFakeListing = (scoredRow as { likely_fake_listing: boolean } | null)?.likely_fake_listing ?? false;
  const interactions = (interactionRows ?? []) as Array<{ id: string; type: string; subject: string | null; occurred_at: string }>;

  const lead = {
    id: leadRow.id,
    business_id: leadRow.business_id,
    stage: leadRow.stage,
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
