from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_internal, require_user
from ..db import get_pool
from ..services import outreach

router = APIRouter(prefix="/outreach", tags=["outreach"])


class EmailBody(BaseModel):
    intent: str = "initial_value"


@router.post("/leads/{lead_id}/email", dependencies=[Depends(require_user)])
async def draft_email(lead_id: str, body: EmailBody):
    """Generate a cold email draft (does NOT send)."""
    try:
        return await outreach.generate_email(lead_id, body.intent)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/leads/{lead_id}/call-script", dependencies=[Depends(require_user)])
async def call_script(lead_id: str):
    try:
        return await outreach.generate_call_script(lead_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/messages/{message_id}/send", dependencies=[Depends(require_user)])
async def send(message_id: str):
    try:
        return await outreach.send_message(message_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:  # surface provider errors instead of a blind 500
        raise HTTPException(502, f"Send failed: {type(e).__name__}: {e}")


@router.post("/leads/{lead_id}/enroll", dependencies=[Depends(require_user)])
async def enroll(lead_id: str, sequence_id: str | None = None):
    return await outreach.enroll(lead_id, sequence_id)


@router.post("/leads/{lead_id}/stop", dependencies=[Depends(require_user)])
async def stop(lead_id: str, reason: str = "stopped manually"):
    n = await outreach.stop_enrollments(lead_id, reason, status="stopped_manual")
    return {"stopped": n}


@router.get("/leads/{lead_id}/messages", dependencies=[Depends(require_user)])
async def messages(lead_id: str):
    pool = await get_pool()
    rows = await pool.fetch(
        "select * from outreach_messages where lead_id=$1 order by created_at desc", lead_id
    )
    return [dict(r) for r in rows]


@router.post("/process-due", dependencies=[Depends(require_internal)])
async def process_due(limit: int = 50):
    """Machine endpoint — the cron hits this every 15 minutes."""
    return await outreach.process_due(limit)


@router.post("/warmup", dependencies=[Depends(require_internal)])
async def warmup():
    """Machine endpoint — weekday cron sends domain warm-up notes."""
    return await outreach.send_warmup()
