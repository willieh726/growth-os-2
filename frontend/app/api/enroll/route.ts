/**
 * POST /api/enroll
 *
 * Enrolls a lead in the outreach sequence.
 * Inserts into sequence_enrollments and logs an interaction.
 *
 * Body: { lead_id: string }
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
  const { lead_id } = body as { lead_id?: string };

  if (!lead_id) {
    return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Check if already enrolled and active
  const { data: existing } = await supabase
    .from("sequence_enrollments")
    .select("id, status")
    .eq("lead_id", lead_id)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Lead is already enrolled in an active sequence" }, { status: 409 });
  }

  // Insert enrollment
  const { data: enrollment, error: insertErr } = await supabase
    .from("sequence_enrollments")
    .insert({
      lead_id,
      status: "active",
      enrolled_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !enrollment) {
    return NextResponse.json({ error: insertErr?.message ?? "failed to enroll" }, { status: 500 });
  }

  // Log interaction
  await supabase.from("interactions").insert({
    lead_id,
    type: "sequence_enrolled",
    channel: "system",
    subject: "Enrolled in outreach sequence",
    metadata: { enrollment_id: enrollment.id },
  });

  return NextResponse.json({ ok: true, enrollment_id: enrollment.id });
}
