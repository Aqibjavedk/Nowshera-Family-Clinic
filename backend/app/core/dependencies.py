from typing import Callable, List
from app.core.exceptions import HTTPException, status

try:
    from fastapi import Depends
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
    security_scheme = HTTPBearer(auto_error=True)
except ImportError:
    def Depends(dependency=None):
        return dependency
    class HTTPAuthorizationCredentials:
        def __init__(self, credentials: str):
            self.credentials = credentials
    security_scheme = None

from app.core.security import decode_supabase_jwt
from app.db.supabase import get_supabase_client, get_supabase_admin
from app.schemas.user import UserProfile, UserRole

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
) -> UserProfile:
    """
    Authenticates the request via Bearer token, validates against Supabase,
    and loads the authenticated user's profile and verified database role.
    Rejects any unauthenticated or spoofed request with 401 Unauthorized.
    """
    token = credentials.credentials
    payload = decode_supabase_jwt(token)

    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload["sub"]

    try:
        # Fetch verified profile directly from the PostgreSQL profiles table
        supabase = get_supabase_admin()
        res = supabase.table("profiles").select("*").eq("id", user_id).limit(1).execute()

        if res.data and len(res.data) > 0:
            profile_data = res.data[0]
            return UserProfile(**profile_data)

        # Check verified JWT payload metadata if profile query returned no rows
        jwt_role = (
            payload.get("app_metadata", {}).get("role")
            or payload.get("user_metadata", {}).get("role")
            or payload.get("role")
        )
        if jwt_role and jwt_role in [r.value for r in UserRole]:
            return UserProfile(
                id=user_id,
                email=payload.get("email", ""),
                full_name=payload.get("user_metadata", {}).get("full_name", "Clinic User"),
                role=jwt_role,
                phone=payload.get("user_metadata", {}).get("phone")
            )

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found in clinic records"
        )

    except HTTPException:
        raise
    except Exception as e:
        # Fallback to verified JWT metadata if database query encounters an error
        jwt_role = (
            payload.get("app_metadata", {}).get("role")
            or payload.get("user_metadata", {}).get("role")
        )
        if jwt_role and jwt_role in [r.value for r in UserRole]:
            return UserProfile(
                id=user_id,
                email=payload.get("email", ""),
                full_name=payload.get("user_metadata", {}).get("full_name", "Clinic User"),
                role=jwt_role,
                phone=payload.get("user_metadata", {}).get("phone")
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error verifying user profile: {str(e)}"
        )

def require_role(required_role: str) -> Callable:
    """
    Dependency factory enforcing that the authenticated user possesses the specific required role.
    Example: Depends(require_role("patient")) or Depends(require_role("doctor"))
    """
    async def role_checker(
        current_user: UserProfile = Depends(get_current_user)
    ) -> UserProfile:
        user_role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if user_role_val != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires '{required_role}' role"
            )
        return current_user

    return role_checker

def require_any_role(*allowed_roles: str) -> Callable:
    """
    Dependency factory allowing access to any of the specified roles.
    """
    async def roles_checker(
        current_user: UserProfile = Depends(get_current_user)
    ) -> UserProfile:
        user_role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if user_role_val not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of {allowed_roles}"
            )
        return current_user

    return roles_checker
