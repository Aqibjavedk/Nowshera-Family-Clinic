from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from app.core.dependencies import get_current_user, require_role
from app.db.supabase import get_supabase_admin
from app.schemas.user import UserProfile
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentResponse,
    AppointmentCancel,
    AppointmentReschedule
)
from app.services.appointment_service import AppointmentService

router = APIRouter()

def get_appointment_service() -> AppointmentService:
    admin_client = get_supabase_admin()
    return AppointmentService(admin_client)

# ==============================================================================
# 1. Appointment Creation (Patients Only)
# ==============================================================================
@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED, summary="Create Appointment")
async def create_appointment(
    payload: AppointmentCreate,
    current_user: UserProfile = Depends(require_role("patient")),
    service: AppointmentService = Depends(get_appointment_service)
):
    """
    Creates a new 30-minute appointment holding the slot in 'pending' status:
    - Verifies current user is a patient
    - Verifies doctor exists and is active
    - Enforces 30-minute duration and clinic operating hours (Asia/Karachi)
    - Verifies doctor is not on leave
    - Verifies requested slot is in the future
    - Verifies neither doctor nor patient has a conflicting active appointment
    - Rejects double-booking with 409 Conflict
    """
    return await service.create_appointment(
        patient_id=current_user.id,
        data=payload
    )

# ==============================================================================
# 2. Patient: My Appointments
# ==============================================================================
@router.get("/my", response_model=List[AppointmentResponse], summary="Get Patient's Own Appointments")
async def get_my_appointments(
    current_user: UserProfile = Depends(require_role("patient")),
    service: AppointmentService = Depends(get_appointment_service)
):
    """
    Returns only the authenticated patient's appointments with doctor details,
    scheduled times, status, and cancellation history.
    """
    return await service.get_my_appointments(patient_id=current_user.id)

# ==============================================================================
# 3. Doctor: Assigned Appointments
# ==============================================================================
@router.get("/doctor", response_model=List[AppointmentResponse], summary="Get Doctor's Assigned Appointments")
async def get_doctor_appointments(
    date: Optional[str] = Query(None, description="Filter by date (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Filter by status (pending, confirmed, completed, cancelled, no_show)"),
    current_user: UserProfile = Depends(require_role("doctor")),
    service: AppointmentService = Depends(get_appointment_service)
):
    """
    Returns appointments assigned strictly to the authenticated doctor.
    Supports filtering by date and appointment status.
    """
    return await service.get_doctor_appointments(
        doctor_id=current_user.id,
        date_filter=date,
        status_filter=status
    )

# ==============================================================================
# 4. Doctor: Confirm Appointment
# ==============================================================================
@router.post("/{appointment_id}/confirm", response_model=AppointmentResponse, summary="Confirm Pending Appointment")
async def confirm_appointment(
    appointment_id: str,
    current_user: UserProfile = Depends(require_role("doctor")),
    service: AppointmentService = Depends(get_appointment_service)
):
    """
    Confirms a pending appointment:
    - Only the assigned doctor can confirm
    - Current status must be 'pending'
    - Cannot confirm cancelled or past appointments
    - Transitions status: pending -> confirmed
    """
    return await service.confirm_appointment(
        doctor_id=current_user.id,
        appointment_id=appointment_id
    )

# ==============================================================================
# 5. Doctor: Reject Appointment
# ==============================================================================
@router.post("/{appointment_id}/reject", response_model=AppointmentResponse, summary="Reject Pending Appointment")
async def reject_appointment(
    appointment_id: str,
    current_user: UserProfile = Depends(require_role("doctor")),
    service: AppointmentService = Depends(get_appointment_service)
):
    """
    Rejects a pending appointment:
    - Only the assigned doctor can reject
    - Status transitions: pending -> cancelled with reason 'Rejected by doctor'
    - Immediately releases the slot for other bookings
    """
    return await service.reject_appointment(
        doctor_id=current_user.id,
        appointment_id=appointment_id
    )

