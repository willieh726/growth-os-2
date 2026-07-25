"""Outreach engine: AI-written emails & call scripts, sequence
enrollment, due-step processing, hard reply-stop."""
import json
import logging
from datetime import datetime, timedelta, timezone

import resend

from ..config import get_settings
from ..db import get_pool
from .ai import complete_json, complete, facts_block

log = logging.getLogger("outreach")

EMAIL_SYSTEM = """You write cold outreach emails for a small agency that builds
websites and digital presence for blue-collar contractors. The reader is an
owner-operator who checks email from a truck. Rules:
- Use ONLY the measured facts provided. Never invent anything.
- Under 120 words. One idea. One specific measured fact in the first two lines.
- Sound like a local human, not a marketer. No buzzwords, no "I hope this finds
  you well", no exclamation marks, at most one question.
- Soft CTA (worth a quick call? / want me to send it over?). Never pushy.
- If an audit link is provided, reference it naturally ("I put together a free
  writeup of what I found — no strings: {audit_url}").
Step intents:
- initial_value: lead with their single worst measured problem, framed as lost jobs.
- bump_with_proof: short reply-style bump on the same thread topic; mention one
  concrete thing that a fixed web presence gets them (after-hours quote requests).
- new_angle_reviews: pivot to their Google reviews/profile facts.
- breakup: polite final note, door stays open, zero guilt-tripping.
Return JSON: {"subject": "...", "body": "..."} — body is plain text with line breaks."""

CALL_SYSTEM = """You write cold-call scripts for an agency selling websites to
blue-collar contractors. The caller reaches a busy owner, often on a job site.
Use ONLY provided facts. Return JSON:
{"opener": "...", "hook": "...", "talking_points": ["..."],
 "objections": [{"objection": "...", "response": "..."}], "close": "...",
 "voicemail": "..."}
Opener under 10 seconds. Hook must quote one measured fact. Objections must
include: 'I get all my work from word of mouth', 'How much does it cost',
'I had a website, waste of money', 'Too busy right now'. Keep responses to
2 sentences each, conversational, respectful of their time."""


async def _lead_full(lead_id: str) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow("select * from leads_full where id=$1", lead_id)
    if not row:
        raise ValueError("lead not found")
    return dict(row)


async def _latest_audit_url(business_id: str) -> str | None:
    pool = await get_pool()
    slug = await pool.fetchval(
        "select share_slug from audits where business_id=$1 order by created_at desc limit 1",
        business_id,
    )
    if not slug:
        return None
    url = f"{get_settings().frontend_url}/a/{slug}"
    # NEVER put a localhost link in a client-facing email — it's dead on
    # arrival on their machine. Until the frontend is deployed publicly,
    # emails go out without the audit link rather than with a broken one.
    if "localhost" in url or "127.0.0.1" in url:
        return None
    return url


async def generate_email(lead_id: str, intent: str = "initial_value",
                         enrollment_id: str | None = None,
                         step_number: int | None = None) -> dict:
    lead = await _lead_full(lead_id)
    audit_url = await _latest_audit_url(lead["business_id"])
    prompt = facts_block(lead) + f"\n\nStep intent: {intent}"
    if audit_url and intent in ("initial_value", "bump_with_proof"):
        prompt += f"\nAudit link: {audit_url}"
    prior = await _prior_bodies(lead_id)
    if prior:
        prompt += "\n\nEmails already sent (do NOT repeat their angle):\n" + prior
    data = await complete_json(EMAIL_SYSTEM, prompt, max_tokens=800)

    pool = await get_pool()
    row = await pool.fetchrow(
        """insert into outreach_messages
             (lead_id, enrollment_id, step_number, kind, subject, body, to_email)
           values ($1,$2,$3,$4,$5,$6,$7) returning id""",
        lead_id, enrollment_id, step_number,
        "cold_email" if intent == "initial_value" else "follow_up",
        data["subject"], data["body"],
        lead.get("contact_email") or lead.get("business_email"),
    )
    return {"message_id": str(row["id"]), **data}


async def generate_call_script(lead_id: str) -> dict:
    lead = await _lead_full(lead_id)
    data = await complete_json(CALL_SYSTEM, facts_block(lead), max_tokens=1500)
    pool = await get_pool()
    await pool.execute(
        """insert into outreach_messages (lead_id, kind, subject, body, status)
           values ($1,'call_script','Call script', $2, 'draft')""",
        lead_id, json.dumps(data),
    )
    await pool.execute(
        """insert into interactions (lead_id, type, channel, subject)
           values ($1,'call_script_generated','phone','Call script generated')""",
        lead_id,
    )
    return data


async def _prior_bodies(lead_id: str) -> str:
    pool = await get_pool()
    rows = await pool.fetch(
        """select subject, body from outreach_messages
           where lead_id=$1 and status='sent' order by sent_at""", lead_id
    )
    return "\n---\n".join(f"Subject: {r['subject']}\n{r['body'][:400]}" for r in rows)


async def has_replied(lead_id: str) -> bool:
    pool = await get_pool()
    return bool(await pool.fetchval(
        "select 1 from interactions where lead_id=$1 and type='email_replied' limit 1", lead_id
    ))


