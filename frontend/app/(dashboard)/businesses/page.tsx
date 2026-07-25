"use client";
import { useCallback, useEffect, useState } from "react";
import { api, Business, INDUSTRIES, label, scoreColor } from "@/lib/api";

export default function Businesses() {
  const [items, setItems] = useState<Business[]>([]);
  const [total, setTotal] = useState(0);
  const [industry, setIndustry] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [noSite, setNoSite] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (industry) p.set("industry", industry);
    if (minScore) p.set("min_score", String(minScore));
    if (noSite) p.set("has_website", "false");
    if (q) p.set("q", q);
    api.get<{ total: number; items: Business[] }>(`/businesses?${p}`)
      .then(r => { setItems(r.items); setTotal(r.total); });
  }, [industry, minScore, noSite, q]);

  useEffect(load, [load]);

  const promote = async (id: string) => {
    setBusy(id);
    try { await api.post("/leads", { business_id: id }); alert("Promoted to pipeline"); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Businesses <span className="text-base font-normal text-gray-400">({total})</span></h1>
        <button
          onClick={() => api.post("/leads/promote-batch?min_score=60").then(load)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
          Promote all with score ≥ 60
        </button>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name…"
          className="rounded-lg border border-gray-300 px-3 py-2" />
        <select value={industry} onChange={e => setIndustry(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2">
          <option value="">All industries</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{label(i)}</option>)}
        </select>
        <select value={minScore} onChange={e => setMinScore(Number(e.target.value))}
          className="rounded-lg border border-gray-300 px-3 py-2">
          <option value={0}>Any score</option>
          <option value={40}>40+</option><option value={60}>60+</option><option value={80}>80+</option>
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={noSite} onChange={e => setNoSite(e.target.checked)} />
          No website only
        </label>
      </div>

      <table className="w-full text-left text-sm">
        <thead><tr className="border-b text-gray-500">
          <th className="py-2">Score</th><th>Name</th><th>Industry</th><th>City</th>
          <th>Website</th><th>Reviews</th><th></th></tr></thead>
        <tbody>
          {items.map(b => (
            <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2">
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${scoreColor(b.opportunity_score)}`}>
                  {b.opportunity_score ?? "—"}
                </span>
              </td>
              <td className="font-medium">{b.name}</td>
              <td>{label(b.industry)}</td>
              <td>{b.city ?? "—"}, {b.state}</td>
              <td>{b.has_website
                ? <a className="text-blue-600 underline" href={b.website_url!} target="_blank">site</a>
                : <span className="font-semibold text-red-600">none</span>}</td>
              <td>{b.gbp_review_count ?? 0} ⭐{b.gbp_rating ?? "—"}</td>
              <td>
                <button disabled={busy === b.id} onClick={() => promote(b.id)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100">
                  → Pipeline
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
