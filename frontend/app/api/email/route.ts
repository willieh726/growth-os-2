/**
 * POST /api/email
 *
 * Generates a cold email draft for a lead using the Anthropic API.
 * Saves the draft to outreach_messages and returns {message_id, subject, body}.
 *
 * Body: { lead_id: string, intent?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { FAST_MODEL } from "@/lib/ai";

export const maxDuration = 60;

// Mirrors backend/app/services/outreach.py EMAIL_SYSTEM
const EMAIL_SYSTEM = `You write cold outreach emails on behalf of a digital-marketing agency
that helps small blue-collar contractors (tree service, excavation, septic, concrete,
HVAC, plumbing, electrical, roofing, landscaping) win more local jobs.

RULES — every rule is mandatory, no exceptions:
- Under 120 words total (subject + body combined). Count them. If over, cut.
- One idea only. Pick the single biggest problem the facts reveal.
- Never mention our agency name, our services, our pricing, our website, or anything about us.
  The email is entirely about THEM and THEIR lost opportunity.
- Sell the result, not the service: "capture after-hours quote requests" not "build a contact form".
- No invented stats, no competitor names, no made-up numbers.
- No "I noticed" or "I came across your website" opener — it reads as spam.
- Sign off as: "{sender first name} from Signal Sync" — e.g. "— Will from Signal Sync". The sender's first name is provided in the user message.
- Subject line: specific, curiosity-gap, 6 words or fewer. No questions.
- Tone: peer-to-peer, plain language, one contractor to another.
- End with a soft CTA: one question or a 15-minute call offer.

Return ONLY valid JSON in this exact shape (no markdown fences, no extra keys):
{"subject": "...", "body": "..."}`;

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
Email: ${biz.email ?? "not listed"}
Website status: ${websiteStatus}
Google reviews: ${biz.gbp_review_count ?? 0}
Google rating: ${biz.gbp_rating ?? "none"}
Opportunity score: ${score.total ?? 0}/100

MEASURED PROBLEMS (sorted worst first):
${problems.join("\n") || "  (none — well-optimised business)"}

WHAT THEY DO WELL:
${strengths.join("\n") || "  (no strengths detected)"}`;
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const fromNameFull = process.env.OUTREACH_FROM_NAME ?? "Will";
  // Extract first name — if the env var is a brand name like "Signal Sync", fall back to "Will"
  const fromFirstName = fromNameFull.split(" ")[0].toLowerCase() === "signal" ? "Will" : fromNameFull.split(" ")[0];

  if (!supabaseUrl || !serviceKey || !anthropicKey) {
    return NextResponse.json({ error: "Missing required env vars" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { lead_id, intent } = body as { lead_id?: string; intent?: string };

  if (!lead_id) {
    return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Fetch lead row first, then related data in parallel (no FK joins — not in schema cache)
  const { data: leadRow, error: leadErr } = await supabase
    .from("leads")
    .select("id, business_id")
    .eq("id", lead_id)
    .single();

  if (leadErr || !leadRow) {
    return NextResponse.json({ error: leadErr?.message ?? "lead not found" }, { status: 404 });
  }

  const bizId = leadRow.business_id as string;

  const [
    { data: bizRow },
    { data: scoreRow },
  ] = await Promise.all([
    supabase.from("businesses").select("name, industry, city, state, phone, email, website_url, has_website, gbp_rating, gbp_review_count, website_discovered").eq("id", bizId).single(),
    supabase.from("opportunity_scores").select("total, breakdown").eq("business_id", bizId).maybeSingle(),
  ]);

  const lead = { id: leadRow.id, business_id: bizId };
  const biz = (bizRow ?? {}) as Record<string, unknown>;
  const score = (scoreRow ?? {}) as Record<string, unknown>;

  const userPrompt = `${factsBlock(biz, score)}\n\nIntent: ${intent ?? "initial cold outreach"}\n\nSender first name: ${fromFirstName}`;

  // Call Anthropic
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  let message;
  try {
    message = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 512,
      system: EMAIL_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (aiErr) {
    const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 500 });
  }

  const rawText = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Extract JSON (strip any accidental fences)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "AI did not return valid JSON", raw: rawText }, { status: 500 });
  }
  const { subject, body: emailBody } = JSON.parse(jsonMatch[0]) as { subject: string; body: string };

  // Save to outreach_messages (schema: kind, not channel; no model column)
  const { data: msg } = await supabase
    .from("outreach_messages")
    .insert({
      lead_id,
      kind: "cold_email",
      subject,
      body: emailBody,
      status: "draft",
    })
    .select("id")
    .single();

  // Log interaction if save succeeded
  if (msg?.id) {
    await supabase.from("interactions").insert({
      lead_id,
      type: "email_draft_created",
      channel: "system",
      subject: "Email draft created",
      metadata: { message_id: msg.id, intent: intent ?? "initial cold outreach" },
    });
  }

  return NextResponse.json({ message_id: msg?.id ?? null, subject, body: emailBody });
}
