"""Website discovery: for businesses whose Google listing has no website,
search the web for one. Uses Google's Programmable Search API (legitimate,
100 free queries/day, $5/1000 after).

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

SEARCH_URL = "https://www.googleapis.com/customsearch/v1"

# Directories/socials/aggregators — never a business's own site.
NON_BUSINESS_HOSTS = (
    "facebook.", "instagram.", "yelp.", "angi.", "angieslist.", "homeadvisor.",
    "thumbtack.", "bbb.org", "yellowpages.", "yp.com", "mapquest.", "porch.",
    "houzz.", "nextdoor.", "linkedin.", "google.", "gstatic.", "youtube.",
    "birdeye.", "chamberofcommerce.", "manta.", "dnb.com", "buildzoom.",
    "expertise.com", "bark.com", "tiktok.", "x.com", "twitter.", "alignable.",
    "superpages.", "citysearch.", "foursquare.", "zoominfo.", "opencorporates.",
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
    if not s.google_cse_id:
        raise ValueError("GOOGLE_CSE_ID is not configured")
    q = f'"{name}" {city or ""} {state}'.strip()
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(SEARCH_URL, params={
            "key": s.google_places_api_key, "cx": s.google_cse_id, "q": q, "num": 8,
        })
    if r.status_code != 200:
        raise RuntimeError(f"Custom Search error {r.status_code}: {r.text[:300]}")
    for item in r.json().get("items", []):
        link = item.get("link", "")
        host = urlparse(link).netloc.lower()
        if not host or any(h in host for h in NON_BUSINESS_HOSTS):
            continue
        if _domain_matches_name(host, name):
            # Return the site root, not a deep page.
            return f"{urlparse(link).scheme}://{host}"
    return None
