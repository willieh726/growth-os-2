from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_pool
from ..services.audit_generator import generate_audit

router = APIRouter(prefix="/audits", tags=["audits"])


class GenerateBody(BaseModel):
    business_id: str
    lead_id: str | None = None


@router.post("", dependencies=[Depends(require_user)])
async def create_audit(body: GenerateBody):
    try:
        return await generate_audit(body.business_id, body.lead_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/business/{business_id}", dependencies=[Depends(require_user)])
async def list_audits(business_id: str):
    pool = await get_pool()
    rows = await pool.fetch(
        """select id, share_slug, summary, model, created_at from audits
           where business_id=$1 order by created_at desc""", business_id
    )
    return [dict(r) for r in rows]


@router.get("/public/{slug}")
async def public_audit(slug: str):
    """Unauthenticated — this is the link prospects click from cold emails.
    Frontend renders it at /a/[slug]."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """select a.content_md, a.created_at, b.name
           from audits a join businesses b on b.id = a.business_id
           where a.share_slug=$1""", slug
    )
    if not row:
        raise HTTPException(404, "audit not found")
    return dict(row)
