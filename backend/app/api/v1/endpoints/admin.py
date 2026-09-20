from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from app.core.dependencies import require_role
from app.schemas.user import UserProfile
from app.schemas.doctor import DoctorCreate, DoctorUpdate, DoctorStatusUpdate, DoctorListItem
from app.schemas.admin import AdminClinicStats, PatientSummary
from app.schemas.appointment import AppointmentResponse, AppointmentCancel
from app.services.admin_service import AdminService
from app.services.doctor_service import DoctorService

router = APIRouter()

@router.get("/stats", response_model=AdminClinicStats, summary="Clinic Aggregated Statistics")
async def get_clinic_stats(
    admin_user: UserProfile = Depends(require_role("admin"))
):
    service = AdminService()
    return service.get_clinic_stats()

@router.get("/doctors", response_model=List[DoctorListItem], summary="List All Doctors (Active & Inactive)")
async def list_all_doctors(
    search: Optional[str] = Query(None, description="Search by doctor name or email"),
    specialty_id: Optional[str] = Query(None, description="Filter by specialty UUID"),
    status: Optional[str] = Query(None, description="Filter by 'active' or 'inactive'"),
    admin_user: UserProfile = Depends(require_role("admin"))
):
    service = DoctorService()
    return service.get_all_doctors_admin(search=search, specialty_id=specialty_id, status_filter=status)

@router.post("/doctors", response_model=DoctorListItem, status_code=status.HTTP_201_CREATED, summary="Create/Onboard New Doctor")
async def create_doctor(
    doctor_in: DoctorCreate,
    admin_user: UserProfile = Depends(require_role("admin"))
):
    service = DoctorService()
    return service.create_doctor(doctor_in)

@router.put("/doctors/{doctor_id}", summary="Update Doctor Metadata & Specialty")
async def update_doctor(
    doctor_id: str,
    doctor_update: DoctorUpdate,
    admin_user: UserProfile = Depends(require_role("admin"))
):
    service = DoctorService()
    return service.update_doctor(doctor_id, doctor_update)

@router.patch("/doctors/{doctor_id}/status", summary="Activate or Deactivate Doctor")
async def set_doctor_status(
    doctor_id: str,
    status_in: DoctorStatusUpdate,
    admin_user: UserProfile = Depends(require_role("admin"))
):
    service = DoctorService()
    return service.set_doctor_status(doctor_id, status_in.is_active)

@router.get("/patients", response_model=List[PatientSummary], summary="Patient Directory & Appointment Summaries")
async def get_patients_directory(
    search: Optional[str] = Query(None, description="Search by name, email, or phone"),
    admin_user: UserProfile = Depends(require_role("admin"))
):
    service = AdminService()
    return service.get_patients_directory(search=search)

@router.get("/appointments", response_model=List[AppointmentResponse], summary="Master Facility Appointments Ledger")
async def get_master_appointments(
    doctor_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    status: Optional[str] = Query(None, description="pending, confirmed, completed, cancelled, no_show"),
    search: Optional[str] = Query(None, description="Search patient name or email"),
    admin_user: UserProfile = Depends(require_role("admin"))
):
    service = AdminService()
    return service.get_all_appointments(
        doctor_id=doctor_id,
        date_str=date,
        status_filter=status,
        patient_search=search
    )

@router.post("/appointments/{appointment_id}/cancel", summary="Admin Emergency Cancellation")
async def cancel_appointment_admin(
    appointment_id: str,
    body: Optional[AppointmentCancel] = None,
    admin_user: UserProfile = Depends(require_role("admin"))
):
    service = AdminService()
    reason = body.reason if body else "Cancelled by administration"
    return service.cancel_appointment(appointment_id, admin_id=admin_user.id, reason=reason)
