import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_user
from ..config import get_settings
from ..db import get_pool
from ..services.ai import complete, facts_block
from ..services.audit_generator import SYSTEM, generate_audit
from ..services.scoring import BusinessFacts, compute_score
from ..services.website_analyzer import SiteSignals, analyze_website

log = logging.getLogger(__name__)

router = APIRouter(prefix="/audits", tags=["audits"])


class GenerateBody(BaseModel):
    business_id: str
    lead_id: str | None = None


class AuditRequestBody(BaseModel):
    business_name: str
    city: str
    state: str
    website_url: str | None = None
    phone: str | None = None
    contact_email: str
    contact_name: str | None = None


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


@router.post("/request")
async def request_audit(body: AuditRequestBody):
    """Public (no auth) — called from signalsyncagency.com/audit.
    Scores the business from whatever signals we can gather (website analysis
    only — no GBP data), generates a full audit, emails the share link, and
    saves the prospect to inbound_leads."""

    # 1. Analyze website if provided
    site: SiteSignals = await analyze_website(body.website_url)

    # 2. Build BusinessFacts with available data (no GBP for inbound)
    facts = BusinessFacts(
        has_website=bool(body.website_url),
        website_url=body.website_url,
        gbp_rating=None,
        gbp_review_count=None,
        gbp_photo_count=None,
    )

    # 3. Score
    score, breakdown = compute_score(facts, site)

    # 4. Build a facts dict that facts_block() can consume (mirrors businesses_scored shape)
    lead_dict = {
        "name": body.business_name,
        "industry": "contractor service",
        "city": body.city,
        "state": body.state,
        "website_url": body.website_url,
        "gbp_rating": None,
        "gbp_review_count": None,
        "opportunity_score": score,
        "score_breakdown": breakdown,
    }

    # 5. Generate audit via AI
    try:
        content = await complete(SYSTEM, facts_block(lead_dict), max_tokens=1800)
    except Exception as exc:
        log.exception("audit generation failed for inbound request: %s", exc)
        raise HTTPException(500, "audit generation failed")

    summary = content.split("## The Bottom Line", 1)[-1].split("##")[0].strip()[:500]
    slug = secrets.token_urlsafe(12)
    settings = get_settings()

    # 6. Persist: save a placeholder business row, the audit, and inbound_lead
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Minimal business record so audits.business_id FK is satisfied.
            # normalized_name is required; industry defaults to tree_service as a
            # placeholder since inbound prospects don't always specify.
            import re as _re
            normalized = _re.sub(r"[^a-z0-9 ]", "", body.business_name.lower()).strip()
            biz_row = await conn.fetchrow(
                """insert into businesses
                     (name, normalized_name, city, state, website_url, phone,
                      industry, source)
                   values ($1,$2,$3,$4,$5,$6,'tree_service','manual')
                   returning id""",
                body.business_name, normalized or body.business_name.lower(),
                body.city, body.state, body.website_url, body.phone,
            )
            biz_id = biz_row["id"]

            # Score record
            await conn.execute(
                """insert into opportunity_scores
                     (business_id, total, breakdown, weights_version)
                   values ($1,$2,$3,'v1')""",
                biz_id, score, breakdown,
            )

            # Audit record
            audit_row = await conn.fetchrow(
                """insert into audits
                     (business_id, content_md, summary, share_slug, model)
                   values ($1,$2,$3,$4,$5)
                   returning id, share_slug""",
                biz_id, content, summary, slug, settings.anthropic_model,
            )
            audit_id = audit_row["id"]

            # Inbound lead record
            await conn.execute(
                """insert into inbound_leads
                     (business_name, city, state, website_url, phone,
                      contact_email, audit_id, share_slug)
                   values ($1,$2,$3,$4,$5,$6,$7,$8)""",
                body.business_name, body.city, body.state, body.website_url,
                body.phone, body.contact_email, audit_id, slug,
            )

    share_url = f"{settings.frontend_url}/a/{slug}"

    # 7. Send email (best-effort — don't fail the request if email fails)
    try:
        await _send_audit_email(
            to_email=body.contact_email,
            business_name=body.business_name,
            share_url=share_url,
            content_md=content,
            contact_name=body.contact_name or "",
        )
    except Exception as exc:
        log.error("failed to email audit to %s: %s", body.contact_email, exc)

    return {"share_slug": slug, "share_url": share_url}


