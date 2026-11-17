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
    .select("id, lead_id, subject, body, status")
    .eq("id", message_id)
    .single();

  if (msgErr || !msg) {
    return NextResponse.json({ error: msgErr?.message ?? "message not found" }, { status: 404 });
  }

  if (msg.status === "sent") {
    return NextResponse.json({ error: "Message already sent" }, { status: 409 });
  }

  // Fetch business via lead
  const { data: leadRow } = await supabase
    .from("leads")
    .select("business_id")
    .eq("id", msg.lead_id)
    .single();

  const bizId = (leadRow as { business_id?: string } | null)?.business_id;

  // Fetch business email
  const { data: biz } = await supabase
    .from("businesses")
    .select("email, name")
    .eq("id", bizId)
    .single();

  const toEmail = (biz as { email?: string } | null)?.email;
  const bizName = (biz as { name?: string } | null)?.name ?? "there";

  if (!toEmail) {
    return NextResponse.json({ error: "Business has no email address on file" }, { status: 400 });
  }

  // Build HTML email with Signal Sync branding
  const bodyHtml = msg.body
    .split("\n")
    .map((line: string) => line.trim() === "" ? "<br>" : `<p style="margin:0 0 14px 0;line-height:1.6">${line}</p>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">
        <!-- Header with logo -->
        <tr>
          <td style="background:#0f172a;padding:20px 32px">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:10px">
                  <svg width="28" height="28" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="44" r="6" fill="#34D399"/>
                    <path d="M20 32 A12 12 0 0 1 32 44" fill="none" stroke="#34D399" stroke-width="4.5" stroke-linecap="round"/>
                    <path d="M20 23 A21 21 0 0 1 41 44" fill="none" stroke="#34D399" stroke-width="4.5" stroke-linecap="round"/>
                    <path d="M20 14 A30 30 0 0 1 50 44" fill="none" stroke="#34D399" stroke-width="4.5" stroke-linecap="round"/>
                  </svg>
                </td>
                <td style="vertical-align:middle">
                  <span style="color:#ffffff;font-size:17px;font-weight:600;letter-spacing:-0.3px">${fromName}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 24px 32px;color:#1e293b;font-size:15px">
            ${bodyHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 28px 32px;border-top:1px solid #e2e8f0">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5">
              ${fromName} · <a href="https://signalsyncagency.com" style="color:#34D399;text-decoration:none">signalsyncagency.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Send via Resend
  const bccEmail = process.env.OUTREACH_BCC_EMAIL;

  const resend = new Resend(resendKey);
  const { error: sendErr } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: toEmail,
    ...(bccEmail ? { bcc: [bccEmail] } : {}),
    subject: msg.subject,
    text: msg.body,
    html,
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
