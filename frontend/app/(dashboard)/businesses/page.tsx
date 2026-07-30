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
  /* err/loading are not cosmetic. Without them a failed API call left this
     page rendering "Businesses (0)" with an empty table — indistinguishable
     from a genuinely empty database. That is exactly how a backend outage
     looked like data loss. An error must never be displayed as "no results". */
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (industry) p.set("industry", industry);
    if (minScore) p.set("min_score", String(minScore));
    if (noSite) p.set("has_website", "false");
    if (q) p.set("q", q);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(page * PAGE_SIZE));
    setLoading(true);
    setErr("");
    api.get<{ total: number; items: Business[] }>(`/businesses?${p}`)
      .then(r => { setItems(r.items); setTotal(r.total); })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [industry, minScore, noSite, q, page]);

  useEffect(load, [load]);

  // Any filter change must reset to page 0, or you can land on an offset
  // beyond the filtered result set and see a confusing empty table.
  useEffect(() => { setPage(0); }, [industry, minScore, noSite, q]);

  const promote = async (id: string) => {
    setBusy(id);
    try { await api.post("/leads", { business_id: id }); alert("Promoted to pipeline"); load(); }
    catch (e) { alert(String(e)); }
    finally { setBusy(null); }
  };

  /* Pull the next batch of best-scoring businesses into the pipeline.
     Deliberately 10 at a time: a 1,000-lead pipeline is a wall, not a call
     list. Already-promoted businesses are skipped server-side, so this is
     safe to press again the moment the current ten are worked. */
  const promoteNext = async () => {
    setBusy("batch");
    try {
      const r = await api.post<{ promoted: number }>(
        "/leads/promote-batch?min_score=60&limit=10",
      );
      alert(
        r.promoted
          ? `Added ${r.promoted} lead${r.promoted === 1 ? "" : "s"} to your pipeline.`
          : "No new businesses scoring 60+ left to promote.",
      );
      load();
    } catch (e) { alert(String(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Businesses <span className="text-base font-normal text-gray-400">({total})</span></h1>
        <button
          onClick={promoteNext}
          disabled={busy === "batch"}
          title="Adds the 10 highest-scoring businesses not already in your pipeline"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
          {busy === "batch" ? "Adding…" : "Promote next 10 (score ≥ 60)"}
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

      {err && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-4">
          <p className="font-bold text-red-800">Couldn&apos;t load businesses</p>
          <p className="mt-1 text-sm text-red-700">
            This is a connection or server problem — <strong>your data is not lost.</strong>{" "}
            Try again in a moment; if it persists, check the backend is running.
          </p>
          <p className="mt-2 font-mono text-xs text-red-600">{err}</p>
          <button onClick={load}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
            Retry
          </button>
        </div>
      )}

      {loading && !err && <p className="text-gray-400">Loading businesses…</p>}

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
              <td className="font-medium">
                {b.name}
                {b.likely_fake_listing && (
                  <span title="Name looks like a bare street address — possible fake/squatted listing. Verify on Google Maps before calling."
                    className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
                    ⚠️ verify
                  </span>
                )}
                {b.business_status && b.business_status !== "OPERATIONAL" && (
                  <span title={`Google reports this listing as ${b.business_status}. Excluded from the call queue.`}
                    className="ml-2 rounded bg-gray-800 px-1.5 py-0.5 text-xs font-bold text-white">
                    {b.business_status.replace("CLOSED_", "").toLowerCase()}
                  </span>
                )}
                {!b.business_status && (
                  <span title="Google returned no operating status for this listing — unverifiable. Excluded from the call queue."
                    className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">
                    unverified
                  </span>
                )}
              </td>
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

      {!loading && !err && items.length === 0 && (
        <p className="py-6 text-center text-gray-400">
          No businesses match these filters. Try widening the score or clearing the search.
        </p>
      )}

      {/* Pagination. Without this the page could only ever show the first 50
          of 10,000+ businesses — the rest were unreachable in the UI. */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-gray-200 pt-4 text-sm">
          <span className="text-gray-500">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40">
              ← Previous
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total || loading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40">
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