# ==============================================================================
# 6. Patient: Cancel Appointment (2-Hour Cutoff)
# ==============================================================================
@router.post("/{appointment_id}/cancel", response_model=AppointmentResponse, summary="Cancel Patient Appointment")
async def cancel_appointment(
    appointment_id: str,
    payload: Optional[AppointmentCancel] = None,
    current_user: UserProfile = Depends(require_role("patient")),
    service: AppointmentService = Depends(get_appointment_service)
):
    """
    Cancels an appointment booked by the authenticated patient:
    - Patient can cancel only their own appointment
    - Current status must be 'pending' or 'confirmed'
    - Must be requested at least 2 hours before appointment start
    - Past appointments cannot be cancelled
    - Releases the slot immediately
    """
    reason = payload.reason if payload else None
    return await service.cancel_appointment(
        patient_id=current_user.id,
        appointment_id=appointment_id,
        reason=reason
    )

# ==============================================================================
# 7. Patient: Reschedule Appointment (2-Hour Cutoff)
# ==============================================================================
@router.post("/{appointment_id}/reschedule", response_model=AppointmentResponse, summary="Reschedule Appointment")
async def reschedule_appointment(
    appointment_id: str,
    payload: AppointmentReschedule,
    current_user: UserProfile = Depends(require_role("patient")),
    service: AppointmentService = Depends(get_appointment_service)
):
    """
    Reschedules an existing appointment to a new available slot:
    - Patient can reschedule only their own appointment
    - Existing appointment must be 'pending' or 'confirmed'
    - Reschedule request must happen at least 2 hours before original start
    - Validates new slot availability against working hours, doctor leaves, and conflicts
    - Releases old slot and creates new pending appointment
    """
    return await service.reschedule_appointment(
        patient_id=current_user.id,
        appointment_id=appointment_id,
        new_start_time_str=payload.new_start_time
    )

# ==============================================================================
# 8. Doctor: Complete Appointment
# ==============================================================================
@router.post("/{appointment_id}/complete", response_model=AppointmentResponse, summary="Complete Confirmed Appointment")
async def complete_appointment(
    appointment_id: str,
    current_user: UserProfile = Depends(require_role("doctor")),
    service: AppointmentService = Depends(get_appointment_service)
):
    """
    Marks a confirmed appointment as completed:
    - Only the assigned doctor can mark completed
    - Current status must be 'confirmed'
    - Appointment start time must have already arrived
    - Future appointments cannot be marked completed
    """
    return await service.complete_appointment(
        doctor_id=current_user.id,
        appointment_id=appointment_id
    )

# ==============================================================================
# 9. Doctor: Mark No-Show
# ==============================================================================
@router.post("/{appointment_id}/no-show", response_model=AppointmentResponse, summary="Mark Confirmed Appointment as No-Show")
async def no_show_appointment(
    appointment_id: str,
    current_user: UserProfile = Depends(require_role("doctor")),
    service: AppointmentService = Depends(get_appointment_service)
):
    """
    Marks a patient as no-show for a confirmed appointment:
    - Only the assigned doctor can mark no-show
    - Current status must be 'confirmed'
    - Appointment start time must have already arrived
    - Future appointments cannot be marked no-show
    """
    return await service.no_show_appointment(
        doctor_id=current_user.id,
        appointment_id=appointment_id
    )

# ==============================================================================
# 10. Background Service: Expire Pending Appointments
# ==============================================================================
@router.post("/expire-pending", summary="Expire Stale Pending Appointments")
async def expire_pending_appointments(
    service: AppointmentService = Depends(get_appointment_service)
):
    """
    Utility/maintenance endpoint to automatically expire pending appointments whose start time
    has passed without doctor confirmation.
    Transitions: pending + start_time <= current_time -> cancelled
    """
    count = await service.expire_pending_appointments()
    return {"expired_count": count, "message": f"Expired {count} unconfirmed pending appointments"}
