/**
 * POST /api/send
 *
 * Sends a drafted email message via Resend.
 * Updates outreach_messages status to 'sent', logs an interaction,
 * and moves the lead stage to 'contacted'.
 *
 * Body: { message_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromName = process.env.OUTREACH_FROM_NAME ?? "Signal Sync";
  const fromEmail = process.env.OUTREACH_FROM_EMAIL;

  if (!supabaseUrl || !serviceKey || !resendKey || !fromEmail) {
    return NextResponse.json({ error: "Missing required env vars (RESEND_API_KEY, OUTREACH_FROM_EMAIL)" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { message_id } = body as { message_id?: string };

  if (!message_id) {
    return NextResponse.json({ error: "message_id required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Fetch the draft message
  const { data: msg, error: msgErr } = await supabase
    .from("outreach_messages")
    .select("id, lead_id, business_id, subject, body, status")
    .eq("id", message_id)
    .single();

  if (msgErr || !msg) {
    return NextResponse.json({ error: msgErr?.message ?? "message not found" }, { status: 404 });
  }

  if (msg.status === "sent") {
    return NextResponse.json({ error: "Message already sent" }, { status: 409 });
  }

  // Fetch business email
  const { data: biz } = await supabase
    .from("businesses")
    .select("email, name")
    .eq("id", msg.business_id)
    .single();

  const toEmail = (biz as { email?: string } | null)?.email;
  const bizName = (biz as { name?: string } | null)?.name ?? "there";

  if (!toEmail) {
    return NextResponse.json({ error: "Business has no email address on file" }, { status: 400 });
  }

  // Send via Resend
  const resend = new Resend(resendKey);
  const { error: sendErr } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: toEmail,
    subject: msg.subject,
    text: msg.body,
  });

  if (sendErr) {
    return NextResponse.json({ error: `Resend error: ${sendErr.message}` }, { status: 500 });
  }

  const now = new Date().toISOString();

  // Update message status
  await supabase
    .from("outreach_messages")
    .update({ status: "sent", sent_at: now })
    .eq("id", message_id);

  // Log interaction
  await supabase.from("interactions").insert({
    lead_id: msg.lead_id,
    type: "email_sent",
    channel: "email",
    subject: msg.subject,
    occurred_at: now,
    metadata: { message_id, to: toEmail, business_name: bizName },
  });

  // Advance stage to contacted (only if still earlier)
  await supabase
    .from("leads")
    .update({ stage: "contacted" })
    .eq("id", msg.lead_id)
    .in("stage", ["new", "qualified"]);

  return NextResponse.json({ ok: true, sent_to: toEmail });
}
