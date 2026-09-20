from typing import Optional

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = Any = object

from app.core.config import settings

_supabase_client: Optional[Client] = None
_supabase_admin_client: Optional[Client] = None

def get_supabase_client() -> Client:
    """
    Returns the Supabase client initialized with public/anon key.
    """
    global _supabase_client
    if _supabase_client is None:
        if create_client is None:
            raise RuntimeError("supabase-py library is not installed.")
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY environment variables must be configured."
            )
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase_client

def get_supabase_admin() -> Client:
    """
    Returns the Supabase client initialized with the privileged service_role key.
    Used exclusively for administrative tasks and role overrides.
    """
    global _supabase_admin_client
    if _supabase_admin_client is None:
        if create_client is None:
            raise RuntimeError("supabase-py library is not installed.")
        key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
        if not settings.SUPABASE_URL or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be configured."
            )
        _supabase_admin_client = create_client(settings.SUPABASE_URL, key)
    return _supabase_admin_client
