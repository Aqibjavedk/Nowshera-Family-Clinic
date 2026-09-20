from typing import Optional, Dict
try:
    from pydantic import BaseModel, Field
except ImportError:
    class BaseModel:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)
        def dict(self):
            return self.__dict__
    def Field(default=..., description=None, **kwargs):
        return default

class AdminClinicStats(BaseModel):
    total_doctors: int = Field(0)
    active_doctors: int = Field(0)
    total_patients: int = Field(0)
    today_appointments: int = Field(0)
    pending_appointments: int = Field(0)
    confirmed_appointments: int = Field(0)
    completed_appointments: int = Field(0)
    no_show_appointments: int = Field(0)
    cancelled_appointments: int = Field(0)

class PatientSummary(BaseModel):
    id: str = Field(...)
    full_name: str = Field(...)
    email: str = Field(...)
    phone: Optional[str] = Field(None)
    created_at: str = Field(...)
    total_appointments: int = Field(0)
    pending_appointments: int = Field(0)
    confirmed_appointments: int = Field(0)
    completed_appointments: int = Field(0)
    cancelled_appointments: int = Field(0)
    no_show_appointments: int = Field(0)
