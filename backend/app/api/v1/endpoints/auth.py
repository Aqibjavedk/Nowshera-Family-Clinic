from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_user
from app.schemas.user import UserProfile

router = APIRouter()

@router.get("/me", response_model=UserProfile, summary="Get Current Authenticated User")
async def get_me(current_user: UserProfile = Depends(get_current_user)):
    """
    Returns the authenticated user's profile and server-verified role.
    Requires Bearer JWT token in Authorization header.
    """
    return current_user
