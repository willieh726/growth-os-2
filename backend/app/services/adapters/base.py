"""Adapter contract. Every data source yields RawBusiness; the pipeline
never knows or cares where a record came from. Adding Data Axle later
is a new file, zero pipeline changes."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator, Any


@dataclass
class RawBusiness:
    name: str
    industry: str                      # industry enum value
    source: str                        # ingest_source enum value
    google_place_id: str | None = None
    phone: str | None = None
    email: str | None = None
    website_url: str | None = None
    address_line: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    lat: float | None = None
    lng: float | None = None
    gbp_rating: float | None = None
    gbp_review_count: int | None = None
    gbp_photo_count: int | None = None
    gbp_types: list[str] | None = None
    business_status: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)


class BaseAdapter(ABC):
    source: str

    @abstractmethod
    def fetch(self, industry: str, state: str, cities: list[str]) -> AsyncIterator[RawBusiness]:
        """Yield raw businesses for an industry across cities in a state."""
        ...
