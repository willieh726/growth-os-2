"use client";
import { useEffect, useState, useRef } from "react";
import { label } from "@/lib/api";

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
  const [rescoring, setRescoring] = useState(false);
  const [rescoreStatus, setRescoreStatus] = useState("");
  const stopRef = useRef(false);

  const loadStats = async () => {
    try {
      const r = await fetch("/api/dashboard");
      if (!r.ok) throw new Error(await r.text());
      setS(await r.json());
    } catch (e) {
      setErr(String(e));
    }
  };

  useEffect(() => { loadStats(); }, []);

  const runRescore = async () => {
    setRescoring(true);
    stopRef.current = false;
    let totalScored = 0;
    let lastId: string | null = null;

    try {
      while (!stopRef.current) {
        setRescoreStatus(`Scoring… ${totalScored} done`);
        const url = `/api/rescore?limit=20&force=true${lastId ? `&after=${lastId}` : ""}`;
        const r = await fetch(url, { method: "POST" });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json() as { scored: number; last_id?: string; done?: boolean; message?: string };
        totalScored += data.scored ?? 0;
        lastId = data.last_id ?? null;
        if (data.done || !lastId) {
          setRescoreStatus(`Done — ${totalScored} businesses scored`);
          break;
        }
        setRescoreStatus(`Scoring… ${totalScored} done`);
      }
      if (stopRef.current) setRescoreStatus(`Stopped at ${totalScored} scored`);
    } catch (e) {
      setRescoreStatus(`Error: ${String(e)}`);
    } finally {
      setRescoring(false);
      loadStats();
    }
  };

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-3">
          {rescoreStatus && (
            <span className="text-sm text-gray-500">{rescoreStatus}</span>
          )}
          {rescoring ? (
            <button
              onClick={() => { stopRef.current = true; }}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              Stop
            </button>
          ) : (
            <button
              onClick={runRescore}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
              Rescore all
            </button>
          )}
        </div>
      </div>
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
