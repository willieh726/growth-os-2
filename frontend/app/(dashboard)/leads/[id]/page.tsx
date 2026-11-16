"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { api, Lead, STAGES, label, scoreColor } from "@/lib/api";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Draft = { message_id: string; subject: string; body: string };
type Audit = { audit_id: string; share_url: string; content_md: string };
type Script = {
  opener: string; hook: string; talking_points: string[];
  objections: { objection: string; response: string }[]; close: string; voicemail: string;
};

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    (async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(`
          id, stage, business_id,
          businesses (
            name, industry, city, state, phone, email,
            website_url, has_website, gbp_rating, gbp_review_count,
            likely_fake_listing
          ),
          opportunity_scores ( total, breakdown ),
          interactions ( id, type, subject, occurred_at )
        `)
        .eq("id", id)
        .single();
      if (error || !data) return;
      const b = (data.businesses as Record<string, unknown>) ?? {};
      const s = Array.isArray(data.opportunity_scores)
        ? ((data.opportunity_scores[0] as Record<string, unknown>) ?? {})
        : ((data.opportunity_scores as Record<string, unknown>) ?? {});
      const interactions = Array.isArray(data.interactions)
        ? (data.interactions as Array<{ id: string; type: string; subject: string | null; occurred_at: string }>)
        : [];
      setLead({
        id: data.id as string,
        business_id: data.business_id as string,
        stage: data.stage as string,
        name: b.name as string,
        industry: b.industry as string,
        city: b.city as string | null,
        state: b.state as string,
        phone: b.phone as string | null,
        contact_email: null,
        business_email: b.email as string | null,
        website_url: b.website_url as string | null,
        has_website: b.has_website as boolean,
        gbp_rating: b.gbp_rating as number | null,
        gbp_review_count: b.gbp_review_count as number | null,
        opportunity_score: (s.total as number | null) ?? null,
        score_breakdown: (s.breakdown as Lead["score_breakdown"]) ?? null,
        interaction_count: interactions.length,
        last_activity_at: interactions[0]?.occurred_at ?? null,
        likely_fake_listing: b.likely_fake_listing as boolean | undefined,
        interactions,
      });
    })();
  }, [id]);
  useEffect(load, [load]);

  if (!lead) return <p className="text-gray-400">Loading…</p>;
  const bd = lead.score_breakdown || {};

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try { await fn(); load(); } catch (e) { alert(String(e)); } finally { setBusy(""); }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{lead.name}</h1>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${scoreColor(lead.opportunity_score)}`}>
              {lead.opportunity_score ?? "—"}/100
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {label(lead.industry)} · {lead.city}, {lead.state} · {lead.phone ?? "no phone"} ·{" "}
            {lead.contact_email ?? lead.business_email ?? "no email"} ·{" "}
            {lead.has_website
              ? <a href={lead.website_url!} target="_blank" className="text-blue-600 underline">{lead.website_url}</a>
              : <span className="font-semibold text-red-600">no website</span>}
          </p>
        </div>

        {lead.likely_fake_listing && (
          <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4">
            <p className="font-bold text-red-800">
              ⚠️ Possible fake/squatted listing — verify before calling
            </p>
            <p className="mt-1 text-sm text-red-700">
              This business&apos;s name is just a street address plus a trade word
              (e.g. &quot;909 Washington St Plumbing&quot;) — a pattern common to
              scam listings squatting at a real address (often a big-box store)
              to steal calls meant for that address&apos;s real business. Look the
              address up on Google Maps before dialing. If it&apos;s not a real,
              independent business at that spot, move to the next lead.
            </p>
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">Why this score</h2>
          <ul className="space-y-1 text-sm">
            {Object.entries(bd).sort((a, b) => b[1].points - a[1].points).map(([k, v]) => (
              <li key={k} className="flex justify-between gap-4">
                <span className={v.points > 0 ? "text-gray-800" : "text-gray-400"}>{v.reason}</span>
                <span className="shrink-0 font-mono text-xs text-gray-500">{v.points}/{v.max}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">Actions</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <button disabled={!!busy}
              onClick={() => run("audit", async () => setAudit(await api.post<Audit>(`/audits`, { business_id: lead.business_id, lead_id: lead.id })))}
              className="rounded-lg bg-gray-900 px-3 py-2 text-white hover:bg-gray-700 disabled:opacity-50">
              {busy === "audit" ? "Generating…" : "Generate audit"}
            </button>
            <button disabled={!!busy}
              onClick={() => run("email", async () => setDraft(await api.post<Draft>(`/outreach/leads/${lead.id}/email`, { intent: "initial_value" })))}
              className="rounded-lg bg-gray-900 px-3 py-2 text-white hover:bg-gray-700 disabled:opacity-50">
              {busy === "email" ? "Writing…" : "Draft cold email"}
            </button>
            <button disabled={!!busy}
              onClick={() => run("script", async () => setScript(await api.post<Script>(`/outreach/leads/${lead.id}/call-script`)))}
              className="rounded-lg bg-gray-900 px-3 py-2 text-white hover:bg-gray-700 disabled:opacity-50">
              {busy === "script" ? "Writing…" : "Call script"}
            </button>
            <button disabled={!!busy}
              onClick={() => run("enroll", () => api.post(`/outreach/leads/${lead.id}/enroll`))}
              className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-100 disabled:opacity-50">
              Enroll in sequence
            </button>
            <button disabled={!!busy}
              onClick={() => run("stop", () => api.post(`/outreach/leads/${lead.id}/stop`))}
              className="rounded-lg border border-red-300 px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50">
              Stop sequence
            </button>
          </div>
        </section>

        {audit && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Audit ready</h2>
              <a href={audit.share_url} target="_blank"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
                View shareable page ↗
              </a>
            </div>
            <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-gray-700">
              {audit.content_md}
            </pre>
          </section>
        )}

        {draft && (
          <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <h2 className="mb-2 font-semibold">Email draft</h2>
            <p className="text-sm font-medium">Subject: {draft.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{draft.body}</pre>
            <button
              onClick={() => run("send", () => api.post(`/outreach/messages/${draft.message_id}/send`).then(() => setDraft(null)))}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
              {busy === "send" ? "Sending…" : "Send now"}
            </button>
          </section>
        )}

        {script && (
          <section className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm">
            <h2 className="mb-2 font-semibold">Call script</h2>
            <p><b>Opener:</b> {script.opener}</p>
            <p className="mt-2"><b>Hook:</b> {script.hook}</p>
            <ul className="mt-2 list-disc pl-5">{script.talking_points.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <div className="mt-3 space-y-2">
              {script.objections.map((o, i) => (
                <p key={i}><b>“{o.objection}”</b> → {o.response}</p>
              ))}
            </div>
            <p className="mt-2"><b>Close:</b> {script.close}</p>
            <p className="mt-2"><b>Voicemail:</b> {script.voicemail}</p>
          </section>
        )}
      </div>

      <div className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">Stage</h2>
          <select value={lead.stage}
            onChange={e => {
              const newStage = e.target.value;
              run("stage", async () => {
                const { error } = await supabase
                  .from("leads")
                  .update({ stage: newStage })
                  .eq("id", lead.id);
                if (error) throw new Error(error.message);
              });
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {STAGES.map(s => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">Timeline</h2>
          <div className="mb-3 flex gap-2">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add note…"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button onClick={() => run("note", async () => {
              const { error } = await supabase.from("interactions").insert({
                lead_id: lead.id,
                type: "note",
                subject: note,
                occurred_at: new Date().toISOString(),
              });
              if (error) throw new Error(error.message);
              setNote("");
            })}
              className="rounded-lg border border-gray-300 px-3 text-sm hover:bg-gray-100">+</button>
          </div>
          <ul className="space-y-3 text-sm">
            {(lead.interactions || []).map(i => (
              <li key={i.id} className="border-l-2 border-gray-200 pl-3">
                <div className="font-medium">{label(i.type)}</div>
                {i.subject && <div className="text-gray-600">{i.subject}</div>}
                <div className="text-xs text-gray-400">{new Date(i.occurred_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
