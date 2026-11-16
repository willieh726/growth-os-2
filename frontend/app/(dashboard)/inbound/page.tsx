"use client";
import { useCallback, useEffect, useState } from "react";

type InboundLead = {
  id: string;
  business_name: string;
  city: string;
  state: string;
  website_url: string | null;
  phone: string | null;
  contact_email: string;
  audit_id: string | null;
  share_slug: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

const STATUSES = ["new", "reviewed", "contacted", "won", "lost"];

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    reviewed: "bg-yellow-100 text-yellow-800",
    contacted: "bg-purple-100 text-purple-800",
    won: "bg-green-100 text-green-800",
    lost: "bg-gray-100 text-gray-500",
  };
  return styles[status] ?? "bg-gray-100 text-gray-600";
}

const FRONTEND_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://audit.signalsyncagency.com";

export default function InboundLeads() {
  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const r = await fetch("/api/inbound");
        if (!r.ok) throw new Error(await r.text());
        setLeads((await r.json()) as InboundLead[]);
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(load, [load]);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    try {
      const r = await fetch(`/api/inbound/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error(await r.text());
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status } : l))
      );
    } catch (e) {
      alert("Failed to update: " + String(e));
    } finally {
      setUpdating(null);
    }
  };

  const visible = statusFilter
    ? leads.filter((l) => l.status === statusFilter)
    : leads;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inbound Leads</h1>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">
          {leads.filter((l) => l.status === "new").length} new
        </span>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          onClick={() => setStatusFilter("")}
          className={`rounded-full px-3 py-1 ${
            !statusFilter ? "bg-gray-900 text-white" : "border border-gray-300"
          }`}
        >
          All ({leads.length})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 capitalize ${
              statusFilter === s
                ? "bg-gray-900 text-white"
                : "border border-gray-300"
            }`}
          >
            {s} ({leads.filter((l) => l.status === s).length})
          </button>
        ))}
      </div>

      {err && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-4">
          <p className="font-bold text-red-800">Couldn&apos;t load inbound leads</p>
          <p className="mt-1 text-sm text-red-700">
            This is a connection or server problem — your data is not lost.
          </p>
          <p className="mt-2 font-mono text-xs text-red-600">{err}</p>
          <button
            onClick={load}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !err && <p className="text-gray-400">Loading inbound leads…</p>}

      {!loading && !err && visible.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-gray-500">
            {statusFilter
              ? `No leads with status "${statusFilter}".`
              : "No inbound leads yet. Share the audit link at signalsyncagency.com/audit to start getting prospects."}
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-2 pr-4">Business</th>
                <th className="pr-4">Contact</th>
                <th className="pr-4">Audit</th>
                <th className="pr-4">Status</th>
                <th className="pr-4">Received</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{l.business_name}</div>
                    <div className="text-xs text-gray-400">
                      {l.city}, {l.state}
                    </div>
                    {l.website_url && (
                      <a
                        href={l.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {l.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    )}
                  </td>
                  <td className="pr-4">
                    <div className="text-xs">{l.contact_email}</div>
                    {l.phone && (
                      <div className="text-xs text-gray-400">{l.phone}</div>
                    )}
                  </td>
                  <td className="pr-4">
                    {l.share_slug ? (
                      <a
                        href={`${FRONTEND_URL}/a/${l.share_slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        View audit →
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="pr-4">
                    <select
                      value={l.status}
                      disabled={updating === l.id}
                      onChange={(e) => updateStatus(l.id, e.target.value)}
                      className={`rounded px-2 py-1 text-xs font-semibold capitalize ${statusBadge(l.status)} cursor-pointer border-0 outline-none`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s} className="capitalize">
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-xs text-gray-400">
                    {new Date(l.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
