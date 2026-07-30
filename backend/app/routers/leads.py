from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_pool

router = APIRouter(prefix="/leads", tags=["crm"], dependencies=[Depends(require_user)])

STAGES = ["new", "qualified", "contacted", "replied", "meeting", "proposal", "won", "lost"]


class PromoteBody(BaseModel):
    business_id: str
    contact_name: str | None = None
    contact_email: str | None = None


class StageBody(BaseModel):
    stage: str
    lost_reason: str | None = None


class NoteBody(BaseModel):
    body: str
    created_by: str = "user"


@router.post("")
async def promote_business(body: PromoteBody):
    """Promote a scored business into the pipeline (idempotent)."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """insert into leads (business_id, contact_name, contact_email)
           values ($1, $2, coalesce($3, (select email from businesses where id=$1)))
           on conflict (business_id) do update set updated_at = now()
           returning id""",
        body.business_id, body.contact_name, body.contact_email,
    )
    return {"lead_id": str(row["id"])}


@router.post("/promote-batch")
async def promote_batch(
    min_score: int = 60, state: str | None = None, limit: int = 10,
    require_phone: bool = True, exclude_suspicious: bool = True,
    operational_only: bool = True,
):
    """Promote the next N best-scoring businesses not yet in the CRM.

    Default is 10, not 100: promoting hundreds at once produces a pipeline
    nobody can work, and a huge unworked list is indistinguishable from no
    list. Callers who genuinely want a bulk load pass ?limit= explicitly.

    Two independent data-quality guards, both on by default:
    - require_phone: a "ghost" listing with no phone/email/website/reviews
      scores identically to a real contractor who just lacks a website
      (the formula awards points for every missing signal). Uncontactable,
      so it should never occupy a call-queue slot.
    - exclude_suspicious: catches a DIFFERENT, harder problem — Google Maps
      listing squatting, common in home-service categories, where a scammer
      registers a fake business at an address they don't operate from
      (often a big-box store) WITH a working phone, because the scam
      depends on the call connecting. require_phone does not catch this.
      likely_fake_listing (see migration 008) flags names that are just a
      bare street address plus a trade word — a real company essentially
      never names itself that way.
    - operational_only: business_status was captured from Google since day
      one but never checked anywhere. A permanently-closed business has no
      website and no recent reviews, so it scores HIGH — the formula rewards
      exactly the traits a dead company has. Anything not explicitly
      OPERATIONAL (closed, or status missing entirely) is excluded from the
      call queue: an unverifiable listing is not worth a dial."""
    pool = await get_pool()
    rows = await pool.fetch(
        f"""insert into leads (business_id, contact_email)
           select s.id, s.email from businesses_scored s
           where coalesce(s.opportunity_score, 0) >= $1
             and ($2::text is null or s.state = $2)
             and not exists (select 1 from leads l where l.business_id = s.id)
             {"and s.phone is not null" if require_phone else ""}
             {"and not s.likely_fake_listing" if exclude_suspicious else ""}
             {"and s.business_status = 'OPERATIONAL'" if operational_only else ""}
           order by s.opportunity_score desc limit $3
           returning id""",
        min_score, state.upper() if state else None, limit,
    )
    return {"promoted": len(rows)}


@router.get("")
async def list_leads(stage: str | None = None, limit: int = 100, offset: int = 0):
    pool = await get_pool()
    if stage and stage not in STAGES:
        raise HTTPException(400, "bad stage")
    rows = await pool.fetch(
        """select * from leads_full
           where ($1::text is null or stage = $1::lead_stage)
           order by opportunity_score desc nulls last limit $2 offset $3""",
        stage, limit, offset,
    )
    return [dict(r) for r in rows]


@router.get("/pipeline")
async def pipeline_summary():
    pool = await get_pool()
    rows = await pool.fetch(
        "select stage, count(*) as n from leads group by stage"
    )
    counts = {r["stage"]: r["n"] for r in rows}
    return {s: counts.get(s, 0) for s in STAGES}


@router.get("/{lead_id}")
async def get_lead(lead_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("select * from leads_full where id=$1", lead_id)
    if not row:
        raise HTTPException(404, "lead not found")
    interactions = await pool.fetch(
        "select * from interactions where lead_id=$1 order by occurred_at desc limit 100", lead_id
    )
    return {**dict(row), "interactions": [dict(i) for i in interactions]}


@router.patch("/{lead_id}/stage")
async def change_stage(lead_id: str, body: StageBody):
    if body.stage not in STAGES:
        raise HTTPException(400, f"stage must be one of {STAGES}")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            old = await conn.fetchval("select stage from leads where id=$1", lead_id)
            if old is None:
                raise HTTPException(404, "lead not found")
            await conn.execute(
                """update leads set stage=$2::lead_stage, stage_changed_at=now(),
                       lost_reason=$3 where id=$1""",
                lead_id, body.stage, body.lost_reason,
            )
            await conn.execute(
                """insert into interactions (lead_id, type, channel, body, metadata)
                   values ($1,'stage_changed','system',$2,$3)""",
                lead_id, f"{old} -> {body.stage}", {"from": str(old), "to": body.stage},
            )
    return {"ok": True, "stage": body.stage}


@router.post("/{lead_id}/notes")
async def add_note(lead_id: str, body: NoteBody):
    pool = await get_pool()
    row = await pool.fetchrow(
        """insert into interactions (lead_id, type, channel, body, created_by)
           values ($1,'note','system',$2,$3) returning id""",
        lead_id, body.body, body.created_by,
    )
    return {"interaction_id": str(row["id"])}
