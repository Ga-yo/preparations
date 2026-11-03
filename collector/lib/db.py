import os
from datetime import UTC, date, datetime

from supabase import Client, create_client


def client() -> Client:
    # env only (no dotenv): run with `uv run --env-file .env python main.py <job>`
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def upsert_rows(table: str, rows: list[dict], on_conflict: str, chunk: int = 500) -> int:
    c = client()
    for i in range(0, len(rows), chunk):
        c.table(table).upsert(rows[i : i + chunk], on_conflict=on_conflict).execute()  # raises on error
    return len(rows)


def mark_freshness(dataset: str, as_of: date, source: str, note: str | None = None) -> None:
    client().table("data_freshness").upsert(
        {"dataset": dataset, "as_of": as_of.isoformat(), "source": source, "note": note,
         "collected_at": datetime.now(UTC).isoformat()},
        on_conflict="dataset",
    ).execute()
