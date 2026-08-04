from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Return a cached Supabase client using the service role key.
    The service role key bypasses Row Level Security — use only server-side.
    """
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set to use the Supabase client")
    return create_client(settings.supabase_url, settings.supabase_key)


def get_storage_bucket(bucket_name: str):
    """Return a Supabase Storage bucket handle."""
    return get_supabase_client().storage.from_(bucket_name)
