/**
 * POST /api/call-script
 *
 * Generates a SPIN-style call script for a lead using the Anthropic API.
 * Saves to outreach_messages + interactions, returns script JSON.
 *
 * Body: { lead_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

// Mirrors backend/app/services/outreach.py CALL_SYSTEM
const CALL_SYSTEM = `You write cold call scripts on behalf of a digital-marketing agency
that helps small blue-collar contractors (tree service, excavation, septic, concrete,
HVAC, plumbing, electrical, roofing, landscaping) win more local jobs.

DISCOVERY ORDER — always follow SPIN:
1. Situation: 1-2 questions to confirm what you already know (they own the business, service area)
2. Problem: surface the specific pain the facts reveal
3. Implication: help them feel the cost of inaction
4. Need-payoff: get them to articulate what fixing it would mean for them

PERSUASION RULES:
- No invented stats ("you're losing X jobs a month") — describe direction, not magnitude
- No competitor names or ratings
- No pressure closes or urgency tactics
- No scripts that sound scripted — use natural spoken language, contractions, pauses
- Objection responses should acknowledge first, then redirect — never argue
- Keep each talking point to one sentence the caller can say aloud
- Sign off gracefully whether or not they engage

FORBIDDEN:
- "I was just browsing your website and noticed…"
- Any claim about how many jobs they're losing
- Any invented review counts or ratings for them or competitors

Return ONLY valid JSON in this exact shape (no markdown fences, no extra keys):
{
  "opener": "...",
  "hook": "...",
  "talking_points": ["...", "..."],
  "objections": [
    {"objection": "...", "response": "..."}
  ],
  "close": "...",
  "voicemail": "..."
}`;

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

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !serviceKey || !anthropicKey) {
    return NextResponse.json({ error: "Missing required env vars" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { lead_id } = body as { lead_id?: string };

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
    supabase.from("businesses").select("name, industry, city, state, phone, website_url, has_website, gbp_rating, gbp_review_count, website_discovered").eq("id", bizId).single(),
    supabase.from("opportunity_scores").select("total, breakdown").eq("business_id", bizId).maybeSingle(),
  ]);

  const lead = { id: leadRow.id, business_id: bizId };
  const biz = (bizRow ?? {}) as Record<string, unknown>;
  const score = (scoreRow ?? {}) as Record<string, unknown>;

  // Call Anthropic
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  let message;
  try {
    message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      system: CALL_SYSTEM,
      messages: [{ role: "user", content: factsBlock(biz, score) }],
    });
  } catch (aiErr) {
    const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 500 });
  }

  const rawText = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "AI did not return valid JSON", raw: rawText }, { status: 500 });
  }
  const script = JSON.parse(jsonMatch[0]);

  // Save to outreach_messages (table may not exist yet — treat as non-fatal)
  const { data: msg } = await supabase
    .from("outreach_messages")
    .insert({
      lead_id,
      business_id: lead.business_id,
      channel: "call",
      subject: "Call script",
      body: JSON.stringify(script),
      status: "draft",
      model: "claude-3-haiku-20240307",
    })
    .select("id")
    .single();

  // Log interaction if save succeeded
  if (msg?.id) {
    await supabase.from("interactions").insert({
      lead_id,
      type: "call_script_generated",
      channel: "system",
      subject: "Call script generated",
      metadata: { message_id: msg.id },
    });
  }

  return NextResponse.json({ message_id: msg?.id ?? null, ...script });
}
