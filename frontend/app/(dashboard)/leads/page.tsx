"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, Lead, STAGES, label, scoreColor } from "@/lib/api";

export default function Pipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stage, setStage] = useState("");
  /* Previously a failed request left this page showing "No leads in this
     stage." — the same message as a genuinely empty pipeline. During a
     backend outage that reads as "my leads were deleted". Never again:
     failure and emptiness must look different. */
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr("");
    api.get<Lead[]>(`/leads${stage ? `?stage=${stage}` : ""}`)
      .then(setLeads)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [stage]);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pipeline</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        <button onClick={() => setStage("")}
          className={`rounded-full px-3 py-1 ${!stage ? "bg-gray-900 text-white" : "border border-gray-300"}`}>
          All
        </button>
        {STAGES.map(s => (
          <button key={s} onClick={() => setStage(s)}
            className={`rounded-full px-3 py-1 ${stage === s ? "bg-gray-900 text-white" : "border border-gray-300"}`}>
            {label(s)}
          </button>
        ))}
      </div>
      {err && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-4">
          <p className="font-bold text-red-800">Couldn&apos;t load your pipeline</p>
          <p className="mt-1 text-sm text-red-700">
            This is a connection or server problem — <strong>your leads are not deleted.</strong>{" "}
            Retry in a moment; if it persists, check that the backend is running.
          </p>
          <p className="mt-2 font-mono text-xs text-red-600">{err}</p>
          <button onClick={load}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
            Retry
          </button>
        </div>
      )}

      {loading && !err && <p className="text-gray-400">Loading pipeline…</p>}

      <table className="w-full text-left text-sm">
        <thead><tr className="border-b text-gray-500">
          <th className="py-2">Score</th><th>Business</th><th>Stage</th>
          <th>Activity</th><th>Last touch</th></tr></thead>
        <tbody>
          {leads.map(l => (
            <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2">
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${scoreColor(l.opportunity_score)}`}>
                  {l.opportunity_score ?? "—"}
                </span>
              </td>
              <td>
                <Link href={`/leads/${l.id}`} className="font-medium text-blue-700 hover:underline">
                  {l.name}
                </Link>
                {l.likely_fake_listing && (
                  <span title="Name looks like a bare street address — possible fake/squatted listing. Verify on Google Maps before calling."
                    className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
                    ⚠️ verify
                  </span>
                )}
                <div className="text-xs text-gray-400">{label(l.industry)} · {l.city}, {l.state}</div>
              </td>
              <td><span className="rounded bg-gray-100 px-2 py-1 text-xs">{label(l.stage)}</span></td>
              <td>{l.interaction_count} events</td>
              <td className="text-gray-400">
                {l.last_activity_at ? new Date(l.last_activity_at).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && !err && leads.length === 0 && (
        <p className="py-6 text-center text-gray-400">
          No leads in this stage. Go to <strong>Businesses</strong> and press{" "}
          <strong>Promote next 10</strong> to fill your call queue.
        </p>
      )}
    </div>
  );
}
