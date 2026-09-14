"""Database and service-token dependencies for seller shipping operations."""

import os
from pathlib import Path
from typing import Optional

import psycopg
from dotenv import load_dotenv
from fastapi import Header, HTTPException
from psycopg.rows import dict_row

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def clean_env_value(value: str) -> str:
    return (
        (value or "").strip().strip('"').strip("'").strip()
        .replace("\\r", "").replace("\\n", "")
        .replace("\r", "").replace("\n", "")
    )


def db():
    database_url = clean_env_value(os.getenv("DATABASE_URL", ""))
    if not database_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL is not configured")
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        yield conn


def require_service(x_service_token: Optional[str] = Header(default=None)) -> bool:
    token = clean_env_value(os.getenv("SHIPPING_SERVICE_TOKEN") or os.getenv("CUSTOM_API_SERVICE_TOKEN"))
    if not token:
        raise HTTPException(status_code=500, detail="SHIPPING_SERVICE_TOKEN is not configured")
    if x_service_token != token:
        raise HTTPException(status_code=401, detail="Invalid shipping service token")
    return True
