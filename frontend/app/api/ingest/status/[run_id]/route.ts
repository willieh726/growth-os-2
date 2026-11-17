/**
 * GET /api/ingest/status/[run_id]
 *
 * Returns the current status of an ingestion run.
 * Used by the frontend to poll until a run completes.
 *
 * Response: { id, status, stats, error, started_at, finished_at }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 10;

export async function GET(
  req: NextRequest,
  { params }: { params: { run_id: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const { run_id } = params;
  if (!run_id) {
    return NextResponse.json({ error: "run_id required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("ingestion_runs")
    .select("id, status, stats, error, started_at, finished_at, industry, state, cities")
    .eq("id", run_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "run not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
