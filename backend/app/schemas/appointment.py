from datetime import datetime
from enum import Enum
from typing import Optional

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

class AppointmentStatusEnum(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"

class SlotResponse(BaseModel):
    start_time: str = Field(..., description="ISO 8601 slot start time in Asia/Karachi (e.g. 2026-09-20T09:00:00+05:00)")
    end_time: str = Field(..., description="ISO 8601 slot end time in Asia/Karachi (e.g. 2026-09-20T09:30:00+05:00)")
    available: bool = Field(..., description="True if slot is free and valid for booking")

class AppointmentCreate(BaseModel):
    doctor_id: str = Field(..., description="UUID of the selected doctor")
    start_time: str = Field(..., description="Requested 30-minute slot start time with timezone offset")

class AppointmentCancel(BaseModel):
    reason: Optional[str] = Field(None, description="Optional cancellation reason")

class AppointmentReschedule(BaseModel):
    new_start_time: str = Field(..., description="New requested 30-minute slot start time with timezone offset")

class DoctorBrief(BaseModel):
    id: str = Field(None)
    full_name: str = Field(None)
    qualification: str = Field(None)
    specialty: str = Field(None)

class PatientBrief(BaseModel):
    id: str = Field(None)
    full_name: str = Field(None)
    email: str = Field(None)
    phone: Optional[str] = Field(None)

class AppointmentResponse(BaseModel):
    id: str = Field(None)
    patient_id: str = Field(None)
    doctor_id: str = Field(None)
    start_time: str = Field(None)
    end_time: str = Field(None)
    status: str = Field(None)
    cancellation_reason: Optional[str] = Field(None)
    cancelled_by: Optional[str] = Field(None)
    created_at: str = Field(None)
    doctor: Optional[DoctorBrief] = Field(None)
    patient: Optional[PatientBrief] = Field(None)
    specialty: Optional[str] = Field(None)
