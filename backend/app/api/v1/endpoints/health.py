from datetime import datetime, timezone
from fastapi import APIRouter
from app.schemas.common import HealthResponse
from app.core.config import settings

router = APIRouter()

@router.get("/health", response_model=HealthResponse, summary="Health Check")
async def health_check():
    """
    Returns server operational status, project name, version, and current UTC timestamp.
    """
    return HealthResponse(
        status="healthy",
        project=settings.PROJECT_NAME,
        version=settings.VERSION,
        timestamp=datetime.now(timezone.utc)
    )
