"use client";
import { useEffect, useState } from "react";
import { api, label } from "@/lib/api";

type Stats = {
  businesses: { total: number; no_website: number; states: number };
  scoring: { hot: number; avg_score: number | null };
  pipeline: Record<string, number>;
  email_30d: { sent: number; opened: number; replied: number };
  sequences: { active: number; stopped_by_reply: number };
  by_industry: { industry: string; n: number; avg_score: number | null }[];
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
  useEffect(() => { api.get<Stats>("/stats/dashboard").then(setS).catch(e => setErr(String(e))); }, []);

  if (err) return <p className="text-red-600">API unreachable: {err}</p>;
  if (!s) return <p className="text-gray-400">Loading…</p>;

  const replyRate = s.email_30d.sent ? Math.round((s.email_30d.replied / s.email_30d.sent) * 100) : 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card title="Businesses found" value={s.businesses.total} sub={`${s.businesses.states} states`} />
        <Card title="No website" value={s.businesses.no_website} sub="highest-value targets" />
        <Card title="Hot opportunities (60+)" value={s.scoring.hot} sub={`avg score ${s.scoring.avg_score ?? "—"}`} />
        <Card title="Reply rate (30d)" value={`${replyRate}%`} sub={`${s.email_30d.sent} sent · ${s.email_30d.replied} replies`} />
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
            <th className="py-2">Industry</th><th>Businesses</th><th>Avg score</th></tr></thead>
          <tbody>
            {s.by_industry.map(r => (
              <tr key={r.industry} className="border-b border-gray-100">
                <td className="py-2">{label(r.industry)}</td>
                <td>{r.n}</td><td>{r.avg_score ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="text-sm text-gray-500">
        Sequences: {s.sequences.active} active · {s.sequences.stopped_by_reply} auto-stopped by replies
      </section>
    </div>
  );
}
