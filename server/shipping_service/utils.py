from typing import Any


def money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except Exception:
        return 0.0
