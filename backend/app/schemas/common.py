from datetime import datetime
from pydantic import BaseModel
from typing import Optional, Any

class HealthResponse(BaseModel):
    status: str
    project: str
    version: str
    timestamp: datetime

class APIResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    data: Optional[Any] = None
