"""Fetch + statically analyze a business website. Produces the raw
signals the scorer consumes. Static HTML analysis (no headless browser)
is a deliberate tradeoff: it covers >95% of small-contractor sites,
costs ~nothing, and runs thousands/hour. A Playwright pass can be added
later behind the same snapshot table."""
import re
import time
from dataclasses import dataclass, asdict
from datetime import datetime

import httpx
from bs4 import BeautifulSoup

from .normalize import is_social_only

UA = "Mozilla/5.0 (compatible; GrowthOS-Auditor/1.0; +https://yourdomain.com/bot)"

BUILDER_HINTS = {
    "wix": ["wix.com", "wixstatic", "wixsite"],
    "godaddy": ["godaddy", "wsimg.com"],
    "squarespace": ["squarespace"],
    "weebly": ["weebly"],
    "wordpress": ["wp-content", "wp-includes"],
    "duda": ["dudaone", "duda.co"],
}

QUOTE_WORDS = re.compile(
    r"(free (estimate|quote)|request (a )?(quote|estimate)|get (a )?(quote|estimate)|schedule (service|now|online)|book (now|online))",
    re.IGNORECASE,
)


@dataclass
class SiteSignals:
    url: str | None = None
    reachable: bool = False
    status_code: int | None = None
    is_https: bool | None = None
    has_viewport_meta: bool | None = None
    has_contact_form: bool | None = None
    has_quote_cta: bool | None = None
    has_title: bool | None = None
    title_text: str | None = None
    has_meta_description: bool | None = None
    has_h1: bool | None = None
    has_schema_org: bool | None = None
    copyright_year: int | None = None
    detected_builder: str | None = None
    page_bytes: int | None = None
    load_ms: int | None = None
    error: str | None = None


async def analyze_website(url: str | None) -> SiteSignals:
    if not url or is_social_only(url):
        return SiteSignals(url=url, reachable=False, error="no_real_website")
    sig = SiteSignals(url=url)
    try:
        t0 = time.monotonic()
        async with httpx.AsyncClient(
            timeout=15, follow_redirects=True, headers={"User-Agent": UA}
        ) as client:
            resp = await client.get(url)
        sig.load_ms = int((time.monotonic() - t0) * 1000)
        sig.status_code = resp.status_code
        sig.is_https = str(resp.url).startswith("https://")
        # Bot-protection responses (Cloudflare & co.) mean "site exists but
        # won't talk to robots" — NOT "site is down". Scoring a healthy site
        # as unreachable poisons outreach copy with false claims.
        if resp.status_code in (401, 403, 405, 406, 409, 429):
            sig.reachable = True
            sig.error = "bot_blocked"
            return sig
        sig.reachable = resp.status_code < 400
        if not sig.reachable:
            return sig
        html = resp.text
        sig.page_bytes = len(resp.content)
        soup = BeautifulSoup(html, "lxml")

        sig.has_viewport_meta = bool(soup.find("meta", attrs={"name": "viewport"}))
        title = soup.find("title")
        sig.has_title = bool(title and title.get_text(strip=True))
        sig.title_text = title.get_text(strip=True)[:200] if title else None
        sig.has_meta_description = bool(
            soup.find("meta", attrs={"name": "description", "content": True})
        )
        sig.has_h1 = bool(soup.find("h1"))
        sig.has_schema_org = "schema.org" in html
        sig.has_contact_form = bool(
            soup.find("form") or soup.find("input", attrs={"type": "email"})
        )
        sig.has_quote_cta = bool(QUOTE_WORDS.search(soup.get_text(" ", strip=True)[:80000]))

        years = [int(y) for y in re.findall(r"(?:©|&copy;|copyright)\s*(20\d{2})", html, re.I)]
        sig.copyright_year = max(years) if years else None

        low = html.lower()
        for builder, hints in BUILDER_HINTS.items():
            if any(h in low for h in hints):
                sig.detected_builder = builder
                break
    except Exception as e:  # noqa: BLE001 — a dead site is data, not a failure
        sig.error = type(e).__name__
        sig.reachable = False
    return sig


async def save_snapshot(conn, business_id: str, sig: SiteSignals) -> None:
    await conn.execute(
        """insert into website_snapshots
             (business_id, url, reachable, status_code, is_https, has_viewport_meta,
              has_contact_form, has_quote_cta, has_title, title_text,
              has_meta_description, has_h1, has_schema_org, copyright_year,
              detected_builder, page_bytes, load_ms, raw_signals)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)""",
        business_id, sig.url, sig.reachable, sig.status_code, sig.is_https,
        sig.has_viewport_meta, sig.has_contact_form, sig.has_quote_cta,
        sig.has_title, sig.title_text, sig.has_meta_description, sig.has_h1,
        sig.has_schema_org, sig.copyright_year, sig.detected_builder,
        sig.page_bytes, sig.load_ms, asdict(sig),
    )


def current_year() -> int:
    return datetime.now().year