async def _send_audit_email(to_email: str, business_name: str, share_url: str, content_md: str, contact_name: str = ""):
    """Send the audit share link via Resend (or log if not configured)."""
    settings = get_settings()
    if not settings.resend_api_key:
        log.info("RESEND_API_KEY not set — skipping email to %s. Share URL: %s", to_email, share_url)
        return

    from_email = settings.outreach_from_email or "will@signalsyncagency.com"
    from_name  = settings.outreach_from_name  or "Will @ SignalSync"

    import httpx
    payload = {
        "from": f"{from_name} <{from_email}>",
        "to": [to_email],
        "subject": f"Your free visibility audit — {business_name}",
        "html": _audit_email_html(business_name, share_url, to_email, contact_name),
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            json=payload,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Resend {resp.status_code}: {resp.text[:200]}")


def _audit_email_html(business_name: str, share_url: str, contact_email: str = "", contact_name: str = "") -> str:
    from urllib.parse import urlencode
    book_params = {}
    if contact_name:
        book_params["name"] = contact_name
    if contact_email:
        book_params["email"] = contact_email
    book_url = "https://signalsyncagency.com/book"
    if book_params:
        book_url += "?" + urlencode(book_params)
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Inter,Arial,sans-serif;background:#030712;color:#f3f4f6;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:28px;">
      <span style="font-size:20px;font-weight:800;color:#fff;">Signal<span style="color:#34D399;">Sync</span></span>
    </div>
    <h1 style="font-size:24px;font-weight:800;color:#fff;margin:0 0 12px;">
      Your free visibility audit is ready, {business_name}.
    </h1>
    <p style="color:#9ca3af;font-size:15px;line-height:1.6;margin:0 0 28px;">
      We ran a full scan of your online presence — your website, local search visibility, and what customers see when they look you up. Here's what we found:
    </p>
    <a href="{share_url}"
       style="display:inline-block;background:#10b981;color:#030712;font-weight:800;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      View Your Audit →
    </a>
    <p style="color:#6b7280;font-size:13px;margin-top:28px;line-height:1.6;">
      Questions? Just reply to this email — same team.<br/>
      <a href="{book_url}" style="color:#34D399;">Book a free 30-min call</a> if you want to walk through it together.
    </p>
    <hr style="border:none;border-top:1px solid #1f2937;margin:32px 0;"/>
    <p style="color:#374151;font-size:11px;">
      SignalSync Agency · <a href="https://signalsyncagency.com" style="color:#374151;">signalsyncagency.com</a>
    </p>
  </div>
</body>
</html>
"""


@router.get("/inbound", dependencies=[Depends(require_user)])
async def list_inbound_leads():
    """Authenticated — returns all inbound_leads rows for the dashboard."""
    pool = await get_pool()
    rows = await pool.fetch(
        """select id, business_name, city, state, website_url, phone,
                  contact_email, audit_id, share_slug, status, notes, created_at
           from inbound_leads
           order by created_at desc"""
    )
    return [dict(r) for r in rows]


@router.patch("/inbound/{lead_id}", dependencies=[Depends(require_user)])
async def update_inbound_lead(lead_id: str, body: dict):
    """Update status or notes on an inbound lead."""
    allowed = {"status", "notes"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(400, "nothing to update")
    pool = await get_pool()
    sets = ", ".join(f"{k}=${i+2}" for i, k in enumerate(updates))
    vals = list(updates.values())
    row = await pool.fetchrow(
        f"update inbound_leads set {sets} where id=$1 returning id",
        lead_id, *vals
    )
    if not row:
        raise HTTPException(404, "lead not found")
    return {"ok": True}


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
