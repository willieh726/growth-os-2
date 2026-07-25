"""CSV adapter for state registry / purchased list imports.
Expected headers (case-insensitive, extras ignored):
name, phone, email, website, address, city, state, zip
Anything Google doesn't have (e.g. brand-new registrations with no GBP)
enters the same pipeline and dedups against existing rows."""
import csv
import io
from typing import AsyncIterator

from .base import BaseAdapter, RawBusiness


class CSVAdapter(BaseAdapter):
    source = "csv_registry"

    def __init__(self, csv_text: str):
        self._text = csv_text

    async def fetch(
        self, industry: str, state: str, cities: list[str]
    ) -> AsyncIterator[RawBusiness]:
        reader = csv.DictReader(io.StringIO(self._text))
        for row in reader:
            r = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            if not r.get("name"):
                continue
            yield RawBusiness(
                name=r["name"],
                industry=industry,
                source=self.source,
                phone=r.get("phone") or None,
                email=r.get("email") or None,
                website_url=r.get("website") or None,
                address_line=r.get("address") or None,
                city=r.get("city") or None,
                state=(r.get("state") or state).upper()[:2],
                zip=r.get("zip") or None,
                payload={"csv_row": r},
            )
