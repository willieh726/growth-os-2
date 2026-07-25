"""Inbound webhooks from Resend.

Reply-stop flow: outbound sends go out with reply_to = your address on a
domain whose inbound MX is pointed at Resend. Resend fires
`email.received` here; we match the sender's address to a lead, log
`email_replied`, halt every active enrollment, and move the CRM stage to
'replied'. Bounces (`email.bounced`) also stop sequences — continuing to
email a bouncing address damages domain reputation.

Signature verification uses Resend's svix secret; set
RESEND_WEBHOOK_SECRET in production."""
import logging

from fastapi import APIRouter, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

from ..config import get_settings
from ..db import get_pool
from ..services.outreach import stop_enrollments

log = logging.getLogger("webhooks")
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/resend")
async def resend_webhook(request: Request):
    payload = await request.body()
    s = get_settings()
    if s.resend_webhook_secret:
        try:
            Webhook(s.resend_webhook_secret).verify(payload, dict(request.headers))
        except WebhookVerificationError:
            raise HTTPException(401, "bad signature")
    event = await request.json()
    etype = event.get("type", "")
    data = event.get("data", {})

    if etype == "email.received":
        return await _handle_reply(data)
    if etype == "email.bounced":
        return await _handle_bounce(data)
    if etype == "email.opened":
        return await _handle_open(data)
    return {"ignored": etype}


async def _lead_by_email(from_email: str) -> str | None:
    pool = await get_pool()
    return await pool.fetchval(
        """select l.id from leads l
           join businesses b on b.id = l.business_id
           where lower(coalesce(l.contact_email, b.email)) = lower($1)
           limit 1""", from_email,
    )


async def _handle_reply(data: dict) -> dict:
    from_email = (data.get("from") or {}).get("email") if isinstance(data.get("from"), dict) \
        else data.get("from", "")
    if not from_email:
        return {"ignored": "no sender"}
    lead_id = await _lead_by_email(from_email)
    if not lead_id:
        log.info("reply from unknown address %s", from_email)
        return {"ignored": "unknown sender"}
    pool = await get_pool()
    await pool.execute(
        """insert into interactions (lead_id, type, channel, subject, body, metadata)
           values ($1,'email_replied','email',$2,$3,$4)""",
        lead_id, data.get("subject", "(reply)"),
        (data.get("text") or "")[:5000], {"from": from_email},
    )
    stopped = await stop_enrollments(str(lead_id), f"reply received from {from_email}")
    await pool.execute(
        """update leads set stage='replied', stage_changed_at=now()
           where id=$1 and stage not in ('meeting','proposal','won','lost')""", lead_id,
    )
    return {"lead_id": str(lead_id), "sequences_stopped": stopped}


async def _handle_bounce(data: dict) -> dict:
    email_id = data.get("email_id")
    pool = await get_pool()
    lead_id = await pool.fetchval(
        "select lead_id from outreach_messages where resend_email_id=$1", email_id
    )
    if not lead_id:
        return {"ignored": "unknown email_id"}
    await pool.execute(
        """insert into interactions (lead_id, type, channel, subject, metadata)
           values ($1,'email_bounced','email','Email bounced',$2)""",
        lead_id, {"resend_email_id": email_id},
    )
    await stop_enrollments(str(lead_id), "hard bounce", status="bounced")
    return {"lead_id": str(lead_id), "bounced": True}


async def _handle_open(data: dict) -> dict:
    email_id = data.get("email_id")
    pool = await get_pool()
    lead_id = await pool.fetchval(
        "select lead_id from outreach_messages where resend_email_id=$1", email_id
    )
    if lead_id:
        await pool.execute(
            """insert into interactions (lead_id, type, channel, subject, metadata)
               values ($1,'email_opened','email','Email opened',$2)""",
            lead_id, {"resend_email_id": email_id},
        )
    return {"ok": True}
