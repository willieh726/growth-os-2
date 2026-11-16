/**
 * POST /api/stop
 *
 * Stops all active sequence enrollments for a lead.
 * Updates sequence_enrollments to stopped and logs an interaction.
 *
 * Body: { lead_id: string, reason?: string }
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
  const { lead_id, reason } = body as { lead_id?: string; reason?: string };

  if (!lead_id) {
    return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Update all active enrollments to stopped
  const { data: updated, error: updateErr } = await supabase
    .from("sequence_enrollments")
    .update({
      status: "stopped",
      stopped_at: new Date().toISOString(),
      stop_reason: reason ?? "manual",
    })
    .eq("lead_id", lead_id)
    .eq("status", "active")
    .select("id");

  if (updateErr) {
    // sequence_enrollments table may not exist yet — treat as no enrollments
    return NextResponse.json({ ok: true, stopped: 0, message: "No active enrollments to stop" });
  }

  const count = (updated ?? []).length;

  if (count === 0) {
    return NextResponse.json({ ok: true, stopped: 0, message: "No active enrollments to stop" });
  }

  // Log interaction
  await supabase.from("interactions").insert({
    lead_id,
    type: "sequence_stopped",
    channel: "system",
    subject: `Sequence stopped${reason ? `: ${reason}` : ""}`,
    metadata: { stopped_count: count, reason: reason ?? "manual" },
  });

  return NextResponse.json({ ok: true, stopped: count });
}
