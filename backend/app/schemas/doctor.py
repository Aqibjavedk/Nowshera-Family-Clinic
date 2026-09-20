from datetime import time, date
from typing import Optional, List

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

class SpecialtyBase(BaseModel):
    id: str = Field(...)
    name: str = Field(...)
    description: Optional[str] = Field(None)

class WorkingHoursBase(BaseModel):
    day_of_week: int = Field(..., description="0=Sun, 1=Mon, ..., 6=Sat")
    start_time: str = Field(..., description="HH:MM:SS or HH:MM")
    end_time: str = Field(..., description="HH:MM:SS or HH:MM")
    is_available: bool = Field(True)

class DoctorListItem(BaseModel):
    id: str = Field(...)
    full_name: str = Field(...)
    email: str = Field(...)
    phone: Optional[str] = Field(None)
    qualification: str = Field(...)
    bio: Optional[str] = Field(None)
    is_active: bool = Field(True)
    specialty: SpecialtyBase = Field(...)

class DoctorDetail(DoctorListItem):
    working_hours: Optional[List[WorkingHoursBase]] = Field([])

class DoctorCreate(BaseModel):
    full_name: str = Field(..., description="Doctor's full name with title")
    email: str = Field(..., description="Doctor's professional email")
    phone: Optional[str] = Field(None, description="Doctor's contact phone")
    specialty_id: str = Field(..., description="UUID of medical specialty")
    qualification: str = Field(..., description="Degrees, certifications, and fellowships")
    bio: Optional[str] = Field(None, description="Short professional summary")
    password: Optional[str] = Field("Doctor123!@", description="Initial password for account login")
    is_active: bool = Field(True, description="Whether doctor is active for clinic bookings")

class DoctorUpdate(BaseModel):
    full_name: Optional[str] = Field(None)
    phone: Optional[str] = Field(None)
    specialty_id: Optional[str] = Field(None)
    qualification: Optional[str] = Field(None)
    bio: Optional[str] = Field(None)
    is_active: Optional[bool] = Field(None)

class DoctorStatusUpdate(BaseModel):
    is_active: bool = Field(..., description="True to activate, False to deactivate")

class WorkingHoursUpdateItem(BaseModel):
    day_of_week: int = Field(..., description="0=Sun, 1=Mon ... 6=Sat")
    start_time: str = Field(..., description="HH:MM")
    end_time: str = Field(..., description="HH:MM")
    is_available: bool = Field(..., description="Whether practicing on this weekday")

class WorkingHoursUpdate(BaseModel):
    working_hours: List[WorkingHoursUpdateItem] = Field(..., description="7-day weekly schedule")

class DoctorLeaveCreate(BaseModel):
    leave_date: str = Field(..., description="Date of leave in YYYY-MM-DD format")
    reason: Optional[str] = Field(None, description="Optional leave explanation")

class DoctorLeaveResponse(BaseModel):
    id: str = Field(...)
    doctor_id: str = Field(...)
    leave_date: str = Field(...)
    reason: Optional[str] = Field(None)
    created_at: str = Field(...)
