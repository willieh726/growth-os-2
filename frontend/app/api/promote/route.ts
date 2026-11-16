/**
 * POST /api/promote
 *
 * Promotes a single business into the pipeline by inserting a lead row.
 * Idempotent — returns 409 if the business already has a lead.
 *
 * Body: { business_id: string }
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
  const { business_id } = body as { business_id?: string };

  if (!business_id) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Check if already in pipeline
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("business_id", business_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Business is already in the pipeline" }, { status: 409 });
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({ business_id, stage: "new" })
    .select("id")
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: error?.message ?? "failed to create lead" }, { status: 500 });
  }

  return NextResponse.json({ lead_id: lead.id });
}
