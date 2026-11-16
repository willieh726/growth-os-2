/**
 * POST /api/audit
 *
 * Generates a digital-presence audit for a business using the Anthropic API.
 * Saves to audits table with a shareable slug, logs an interaction.
 *
 * Body: { business_id: string, lead_id?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

export const maxDuration = 60;

// Mirrors backend/app/services/audit_generator.py SYSTEM
const AUDIT_SYSTEM = `You write digital-presence audits for small blue-collar contractors
(tree service, excavation, septic, concrete, HVAC, plumbing, electrical,
roofing, landscaping). Audience: a busy owner-operator reading on a phone. Rules:
- Use ONLY the measured facts provided. Never invent metrics, rankings, or
  competitor names. If a fact isn't provided, don't claim it.
- CRITICAL — Website status field is authoritative. If it says REACHABLE,
  never write that the website doesn't load, times out, or is broken. If it
  says NONE, they have no website. If it says UNREACHABLE, the site failed
  to load. Do not contradict or reinterpret this field under any circumstance.
- NEVER state made-up quantities: no "losing X jobs per month", no "worth X
  extra jobs per month", no revenue estimates, no invented competitor review
  counts or ratings (e.g. never write "competitors average 40+ reviews" or
  "a competitor has 47 reviews and 4.8 stars" unless that exact figure is in
  the facts provided). Describe the direction of the impact ("evening emergency
  jobs go to whoever shows up in search") without fabricating numbers. The
  reader must never be able to ask "how do you know that number?" and catch us
  guessing.
- When reviews are zero or low, motivate the client by describing the gap and
  the general truth: e.g. "You have no Google reviews. Any competitor with even
  a handful looks more established. When someone's comparing options, reviews
  are the first thing they check — and right now you have nothing to show."
  Do NOT invent a specific competitor review count or average.
- Plain language, no marketing jargon. Short sentences.
- Frame every problem as lost jobs/revenue, not as a tech deficiency.
- Recommendations sell outcomes, not deliverables: "capture the quote
  requests that come in after you've gone home" — not "build a responsive
  website with a contact form". The fix is described by what it wins them.
- Structure: # {Business Name} Digital Presence Audit, then ## The Bottom Line
  (3 sentences), ## What's Costing You Jobs (one short section per measured
  problem, worst first), ## What You're Doing Right, ## The Fix (prioritized,
  concrete, no prices).
- Total length under 600 words.`;

// Mirrors backend/app/services/ai.py facts_block()
function factsBlock(biz: Record<string, unknown>, score: Record<string, unknown>): string {
  const hasWebsite = biz.has_website as boolean;
  const websiteUrl = biz.website_url as string | null;
  const isDiscovered = biz.website_discovered as boolean | undefined;

  let websiteStatus: string;
  if (!hasWebsite) {
    websiteStatus = "NONE";
  } else if (!websiteUrl) {
    websiteStatus = "NONE";
  } else if (isDiscovered) {
    websiteStatus = `REACHABLE but NOT linked on Google profile (discovered URL: ${websiteUrl})`;
  } else {
    websiteStatus = `REACHABLE at ${websiteUrl}`;
  }

  const breakdown = (score.breakdown || {}) as Record<string, { points: number; max: number; reason: string }>;
  const problems: string[] = [];
  const strengths: string[] = [];

  for (const [, v] of Object.entries(breakdown)) {
    if (v.points > 0) {
      problems.push(`  - ${v.reason} (${v.points}/${v.max} pts)`);
    } else {
      strengths.push(`  - ${v.reason}`);
    }
  }

  return `BUSINESS FACTS (use ONLY these — do not invent any other data):
Name: ${biz.name}
Industry: ${biz.industry}
Location: ${biz.city ?? "unknown"}, ${biz.state}
Phone: ${biz.phone ?? "not listed"}
Website status: ${websiteStatus}
Google reviews: ${biz.gbp_review_count ?? 0}
Google rating: ${biz.gbp_rating ?? "none"}
Opportunity score: ${score.total ?? 0}/100

MEASURED PROBLEMS (sorted worst first):
${problems.join("\n") || "  (none — well-optimised business)"}

WHAT THEY DO WELL:
${strengths.join("\n") || "  (no strengths detected)"}`;
}

function randomSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.OUTREACH_FROM_EMAIL;
  const fromName = process.env.OUTREACH_FROM_NAME ?? "Signal Sync";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const frontendUrl = appUrl ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://signalsyncagency.com");

  if (!supabaseUrl || !serviceKey || !anthropicKey) {
    return NextResponse.json({ error: "Missing required env vars" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { business_id, lead_id } = body as { business_id?: string; lead_id?: string };

  if (!business_id) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Fetch business + score
  const { data: biz, error: bizErr } = await supabase
    .from("businesses")
    .select("id, name, industry, city, state, phone, email, website_url, has_website, gbp_rating, gbp_review_count, website_discovered")
    .eq("id", business_id)
    .single();

  if (bizErr || !biz) {
    return NextResponse.json({ error: bizErr?.message ?? "business not found" }, { status: 404 });
  }

  const { data: scoreRow } = await supabase
    .from("opportunity_scores")
    .select("total, breakdown")
    .eq("business_id", business_id)
    .maybeSingle();

  if (!scoreRow) {
    return NextResponse.json({ error: "Business has no score yet — run rescore first" }, { status: 400 });
  }

  // Call Anthropic
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  let message;
  try {
    message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1800,
      system: AUDIT_SYSTEM,
      messages: [{ role: "user", content: factsBlock(biz as Record<string, unknown>, scoreRow as Record<string, unknown>) }],
    });
  } catch (aiErr) {
    const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 500 });
  }

  const contentMd = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Extract bottom line summary (up to 500 chars)
  const summary = contentMd
    .split("## The Bottom Line")[1]
    ?.split("##")[0]
    ?.trim()
    ?.slice(0, 500) ?? contentMd.slice(0, 500);

  const slug = randomSlug();

  // Save to audits (table may not exist yet — treat insert error as non-fatal)
  const { data: audit, error: insertErr } = await supabase
    .from("audits")
    .insert({
      business_id,
      lead_id: lead_id ?? null,
      content_md: contentMd,
      summary,
      share_slug: slug,
      model: "claude-3-haiku-20240307",
    })
    .select("id, share_slug")
    .single();

  if (insertErr || !audit) {
    // audits table may not exist yet — return the content anyway so it's not lost
    return NextResponse.json({
      id: null,
      share_slug: slug,
      share_url: null,
      content_md: contentMd,
      summary,
      email_sent: false,
      email_error: insertErr?.message ?? "audits table not found — audit not persisted",
    });
  }

  // Log interaction if lead_id provided
  if (lead_id) {
    await supabase.from("interactions").insert({
      lead_id,
      type: "audit_generated",
      channel: "system",
      subject: "Audit generated",
      metadata: { audit_id: audit.id },
    });
  }

  const shareUrl = `${frontendUrl}/a/${audit.share_slug}`;

  // Send audit delivery email if we have Resend configured and a recipient
  let emailSent = false;
  let emailError: string | null = null;

  if (resendKey && fromEmail) {
    // Determine recipient: check lead's contact_email, then business email
    let toEmail: string | null = null;
    let contactName = (biz as Record<string, unknown>).name as string ?? "";

    if (lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("contact_email, contact_name")
        .eq("id", lead_id)
        .maybeSingle();
      toEmail = (lead as { contact_email?: string } | null)?.contact_email ?? null;
      contactName = (lead as { contact_name?: string } | null)?.contact_name ?? contactName;
    }

    if (!toEmail) {
      toEmail = (biz as { email?: string }).email ?? null;
    }

    if (toEmail) {
      const bizName = (biz as { name?: string }).name ?? "there";
      const city = (biz as { city?: string }).city ?? "";
      const state = (biz as { state?: string }).state ?? "";
      const websiteUrl = (biz as { website_url?: string }).website_url ?? "";

      // Build Calendly booking URL with prefilled context
      const bookParams = new URLSearchParams();
      if (contactName) bookParams.set("name", contactName);
      if (toEmail) bookParams.set("email", toEmail);
      const notesParts = [`Business: ${bizName}`];
      if (city || state) notesParts.push(`City: ${city}, ${state}`.replace(/, $/, ""));
      if (websiteUrl) notesParts.push(`Website: ${websiteUrl}`);
      notesParts.push("Booked from: audit link");
      bookParams.set("a1", notesParts.join("\n"));
      const bookUrl = `https://calendly.com/williamhoge1/30min?${bookParams.toString()}`;

      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <!-- Logo -->
    <div style="margin-bottom:28px;display:flex;align-items:center;gap:10px">
      <svg width="32" height="32" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="44" r="6" fill="#34D399"/>
        <path d="M20 32 A12 12 0 0 1 32 44" fill="none" stroke="#34D399" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M20 23 A21 21 0 0 1 41 44" fill="none" stroke="#34D399" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M20 14 A30 30 0 0 1 50 44" fill="none" stroke="#34D399" stroke-width="4.5" stroke-linecap="round"/>
      </svg>
      <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">${fromName}</span>
    </div>
    <!-- Headline -->
    <h1 style="font-size:24px;font-weight:800;color:#ffffff;margin:0 0 12px;line-height:1.3">
      Your free visibility audit is ready, ${bizName}.
    </h1>
    <p style="color:#9ca3af;font-size:15px;line-height:1.6;margin:0 0 28px">
      We ran a full scan of your online presence — your website, local search visibility, and what customers see when they look you up. Here&rsquo;s what we found:
    </p>
    <!-- CTA button -->
    <a href="${shareUrl}"
       style="display:inline-block;background:#10b981;color:#030712;font-weight:800;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;letter-spacing:-0.2px">
      View Your Audit &rarr;
    </a>
    <!-- Footer note -->
    <p style="color:#6b7280;font-size:13px;margin-top:28px;line-height:1.6">
      Questions? Just reply to this email &mdash; same team.<br>
      <a href="${bookUrl}" style="color:#34D399;text-decoration:none">Book a free 30-min call</a> if you want to walk through it together.
    </p>
    <hr style="border:none;border-top:1px solid #1f2937;margin:32px 0">
    <p style="color:#374151;font-size:11px;margin:0">
      ${fromName} &middot; <a href="https://signalsyncagency.com" style="color:#374151;text-decoration:none">signalsyncagency.com</a>
    </p>
  </div>
</body>
</html>`;

      const resend = new Resend(resendKey);
      const { error: sendErr } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: toEmail,
        subject: `Your free visibility audit — ${bizName}`,
        html,
        text: `Your free visibility audit is ready, ${bizName}.\n\nView it here: ${shareUrl}\n\nQuestions? Reply to this email or book a call: ${bookUrl}\n\n— ${fromName}`,
      });

      if (sendErr) {
        emailError = sendErr.message;
      } else {
        emailSent = true;
        // Log the email send as an interaction
        if (lead_id) {
          await supabase.from("interactions").insert({
            lead_id,
            type: "email_sent",
            channel: "email",
            subject: `Your free visibility audit — ${bizName}`,
            occurred_at: new Date().toISOString(),
            metadata: { audit_id: audit.id, to: toEmail, type: "audit_delivery" },
          });
        }
      }
    }
  }

  return NextResponse.json({
    audit_id: audit.id,
    share_slug: audit.share_slug,
    share_url: shareUrl,
    content_md: contentMd,
    email_sent: emailSent,
    ...(emailError ? { email_error: emailError } : {}),
  });
}
