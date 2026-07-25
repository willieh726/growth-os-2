"""Website discovery: for businesses whose Google listing has no website,
search the web for one. Uses the Brave Search API (Google deprecated
whole-web Programmable Search Engines in 2026; Brave's free tier covers
2,000 queries/month — enough for a full state backlog).

Deliberately conservative: we only accept a result whose domain visibly
matches the business name. A missed website costs us one weaker pitch; a
wrongly-attributed website puts a false claim in outreach. We optimize for
never being wrong."""
import logging
import re
from urllib.parse import urlparse

import httpx

from ..config import get_settings
from .normalize import normalize_name

log = logging.getLogger("website_finder")

BRAVE_URL = "https://api.search.brave.com/res/v1/web/search"

# Directories/socials/aggregators — never a business's own site.
NON_BUSINESS_HOSTS = (
    "facebook.", "instagram.", "yelp.", "angi.", "angieslist.", "homeadvisor.",
    "thumbtack.", "bbb.org", "yellowpages.", "yp.com", "mapquest.", "porch.",
    "houzz.", "nextdoor.", "linkedin.", "google.", "gstatic.", "youtube.",
    "birdeye.", "chamberofcommerce.", "manta.", "dnb.com", "buildzoom.",
    "expertise.com", "bark.com", "tiktok.", "x.com", "twitter.", "alignable.",
    "superpages.", "citysearch.", "foursquare.", "zoominfo.", "opencorporates.",
    "wikipedia.", "reddit.", "brave.", "bing.", "yahoo.",
)


def _domain_matches_name(domain: str, name: str) -> bool:
    """Accept only when a meaningful chunk of the business name appears in
    the domain: 'bobstreeservice.com' matches 'Bob's Tree Service LLC'."""
    tokens = [t for t in normalize_name(name).split() if len(t) >= 4]
    flat = re.sub(r"[^a-z0-9]", "", domain.lower())
    hits = sum(1 for t in tokens if t in flat)
    return hits >= 1 and (hits >= 2 or len(tokens) <= 2)


async def find_website(name: str, city: str | None, state: str) -> str | None:
    s = get_settings()
    if not s.brave_search_api_key:
        raise ValueError("BRAVE_SEARCH_API_KEY is not configured")
    q = f'"{name}" {city or ""} {state}'.strip()
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            BRAVE_URL,
            params={"q": q, "count": 10},
            headers={
                "X-Subscription-Token": s.brave_search_api_key,
                "Accept": "application/json",
            },
        )
    if r.status_code == 429:
        raise RuntimeError("Brave Search rate/quota limit hit — free tier is 1 req/sec, 2000/month")
    if r.status_code != 200:
        raise RuntimeError(f"Brave Search error {r.status_code}: {r.text[:300]}")
    for item in r.json().get("web", {}).get("results", []):
        link = item.get("url", "")
        host = urlparse(link).netloc.lower()
        if not host or any(h in host for h in NON_BUSINESS_HOSTS):
            continue
        if _domain_matches_name(host, name):
            return f"{urlparse(link).scheme}://{host}"  # site root, not deep page
    return None
