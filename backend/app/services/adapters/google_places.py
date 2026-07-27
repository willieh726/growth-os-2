"""Google Places API (New) adapter.

Uses Text Search with per-city queries ("septic service in Danbury CT").
Field mask keeps cost at the "Pro" SKU tier; we request exactly what
scoring needs. Pagination via nextPageToken (max 60 results per query —
which is why we query per-city, not per-state)."""
import asyncio
from typing import AsyncIterator

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from ...config import get_settings
from .base import BaseAdapter, RawBusiness

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

FIELD_MASK = ",".join([
    "places.id", "places.displayName", "places.formattedAddress",
    "places.addressComponents", "places.location",
    "places.nationalPhoneNumber", "places.websiteUri",
    "places.rating", "places.userRatingCount", "places.types",
    "places.businessStatus", "places.photos",
    "nextPageToken",
])

# Query phrasing matters: these produce far fewer irrelevant results
# than the raw industry name.
INDUSTRY_QUERIES: dict[str, str] = {
    "tree_service": "tree removal service",
    "excavation": "excavation contractor",
    "septic": "septic tank service",
    "concrete": "concrete contractor",
    "hvac": "HVAC contractor",
    "plumbing": "plumber",
    "electrical": "electrician",
    "roofing": "roofing contractor",
    "landscaping": "landscaping company",
    "pressure_washing": "pressure washing service",
    "cleaning": "cleaning service",
}


class GooglePlacesAdapter(BaseAdapter):
    source = "google_places"

    def __init__(self, client: httpx.AsyncClient | None = None):
        self._client = client or httpx.AsyncClient(timeout=30)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8), reraise=True)
    async def _search(self, query: str, page_token: str | None) -> dict:
        body: dict = {"textQuery": query, "pageSize": 20}
        if page_token:
            body["pageToken"] = page_token
        r = await self._client.post(
            SEARCH_URL,
            json=body,
            headers={
                "X-Goog-Api-Key": get_settings().google_places_api_key,
                "X-Goog-FieldMask": FIELD_MASK,
            },
        )
        if r.status_code >= 400:
            # Surface Google's real explanation — without it, failures are undiagnosable.
            raise RuntimeError(f"Google Places error {r.status_code}: {r.text[:500]}")
        return r.json()

    async def fetch(
        self, industry: str, state: str, cities: list[str]
    ) -> AsyncIterator[RawBusiness]:
        base_q = INDUSTRY_QUERIES.get(industry, industry.replace("_", " "))
        # Google caps Text Search at 60 results (3 pages of 20). HARD-cap the
        # page loop and bail on repeated tokens: in production Google was
        # observed returning nextPageToken indefinitely, and an unbounded
        # while-True turned one city into an infinite paid API loop.
        max_pages = 3
        for city in cities:
            query = f"{base_q} in {city} {state}"
            token: str | None = None
            seen_tokens: set[str] = set()
            seen_place_ids: set[str] = set()
            for _page in range(max_pages):
                data = await self._search(query, token)
                for p in data.get("places", []):
                    pid = p.get("id")
                    if pid and pid in seen_place_ids:
                        continue  # Google repeated a result — don't re-yield
                    if pid:
                        seen_place_ids.add(pid)
                    rb = self._to_raw(p, industry, state)
                    if rb:
                        yield rb
                token = data.get("nextPageToken")
                if not token or token in seen_tokens:
                    break
                seen_tokens.add(token)
                await asyncio.sleep(1.5)  # token warm-up per Google docs

    def _to_raw(self, p: dict, industry: str, state: str) -> RawBusiness | None:
        name = (p.get("displayName") or {}).get("text")
        if not name:
            return None
        comps = {t: c for c in p.get("addressComponents", []) for t in c.get("types", [])}
        comp_state = (comps.get("administrative_area_level_1") or {}).get("shortText")
        if comp_state and comp_state != state:
            return None  # Google bleeds over borders; enforce the target state
        loc = p.get("location") or {}
        return RawBusiness(
            name=name,
            industry=industry,
            source=self.source,
            google_place_id=p.get("id"),
            phone=p.get("nationalPhoneNumber"),
            website_url=p.get("websiteUri"),
            address_line=(comps.get("street_number", {}).get("shortText", "") + " "
                          + comps.get("route", {}).get("shortText", "")).strip() or None,
            city=(comps.get("locality") or comps.get("postal_town") or {}).get("shortText"),
            state=comp_state or state,
            zip=(comps.get("postal_code") or {}).get("shortText"),
            lat=loc.get("latitude"),
            lng=loc.get("longitude"),
            gbp_rating=p.get("rating"),
            gbp_review_count=p.get("userRatingCount"),
            gbp_photo_count=len(p.get("photos") or []),
            gbp_types=p.get("types"),
            business_status=p.get("businessStatus"),
            payload=p,
        )
