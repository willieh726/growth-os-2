"""Opportunity Score v1 — 0..100, higher = better sales opportunity.

Design rules:
- Every point is explainable: breakdown stores {points, max, reason}
  per signal. The audit generator and cold emails quote these reasons,
  so scoring quality directly drives copy quality.
- Weights are versioned (WEIGHTS_VERSION) and scores are append-only:
  when we re-tune weights against reply-rate data, old cohorts stay
  comparable.
- "No website" dominates by design (25 pts): it is the cleanest buying
  signal for an agency selling websites.
"""
from dataclasses import dataclass
from .website_analyzer import SiteSignals, current_year

WEIGHTS_VERSION = "v1"

MAX = {
    "no_website": 25,
    "outdated_website": 15,
    "poor_mobile": 10,
    "weak_gbp": 10,
    "low_reviews": 15,
    "no_contact_form": 10,
    "no_quote_request": 5,
    "poor_seo": 10,
}  # total 100


@dataclass
class BusinessFacts:
    has_website: bool
    website_url: str | None
    gbp_rating: float | None
    gbp_review_count: int | None
    gbp_photo_count: int | None
    # Site exists but was found via web search, NOT linked on their Google
    # Business Profile — a real (and honestly-pitchable) visibility problem.
    website_discovered: bool = False


def compute_score(facts: BusinessFacts, site: SiteSignals) -> tuple[int, dict]:
    b: dict[str, dict] = {}
    no_site = not facts.has_website or not site.reachable
    # Bot-blocked: site exists and works for humans, but refused our crawler.
    # RULE: a blocked site earns ZERO points from anything we couldn't verify —
    # outreach must never contain claims we can't back up.
    blocked = site.error == "bot_blocked"
    UNKNOWN = "couldn't inspect (site blocks automated tools) — verify manually"

    # 1. No website — the headline signal.
    if no_site:
        reason = "No website at all" if not facts.has_website else \
                 f"Website listed but unreachable ({site.error or site.status_code})"
        b["no_website"] = {"points": MAX["no_website"], "max": MAX["no_website"], "reason": reason}
    elif facts.website_discovered:
        b["no_website"] = {
            "points": 10, "max": MAX["no_website"],
            "reason": "Has a website, but it's NOT linked on their Google Business "
                      "Profile — customers finding them on Maps never see it",
        }
    else:
        b["no_website"] = {"points": 0, "max": MAX["no_website"],
                           "reason": "Has a website (blocked our inspection)" if blocked
                           else "Has a working website"}

    # 2. Outdated website (only meaningful when a site exists and was readable).
    pts, reasons = 0, []
    if not no_site and not blocked:
        if site.is_https is False:
            pts += 6; reasons.append("no HTTPS (browsers flag it 'Not Secure')")
        if site.copyright_year and site.copyright_year <= current_year() - 3:
            pts += 5; reasons.append(f"copyright frozen at {site.copyright_year}")
        if site.detected_builder in ("wix", "godaddy", "weebly"):
            pts += 4; reasons.append(f"legacy DIY builder ({site.detected_builder})")
    b["outdated_website"] = {
        "points": min(pts, MAX["outdated_website"]), "max": MAX["outdated_website"],
        "reason": "; ".join(reasons) or ("n/a — no site" if no_site
                                         else UNKNOWN if blocked else "Site looks current"),
    }

    # 3. Poor mobile experience.
    if no_site:
        mob = {"points": 0, "max": MAX["poor_mobile"], "reason": "n/a — no site"}
    elif blocked:
        mob = {"points": 0, "max": MAX["poor_mobile"], "reason": UNKNOWN}
    elif site.has_viewport_meta is False:
        mob = {"points": MAX["poor_mobile"], "max": MAX["poor_mobile"],
               "reason": "No viewport meta tag — site not mobile-responsive"}
    elif (site.load_ms or 0) > 6000:
        mob = {"points": 5, "max": MAX["poor_mobile"], "reason": f"Slow load ({site.load_ms}ms)"}
    else:
        mob = {"points": 0, "max": MAX["poor_mobile"], "reason": "Mobile-ready"}
    b["poor_mobile"] = mob

    # 4. Weak Google Business Profile.
    pts, reasons = 0, []
    if facts.gbp_rating is None:
        pts += 5; reasons.append("no rating (unclaimed or brand-new profile)")
    elif facts.gbp_rating < 4.0:
        pts += 4; reasons.append(f"rating {facts.gbp_rating} below 4.0")
    if (facts.gbp_photo_count or 0) < 3:
        pts += 5; reasons.append(f"only {facts.gbp_photo_count or 0} photos on profile")
    b["weak_gbp"] = {"points": min(pts, MAX["weak_gbp"]), "max": MAX["weak_gbp"],
                     "reason": "; ".join(reasons) or "Healthy Google profile"}

    # 5. Low review count — linear ramp: 0 reviews = full points, 25+ = 0.
    rc = facts.gbp_review_count or 0
    pts = max(0, round(MAX["low_reviews"] * (1 - min(rc, 25) / 25)))
    b["low_reviews"] = {"points": pts, "max": MAX["low_reviews"],
                        "reason": f"{rc} Google reviews (competitors in CT average 40+)"}

    # 6 & 7. Contact form / quote request.
    if blocked:
        b["no_contact_form"] = {"points": 0, "max": MAX["no_contact_form"], "reason": UNKNOWN}
        b["no_quote_request"] = {"points": 0, "max": MAX["no_quote_request"], "reason": UNKNOWN}
    else:
        b["no_contact_form"] = {
            "points": MAX["no_contact_form"] if (no_site or site.has_contact_form is False) else 0,
            "max": MAX["no_contact_form"],
            "reason": "No way to contact them online except calling"
            if (no_site or site.has_contact_form is False) else "Has contact form",
        }
        b["no_quote_request"] = {
            "points": MAX["no_quote_request"] if (no_site or site.has_quote_cta is False) else 0,
            "max": MAX["no_quote_request"],
            "reason": "No online estimate/quote request — losing after-hours jobs"
            if (no_site or site.has_quote_cta is False) else "Has quote CTA",
        }

    # 8. Poor SEO basics.
    pts, reasons = 0, []
    if no_site:
        pts = MAX["poor_seo"]; reasons.append("no site to rank")
    elif blocked:
        reasons.append(UNKNOWN)
    else:
        if not site.has_title: pts += 3; reasons.append("missing <title>")
        if not site.has_meta_description: pts += 3; reasons.append("missing meta description")
        if not site.has_h1: pts += 2; reasons.append("missing H1")
        if not site.has_schema_org: pts += 2; reasons.append("no LocalBusiness schema markup")
    b["poor_seo"] = {"points": min(pts, MAX["poor_seo"]), "max": MAX["poor_seo"],
                     "reason": "; ".join(reasons) or "SEO basics in place"}

    total = sum(v["points"] for v in b.values())
    return min(total, 100), b


async def score_and_store(conn, business_id: str, facts: BusinessFacts, site: SiteSignals) -> int:
    total, breakdown = compute_score(facts, site)
    await conn.execute(
        """insert into opportunity_scores (business_id, total, breakdown, weights_version)
           values ($1, $2, $3, $4)""",
        business_id, total, breakdown, WEIGHTS_VERSION,
    )
    return total
