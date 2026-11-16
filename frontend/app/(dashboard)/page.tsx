"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { label } from "@/lib/api";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Stats = {
  totalBusinesses: number;
  noWebsite: number;
  hot: number;
  avgScore: number | null;
  pipeline: Record<string, number>;
  emailSent: number;
  emailReplied: number;
  sequencesActive: number;
  sequencesStopped: number;
  byIndustry: { industry: string; n: number; avg_score: number | null }[];
};

function Card({ title, value, sub }: { title: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // Total businesses + no website count
        const { count: totalBusinesses } = await supabase
          .from("businesses")
          .select("*", { count: "exact", head: true });

        const { count: noWebsite } = await supabase
          .from("businesses")
          .select("*", { count: "exact", head: true })
          .eq("has_website", false);

        // Hot opportunities (score >= 60) + avg score
        const { data: scores } = await supabase
          .from("opportunity_scores")
          .select("total");

        const allScores = (scores ?? []).map((r: { total: number }) => r.total);
        const hot = allScores.filter((t) => t >= 60).length;
        const avgScore = allScores.length
          ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
          : null;

        // Pipeline counts by stage
        const { data: leads } = await supabase
          .from("leads")
          .select("stage");

        const pipeline: Record<string, number> = {};
        for (const l of leads ?? []) {
          const stage = (l as { stage: string }).stage;
          pipeline[stage] = (pipeline[stage] ?? 0) + 1;
        }

        // Email stats (last 30 days)
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count: emailSent } = await supabase
          .from("outreach_messages")
          .select("*", { count: "exact", head: true })
          .eq("status", "sent")
          .gte("sent_at", since);

        const { count: emailReplied } = await supabase
          .from("interactions")
          .select("*", { count: "exact", head: true })
          .eq("type", "reply")
          .gte("occurred_at", since);

        // Sequence stats
        const { count: sequencesActive } = await supabase
          .from("sequence_enrollments")
          .select("*", { count: "exact", head: true })
          .eq("status", "active");

        const { count: sequencesStopped } = await supabase
          .from("sequence_enrollments")
          .select("*", { count: "exact", head: true })
          .eq("stop_reason", "reply");

        // By industry (top 10)
        const { data: bizRows } = await supabase
          .from("businesses")
          .select("industry");

        const industryMap: Record<string, number> = {};
        for (const b of bizRows ?? []) {
          const ind = (b as { industry: string }).industry ?? "unknown";
          industryMap[ind] = (industryMap[ind] ?? 0) + 1;
        }

        // Get avg scores per industry from opportunity_scores join
        const { data: scoreRows } = await supabase
          .from("opportunity_scores")
          .select("total, businesses(industry)");

        const indScores: Record<string, number[]> = {};
        for (const r of scoreRows ?? []) {
          const row = r as { total: number; businesses: { industry: string } | null };
          const ind = row.businesses?.industry ?? "unknown";
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

        setS({
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
      } catch (e) {
        setErr(String(e));
      }
    })();
  }, []);

  if (err) return (
    <div className="rounded-lg border-2 border-red-400 bg-red-50 p-4">
      <p className="font-bold text-red-800">Dashboard failed to load</p>
      <p className="mt-1 font-mono text-xs text-red-600">{err}</p>
    </div>
  );
  if (!s) return <p className="text-gray-400">Loading…</p>;

  const replyRate = s.emailSent ? Math.round((s.emailReplied / s.emailSent) * 100) : 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card title="Businesses found" value={s.totalBusinesses.toLocaleString()} />
        <Card title="No website" value={s.noWebsite.toLocaleString()} sub="highest-value targets" />
        <Card title="Hot opportunities (60+)" value={s.hot} sub={`avg score ${s.avgScore ?? "—"}`} />
        <Card title="Reply rate (30d)" value={`${replyRate}%`} sub={`${s.emailSent} sent · ${s.emailReplied} replies`} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Pipeline</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(s.pipeline).map(([stage, n]) => (
            <div key={stage} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
              <span className="font-medium">{label(stage)}</span>
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs">{n}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">By industry</h2>
        <table className="w-full max-w-xl text-left text-sm">
          <thead><tr className="border-b text-gray-500">
            <th className="py-2">Industry</th><th>Businesses</th><th>Avg score</th>
          </tr></thead>
          <tbody>
            {s.byIndustry.map(r => (
              <tr key={r.industry} className="border-b border-gray-100">
                <td className="py-2">{label(r.industry)}</td>
                <td>{r.n}</td>
                <td>{r.avg_score ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="text-sm text-gray-500">
        Sequences: {s.sequencesActive} active · {s.sequencesStopped} auto-stopped by replies
      </section>
    </div>
  );
}
