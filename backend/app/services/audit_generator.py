"""Personalized website/digital-presence audit, grounded in scored facts.
Output is markdown stored in `audits` with a public share slug — cold
emails link to it, which converts far better than attachments."""
import secrets

from ..config import get_settings
from ..db import get_pool
from .ai import complete, facts_block

SYSTEM = """You write digital-presence audits for small blue-collar contractors
(tree service, excavation, septic, concrete, HVAC, plumbing, electrical,
roofing, landscaping). Audience: a busy owner-operator reading on a phone. Rules:
- Use ONLY the measured facts provided. Never invent metrics, rankings, or
  competitor names. If a fact isn't provided, don't claim it.
- NEVER state made-up quantities: no "losing X jobs per month", no "worth X
  extra jobs per month", no revenue estimates. Describe the direction of the
  impact ("evening emergency jobs go to whoever shows up in search") without
  fabricating numbers. The reader must never be able to ask "how do you know
  that number?" and catch us guessing.
- Plain language, no marketing jargon. Short sentences.
- Frame every problem as lost jobs/revenue, not as a tech deficiency.
- Recommendations sell outcomes, not deliverables: "capture the quote
  requests that come in after you've gone home" — not "build a responsive
  website with a contact form". The fix is described by what it wins them.
- Structure: # {Business Name} Digital Presence Audit, then ## The Bottom Line
  (3 sentences), ## What's Costing You Jobs (one short section per measured
  problem, worst first), ## What You're Doing Right, ## The Fix (prioritized,
  concrete, no prices).
- Total length under 600 words."""


async def generate_audit(business_id: str, lead_id: str | None = None) -> dict:
    pool = await get_pool()
    lead = await pool.fetchrow("select * from businesses_scored where id=$1", business_id)
    if not lead:
        raise ValueError("business not found")
    lead = dict(lead)
    if lead.get("opportunity_score") is None:
        raise ValueError("business has no score yet — run rescore first")

    content = await complete(SYSTEM, facts_block(lead), max_tokens=1800)
    summary = content.split("## The Bottom Line", 1)[-1].split("##")[0].strip()[:500]
    slug = secrets.token_urlsafe(12)

    row = await pool.fetchrow(
        """insert into audits (business_id, lead_id, content_md, summary, share_slug, model)
           values ($1,$2,$3,$4,$5,$6) returning id, share_slug""",
        business_id, lead_id, content, summary, slug, get_settings().anthropic_model,
    )
    if lead_id:
        await pool.execute(
            """insert into interactions (lead_id, type, channel, subject, metadata)
               values ($1,'audit_generated','system','Audit generated', $2)""",
            lead_id, {"audit_id": str(row["id"])},
        )
    return {"audit_id": str(row["id"]), "share_slug": row["share_slug"],
            "share_url": f"{get_settings().frontend_url}/a/{row['share_slug']}",
            "content_md": content}
