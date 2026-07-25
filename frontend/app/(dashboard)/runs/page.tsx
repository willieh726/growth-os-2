"use client";
import { useEffect, useState } from "react";
import { api, INDUSTRIES, label } from "@/lib/api";

type Run = {
  id: string; source: string; industry: string | null; state: string | null;
  status: string; stats: Record<string, number>; created_at: string; error: string | null;
};

const STATES = ["CT","MA","RI","NY","NJ","PA","MD","VA","NC","SC"];

export default function Runs() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [industry, setIndustry] = useState("tree_service");
  const [state, setState] = useState("CT");
  const [busy, setBusy] = useState(false);

  const load = () => api.get<Run[]>("/ingestion/runs").then(setRuns);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const start = async () => {
    setBusy(true);
    try { await api.post("/ingestion/runs", { industry, state }); load(); }
    catch (e) { alert(String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ingestion</h1>
      <div className="flex items-end gap-3 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <label className="text-xs text-gray-500">Industry</label>
          <select value={industry} onChange={e => setIndustry(e.target.value)}
            className="block rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {INDUSTRIES.map(i => <option key={i} value={i}>{label(i)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">State</label>
          <select value={state} onChange={e => setState(e.target.value)}
            className="block rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {STATES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={start} disabled={busy}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
          {busy ? "Starting…" : "Start run"}
        </button>
      </div>

      <table className="w-full text-left text-sm">
        <thead><tr className="border-b text-gray-500">
          <th className="py-2">Started</th><th>Source</th><th>Industry</th><th>State</th>
          <th>Status</th><th>Stats</th></tr></thead>
        <tbody>
          {runs.map(r => (
            <tr key={r.id} className="border-b border-gray-100">
              <td className="py-2">{new Date(r.created_at).toLocaleString()}</td>
              <td>{r.source}</td>
              <td>{r.industry ? label(r.industry) : "—"}</td>
              <td>{r.state ?? "—"}</td>
              <td>
                <span className={`rounded px-2 py-1 text-xs ${
                  r.status === "completed" ? "bg-green-100 text-green-700" :
                  r.status === "failed" ? "bg-red-100 text-red-700" :
                  "bg-yellow-100 text-yellow-700"}`}>
                  {r.status}
                </span>
                {r.error && <span className="ml-2 text-xs text-red-500">{r.error}</span>}
              </td>
              <td className="font-mono text-xs">
                {Object.entries(r.stats || {}).map(([k, v]) => `${k}:${v}`).join(" ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
