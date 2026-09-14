"""Lookup for carrier modules that expose optional shipping capabilities."""

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class ConfigField:
    key: str
    label: str
    type: str = "text"
    help: str = ""
    placeholder: str = ""
    options: Optional[list[dict]] = None


_REGISTRY: dict[str, Any] = {}


def register(carrier: Any) -> Any:
    _REGISTRY[carrier.id] = carrier
    return carrier


def get_carrier(provider_id: str) -> Optional[Any]:
    """Return the configured carrier implementation by provider id."""
    return _REGISTRY.get(provider_id)
