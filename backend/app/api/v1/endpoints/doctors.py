from typing import List
from fastapi import APIRouter, HTTPException, status, Depends
from app.core.dependencies import require_role
from app.schemas.user import UserProfile
from app.db.supabase import get_supabase_client
from app.schemas.doctor import (
    DoctorListItem,
    DoctorDetail,
    SpecialtyBase,
    WorkingHoursBase,
    WorkingHoursUpdate,
    DoctorLeaveCreate,
    DoctorLeaveResponse
)
from app.services.doctor_service import DoctorService

router = APIRouter()

# ---------------------------------------------------------------------------
# Doctor Self-Management Routes (Authenticated Doctor Only)
# MUST BE DEFINED BEFORE /{doctor_id} to avoid route shadowing
# ---------------------------------------------------------------------------

@router.get("/me/profile", response_model=DoctorDetail, summary="Doctor Self Profile")
async def get_my_doctor_profile(
    current_user: UserProfile = Depends(require_role("doctor"))
):
    """
    Returns authenticated doctor's profile, qualifications, specialty, and working hours.
    """
    return await get_doctor_by_id(current_user.id)

@router.get("/me/working-hours", response_model=List[WorkingHoursBase], summary="Get Own Working Hours")
async def get_my_working_hours(
    current_user: UserProfile = Depends(require_role("doctor"))
):
    service = DoctorService()
    return service.get_doctor_working_hours(current_user.id)

@router.put("/me/working-hours", response_model=List[WorkingHoursBase], summary="Configure Recurring Working Hours")
async def update_my_working_hours(
    hours_in: WorkingHoursUpdate,
    current_user: UserProfile = Depends(require_role("doctor"))
):
    """
    Configures recurring weekly working schedule.
    Enforces start_time < end_time and 30-minute interval compatibility.
    """
    service = DoctorService()
    return service.update_working_hours(current_user.id, hours_in.working_hours)

@router.get("/me/leaves", response_model=List[DoctorLeaveResponse], summary="Get Own Scheduled Leaves")
async def get_my_leaves(
    current_user: UserProfile = Depends(require_role("doctor"))
):
    service = DoctorService()
    return service.get_doctor_leaves(current_user.id)

@router.post("/me/leaves", summary="Schedule Doctor Leave")
async def add_my_leave(
    leave_in: DoctorLeaveCreate,
    current_user: UserProfile = Depends(require_role("doctor"))
):
    """
    Adds a leave date.
    CRITICAL RULE:
    Automatically cancels any Pending or Confirmed appointments scheduled for that date,
    releases the slots, preserves the records, and leaves Completed appointments intact.
    """
    service = DoctorService()
    return service.add_doctor_leave(current_user.id, leave_in.leave_date, leave_in.reason)

@router.delete("/me/leaves/{leave_id}", summary="Cancel Scheduled Leave")
async def delete_my_leave(
    leave_id: str,
    current_user: UserProfile = Depends(require_role("doctor"))
):
    service = DoctorService()
    return service.delete_doctor_leave(current_user.id, leave_id)

# ---------------------------------------------------------------------------
# Public Doctor Directory Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=List[DoctorListItem], summary="List Active Doctors")
async def list_doctors():
    """
    Returns all active clinic doctors along with their medical specialty details.
    """
    try:
        supabase = get_supabase_client()
        res = (
            supabase.table("doctors")
            .select("id, qualification, bio, is_active, profiles(full_name, email, phone), specialties(id, name, description)")
            .eq("is_active", True)
            .execute()
        )

        results: List[DoctorListItem] = []
        for item in (res.data or []):
            profile = item.get("profiles") or {}
            specialty_data = item.get("specialties") or {}
            results.append(
                DoctorListItem(
                    id=item["id"],
                    full_name=profile.get("full_name", "Dr."),
                    email=profile.get("email", ""),
                    phone=profile.get("phone"),
                    qualification=item["qualification"],
                    bio=item.get("bio"),
                    is_active=item["is_active"],
                    specialty=SpecialtyBase(
                        id=specialty_data.get("id", ""),
                        name=specialty_data.get("name", "General"),
                        description=specialty_data.get("description")
                    )
                )
            )
        return results
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch active doctors: {str(e)}"
        )

@router.get("/{doctor_id}", response_model=DoctorDetail, summary="Get Doctor Details")
async def get_doctor_by_id(doctor_id: str):
    """
    Returns specific doctor details including qualification, specialty, and working hours schedule.
    """
    try:
        supabase = get_supabase_client()
        res = (
            supabase.table("doctors")
            .select("id, qualification, bio, is_active, profiles(full_name, email, phone), specialties(id, name, description)")
            .eq("id", doctor_id)
            .limit(1)
            .execute()
        )

        if not res.data or len(res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Doctor not found"
            )

        item = res.data[0]
        profile = item.get("profiles") or {}
        specialty_data = item.get("specialties") or {}

        # Fetch working hours
        wh_res = (
            supabase.table("doctor_working_hours")
            .select("day_of_week, start_time, end_time, is_available")
            .eq("doctor_id", doctor_id)
            .order("day_of_week")
            .execute()
        )
        working_hours = [
            WorkingHoursBase(
                day_of_week=w["day_of_week"],
                start_time=w["start_time"],
                end_time=w["end_time"],
                is_available=w.get("is_available", True)
            )
            for w in (wh_res.data or [])
        ]

        return DoctorDetail(
            id=item["id"],
            full_name=profile.get("full_name", "Dr."),
            email=profile.get("email", ""),
            phone=profile.get("phone"),
            qualification=item["qualification"],
            bio=item.get("bio"),
            is_active=item["is_active"],
            specialty=SpecialtyBase(
                id=specialty_data.get("id", ""),
                name=specialty_data.get("name", "General"),
                description=specialty_data.get("description")
            ),
            working_hours=working_hours
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch doctor details: {str(e)}"
        )
