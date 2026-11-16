/**
 * GET /api/dashboard
 *
 * Returns all stats for the dashboard page.
 * Uses service role key to bypass RLS.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    r0, r1, r2, r3, r4, r5, r6, r7, r8, r9
  ] = await Promise.all([
    supabase.from("businesses").select("*", { count: "exact", head: true }),
    supabase.from("businesses").select("*", { count: "exact", head: true }).eq("has_website", false),
    supabase.from("opportunity_scores").select("total"),
    supabase.from("leads").select("stage"),
    supabase.from("outreach_messages").select("*", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", since),
    supabase.from("interactions").select("*", { count: "exact", head: true }).eq("type", "reply").gte("occurred_at", since),
    supabase.from("sequence_enrollments").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("sequence_enrollments").select("*", { count: "exact", head: true }).eq("stop_reason", "reply"),
    supabase.from("businesses").select("id, industry"),
    supabase.from("opportunity_scores").select("business_id, total"),
  ]);

  const totalBusinesses = r0.count ?? 0;
  const noWebsite = r1.count ?? 0;
  const scores = r2.data;
  const leads = r3.data;
  const emailSent = r4.count ?? 0;
  const emailReplied = r5.count ?? 0;
  const sequencesActive = r6.error ? 0 : (r6.count ?? 0);
  const sequencesStopped = r7.error ? 0 : (r7.count ?? 0);
  const bizRows = r8.data;
  const scoreRows = r9.data;

  const allScores = (scores ?? []).map((r: { total: number }) => r.total);
  const hot = allScores.filter((t) => t >= 60).length;
  const avgScore = allScores.length
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : null;

  const pipeline: Record<string, number> = {};
  for (const l of leads ?? []) {
    const stage = (l as { stage: string }).stage;
    pipeline[stage] = (pipeline[stage] ?? 0) + 1;
  }

  const industryMap: Record<string, number> = {};
  const bizIndustry: Record<string, string> = {};
  for (const b of bizRows ?? []) {
    const row = b as { id: string; industry: string };
    const ind = row.industry ?? "unknown";
    industryMap[ind] = (industryMap[ind] ?? 0) + 1;
    bizIndustry[row.id] = ind;
  }

  const indScores: Record<string, number[]> = {};
  for (const r of scoreRows ?? []) {
    const row = r as { business_id: string; total: number };
    const ind = bizIndustry[row.business_id] ?? "unknown";
    if (!indScores[ind]) indScores[ind] = [];
    indScores[ind].push(row.total);
  }

  const byIndustry = Object.entries(industryMap)
    .map(([industry, n]) => ({
      industry,
      n,
      avg_score: indScores[industry]?.length
        ? Math.round(indScores[industry].reduce((a, b) => a + b, 0) / indScores[industry].length)
        : null,
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);

  return NextResponse.json({
    totalBusinesses: totalBusinesses ?? 0,
    noWebsite: noWebsite ?? 0,
    hot,
    avgScore,
    pipeline,
    emailSent: emailSent ?? 0,
    emailReplied: emailReplied ?? 0,
    sequencesActive: sequencesActive ?? 0,
    sequencesStopped: sequencesStopped ?? 0,
    byIndustry,
  });
}
