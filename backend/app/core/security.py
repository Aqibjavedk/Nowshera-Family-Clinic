from typing import Optional, Dict, Any

try:
    from jose import jwt, JWTError
except ImportError:
    jwt = None
    class JWTError(Exception):
        pass

from app.core.config import settings
from app.db.supabase import get_supabase_client

def decode_supabase_jwt(token: str) -> Optional[Dict[str, Any]]:
    """
    Decodes and verifies a Supabase JWT token.
    Attempts local cryptographic signature verification if SUPABASE_JWT_SECRET is provided,
    or falls back to Supabase auth client verification.
    """
    if jwt and settings.SUPABASE_JWT_SECRET:
        try:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False}
            )
            return payload
        except JWTError:
            pass

    # Verify directly via Supabase Auth API
    try:
        supabase = get_supabase_client()
        user_response = supabase.auth.get_user(token)
        if user_response and user_response.user:
            return {
                "sub": user_response.user.id,
                "email": user_response.user.email,
                "app_metadata": user_response.user.app_metadata,
                "user_metadata": user_response.user.user_metadata
            }
    except Exception:
        pass

    return None
