"""ICAO 9303 MRZ parsing and checksum validation (TD1/TD2/TD3)."""

import re
from typing import Any, Dict, List, Optional

_MRZ_CHARSET = re.compile(r"^[A-Z0-9<]+$")
_WEIGHTS = [7, 3, 1]

_COUNTRY_FIXUPS = {"NIGERIA": "NGA"}


def _check_digit(field: str) -> int:
    total = 0
    for i, ch in enumerate(field):
        if ch.isdigit():
            value = int(ch)
        elif ch == "<":
            value = 0
        else:
            value = ord(ch) - 55  # A=10
        total += value * _WEIGHTS[i % 3]
    return total % 10


def _clean_line(line: str) -> str:
    return re.sub(r"[^A-Z0-9<]", "", line.upper())


def find_mrz_lines(text: str) -> List[str]:
    """Extract plausible MRZ lines from OCR text."""
    candidates = []
    for raw in text.splitlines():
        line = _clean_line(raw)
        if len(line) in (30, 36, 44) and _MRZ_CHARSET.match(line):
            candidates.append(line)
    return candidates


def _parse_date(value: str) -> Optional[str]:
    if not re.fullmatch(r"\d{6}", value):
        return None
    year, month, day = int(value[:2]), int(value[2:4]), int(value[4:6])
    year += 2000 if year < 50 else 1900
    try:
        return f"{year:04d}-{month:02d}-{day:02d}"
    except ValueError:
        return None


def parse_mrz(lines: List[str]) -> Optional[Dict[str, Any]]:
    """Parse TD3 (2x44) or TD1 (3x30) MRZ blocks; validate check digits."""
    checks: Dict[str, bool] = {}
    if len(lines) >= 2 and all(len(l) == 44 for l in lines[:2]):
        line1, line2 = lines[0], lines[1]
        document_number = line2[:9].rstrip("<")
        checks["document_number_checksum"] = _check_digit(line2[:9]) == _digit_at(line2, 9)
        birth = line2[13:19]
        checks["birth_date_checksum"] = _check_digit(birth) == _digit_at(line2, 19)
        expiry = line2[21:27]
        checks["expiry_checksum"] = _check_digit(expiry) == _digit_at(line2, 27)
        composite = line2[:10] + line2[13:20] + line2[21:43]
        checks["composite_checksum"] = _check_digit(composite) == _digit_at(line2, 43)

        names = line1[5:].split("<<", 1)
        surname = names[0].replace("<", " ").strip()
        given = names[1].replace("<", " ").strip() if len(names) > 1 else ""
        return {
            "format": "TD3",
            "document_code": line1[:2].rstrip("<"),
            "issuing_state": line1[2:5],
            "surname": surname,
            "given_names": given,
            "document_number": document_number,
            "nationality": line2[10:13],
            "date_of_birth": _parse_date(birth),
            "sex": line2[20],
            "expiration_date": _parse_date(expiry),
            "personal_number": line2[28:42].rstrip("<") or None,
            "checks": checks,
            "valid": all(checks.values()),
        }

    if len(lines) >= 3 and all(len(l) == 30 for l in lines[:3]):
        line1, line2, line3 = lines[0], lines[1], lines[2]
        document_number = line1[5:14].rstrip("<")
        checks["document_number_checksum"] = _check_digit(line1[5:14]) == _digit_at(line1, 14)
        birth = line2[:6]
        checks["birth_date_checksum"] = _check_digit(birth) == _digit_at(line2, 6)
        expiry = line2[8:14]
        checks["expiry_checksum"] = _check_digit(expiry) == _digit_at(line2, 14)
        composite = line1[5:30] + line2[:7] + line2[8:15] + line2[18:29]
        checks["composite_checksum"] = _check_digit(composite) == _digit_at(line2, 29)

        names = line3.split("<<", 1)
        surname = names[0].replace("<", " ").strip()
        given = names[1].replace("<", " ").strip() if len(names) > 1 else ""
        return {
            "format": "TD1",
            "document_code": line1[:2].rstrip("<"),
            "issuing_state": line1[2:5],
            "surname": surname,
            "given_names": given,
            "document_number": document_number,
            "nationality": line2[15:18],
            "date_of_birth": _parse_date(birth),
            "sex": line2[7],
            "expiration_date": _parse_date(expiry),
            "personal_number": None,
            "checks": checks,
            "valid": all(checks.values()),
        }

    return None


def _digit_at(line: str, idx: int) -> int:
    ch = line[idx]
    return int(ch) if ch.isdigit() else 0
