"""Single Claude gateway for the whole platform.

Grounding rule: prompts pass ONLY measured facts (score breakdown
reasons, crawl signals, GBP numbers). The system prompts explicitly
forbid inventing specifics. In outreach, one hallucinated 'fact' about
a prospect's website costs more than a hundred good emails earn."""
import json
import re

from anthropic import AsyncAnthropic

from ..config import get_settings

_client: AsyncAnthropic | None = None


def client() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=get_settings().anthropic_api_key)
    return _client


async def complete(system: str, user: str, max_tokens: int = 2000) -> str:
    msg = await client().messages.create(
        model=get_settings().anthropic_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text


async def complete_json(system: str, user: str, max_tokens: int = 2000) -> dict:
    text = await complete(system + "\nRespond with valid JSON only, no prose.", user, max_tokens)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError(f"model returned no JSON: {text[:200]}")
    return json.loads(m.group(0))


def facts_block(lead: dict) -> str:
    """Serialize the measured facts for a lead into a prompt block."""
    bd = lead.get("score_breakdown") or {}
    problems = [
        f"- {k.replace('_',' ')}: {v['reason']} ({v['points']}/{v['max']} pts)"
        for k, v in bd.items() if v.get("points", 0) > 0
    ]
    strengths = [
        f"- {k.replace('_',' ')}: {v['reason']}"
        for k, v in bd.items() if v.get("points", 0) == 0
    ]
    return (
        f"Business: {lead['name']} — {str(lead['industry']).replace('_',' ')} in "
        f"{lead.get('city') or 'their area'}, {lead['state']}\n"
        f"Website: {lead.get('website_url') or 'NONE'}\n"
        f"Google rating: {lead.get('gbp_rating') or 'no rating'} "
        f"({lead.get('gbp_review_count') or 0} reviews)\n"
        f"Opportunity score: {lead.get('opportunity_score')}/100\n"
        f"MEASURED PROBLEMS:\n" + ("\n".join(problems) or "- none") +
        f"\nWHAT THEY DO WELL:\n" + ("\n".join(strengths) or "- unknown")
    )