async def send_message(message_id: str) -> dict:
    """Send a drafted message via Resend, log interaction, update CRM stage."""
    s = get_settings()
    pool = await get_pool()
    msg = await pool.fetchrow("select * from outreach_messages where id=$1", message_id)
    if not msg:
        raise ValueError("message not found")
    if msg["status"] == "sent":
        return {"already_sent": True}
    if not msg["to_email"]:
        raise ValueError("lead has no email address")
    if await has_replied(str(msg["lead_id"])):   # final guard
        raise ValueError("lead has replied — refusing to send")

    resend.api_key = s.resend_api_key
    sent = resend.Emails.send({
        "from": f"{s.outreach_from_name} <{s.outreach_from_email}>",
        "to": [msg["to_email"]],
        "subject": msg["subject"],
        "text": msg["body"],
        "reply_to": s.outreach_from_email,
    })
    await pool.execute(
        """update outreach_messages set status='sent', sent_at=now(), resend_email_id=$2
           where id=$1""", message_id, sent["id"],
    )
    await pool.execute(
        """insert into interactions (lead_id, type, channel, subject, body, metadata)
           values ($1,'email_sent','email',$2,$3,$4)""",
        msg["lead_id"], msg["subject"], msg["body"],
        {"message_id": message_id, "resend_email_id": sent["id"]},
    )
    await pool.execute(
        """update leads set stage='contacted', stage_changed_at=now()
           where id=$1 and stage in ('new','qualified')""", msg["lead_id"],
    )
    return {"sent": True, "resend_email_id": sent["id"]}


async def enroll(lead_id: str, sequence_id: str | None = None) -> dict:
    """Enroll a lead; first step is generated+sent immediately by process_due."""
    pool = await get_pool()
    if sequence_id is None:
        sequence_id = await pool.fetchval("select id from sequences where active limit 1")
    row = await pool.fetchrow(
        """insert into sequence_enrollments (lead_id, sequence_id, next_send_at)
           values ($1,$2,now())
           on conflict (lead_id, sequence_id) do nothing
           returning id""", lead_id, sequence_id,
    )
    if row is None:
        return {"already_enrolled": True}
    await pool.execute(
        """insert into interactions (lead_id, type, channel, subject)
           values ($1,'sequence_started','system','Enrolled in sequence')""", lead_id,
    )
    return {"enrollment_id": str(row["id"])}


async def stop_enrollments(lead_id: str, reason: str, status: str = "stopped_reply") -> int:
    pool = await get_pool()
    res = await pool.execute(
        """update sequence_enrollments
           set status=$3::enrollment_status, next_send_at=null, stopped_reason=$2
           where lead_id=$1 and status='active'""",
        lead_id, reason, status,
    )
    n = int(res.split()[-1])
    if n:
        await pool.execute(
            """insert into interactions (lead_id, type, channel, subject, body)
               values ($1,'sequence_stopped','system','Sequence stopped',$2)""",
            lead_id, reason,
        )
    return n


async def process_due(limit: int = 50) -> dict:
    """Advance every due enrollment one step. Idempotent; n8n calls this
    every 15 min. Each enrollment: check reply-stop → generate step email
    → send → schedule next step or complete."""
    pool = await get_pool()
    due = await pool.fetch(
        """select e.id, e.lead_id, e.sequence_id, e.current_step
           from sequence_enrollments e
           where e.status='active' and e.next_send_at <= now()
           order by e.next_send_at limit $1""", limit,
    )
    results = {"processed": 0, "sent": 0, "stopped": 0, "completed": 0, "errors": 0}
    for e in due:
        results["processed"] += 1
        try:
            if await has_replied(str(e["lead_id"])):
                await stop_enrollments(str(e["lead_id"]), "reply detected at send time")
                results["stopped"] += 1
                continue
            step = await pool.fetchrow(
                """select * from sequence_steps where sequence_id=$1 and step_number=$2""",
                e["sequence_id"], e["current_step"] + 1,
            )
            if step is None:
                await pool.execute(
                    """update sequence_enrollments set status='completed', next_send_at=null
                       where id=$1""", e["id"],
                )
                results["completed"] += 1
                continue
            gen = await generate_email(
                str(e["lead_id"]), intent=step["intent"],
                enrollment_id=str(e["id"]), step_number=step["step_number"],
            )
            await send_message(gen["message_id"])
            nxt = await pool.fetchrow(
                "select delay_days from sequence_steps where sequence_id=$1 and step_number=$2",
                e["sequence_id"], step["step_number"] + 1,
            )
            if nxt:
                await pool.execute(
                    """update sequence_enrollments set current_step=$2, next_send_at=$3
                       where id=$1""",
                    e["id"], step["step_number"],
                    datetime.now(timezone.utc) + timedelta(days=nxt["delay_days"]),
                )
            else:
                await pool.execute(
                    """update sequence_enrollments set current_step=$2, status='completed',
                       next_send_at=null where id=$1""", e["id"], step["step_number"],
                )
                results["completed"] += 1
            results["sent"] += 1
        except Exception as ex:
            results["errors"] += 1
            log.exception("enrollment %s failed", e["id"])
            # push retry 4h out so one bad lead can't wedge the queue
            await pool.execute(
                "update sequence_enrollments set next_send_at=now() + interval '4 hours' where id=$1",
                e["id"],
            )
    return results
