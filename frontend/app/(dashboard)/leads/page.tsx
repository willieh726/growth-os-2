"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Lead, STAGES, label, scoreColor } from "@/lib/api";

export default function Pipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stage, setStage] = useState("");

  useEffect(() => {
    api.get<Lead[]>(`/leads${stage ? `?stage=${stage}` : ""}`).then(setLeads);
  }, [stage]);

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
      {leads.length === 0 && <p className="text-gray-400">No leads in this stage.</p>}
    </div>
  );
}
