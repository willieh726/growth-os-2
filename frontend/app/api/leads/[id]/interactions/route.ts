/**
 * POST /api/leads/:id/interactions — add a note or other interaction
 *
 * Uses service role key to bypass RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { type, subject, occurred_at } = body as {
    type?: string;
    subject?: string;
    occurred_at?: string;
  };

  if (!type) {
    return NextResponse.json({ error: "type required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { error } = await supabase.from("interactions").insert({
    lead_id: id,
    type,
    subject: subject ?? null,
    occurred_at: occurred_at ?? new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
