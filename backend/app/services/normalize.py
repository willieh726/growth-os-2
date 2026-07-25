"""Canonicalization used by dedup. Deterministic and pure — unit-testable."""
import re

_SUFFIXES = re.compile(
    r"\b(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corp\.|co|co\.|company|"
    r"ltd|ltd\.|llp|pllc|pc|p\.c\.|the)\b",
    re.IGNORECASE,
)
_NON_ALNUM = re.compile(r"[^a-z0-9 ]")
_WS = re.compile(r"\s+")


def normalize_name(name: str) -> str:
    n = name.lower()
    n = _SUFFIXES.sub(" ", n)
    n = _NON_ALNUM.sub(" ", n)
    return _WS.sub(" ", n).strip()


def normalize_phone(phone: str | None) -> str | None:
    """Digits only, strip US country code. '+1 (860) 555-0123' -> '8605550123'."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits if len(digits) == 10 else (digits or None)


def normalize_website(url: str | None) -> str | None:
    if not url:
        return None
    url = url.strip()
    if not url:
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    # Facebook/Google-hosted pages are not "having a website" for scoring;
    # keep the URL but the analyzer treats these as no real site.
    return url.rstrip("/")


SOCIAL_HOSTS = ("facebook.com", "instagram.com", "business.site", "linktr.ee", "yelp.com")


def is_social_only(url: str | None) -> bool:
    if not url:
        return False
    return any(h in url.lower() for h in SOCIAL_HOSTS)
