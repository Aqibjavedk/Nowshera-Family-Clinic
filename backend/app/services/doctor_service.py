import uuid
import logging
from datetime import datetime, date, time
from zoneinfo import ZoneInfo
from typing import List, Optional, Dict, Any

from app.core.exceptions import HTTPException, status

logger = logging.getLogger(__name__)

from app.schemas.doctor import (
    DoctorCreate,
    DoctorUpdate,
    DoctorListItem,
    DoctorDetail,
    SpecialtyBase,
    WorkingHoursBase,
    WorkingHoursUpdateItem,
    DoctorLeaveResponse
)
from app.services.slot_service import KARACHI_TZ

class DoctorService:
    def __init__(self, supabase_client=None):
        if supabase_client is not None:
            self.supabase = supabase_client
        else:
            from app.db.supabase import get_supabase_admin
            self.supabase = get_supabase_admin()

    def get_all_doctors_admin(
        self,
        search: Optional[str] = None,
        specialty_id: Optional[str] = None,
        status_filter: Optional[str] = None
    ) -> List[DoctorListItem]:
        """
        Retrieves all doctors (active and inactive) for admin management.
        """
        try:
            query = self.supabase.table("doctors").select(
                "id, qualification, bio, is_active, profiles(full_name, email, phone), specialties(id, name, description)"
            )
            if specialty_id:
                query = query.eq("specialty_id", specialty_id)
            if status_filter == "active":
                query = query.eq("is_active", True)
            elif status_filter == "inactive":
                query = query.eq("is_active", False)

            res = query.execute()
            items = res.data or []

            results: List[DoctorListItem] = []
            for item in items:
                profile = item.get("profiles") or {}
                specialty = item.get("specialties") or {}
                
                full_name = profile.get("full_name", "")
                email = profile.get("email", "")

                if search:
                    term = search.lower()
                    if term not in full_name.lower() and term not in email.lower():
                        continue

                results.append(
                    DoctorListItem(
                        id=item["id"],
                        full_name=full_name,
                        email=email,
                        phone=profile.get("phone"),
                        qualification=item.get("qualification", ""),
                        bio=item.get("bio"),
                        is_active=item.get("is_active", True),
                        specialty=SpecialtyBase(
                            id=specialty.get("id", ""),
                            name=specialty.get("name", "General"),
                            description=specialty.get("description")
                        )
                    )
                )
            return results
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch doctors: {str(e)}"
            )

    def create_doctor(self, data: DoctorCreate) -> DoctorListItem:
        """
        Admin creates a new doctor:
        1. Validates specialty exists.
        2. Checks if user email already exists.
        3. Creates Supabase Auth user using service-role Admin API (email_confirm=True).
        4. Uses returned Auth UUID as authoritative ID for profiles and doctors tables.
        5. Creates profile with role = 'doctor'.
        6. Creates doctor record linked to profile.
        7. Initializes default working hours (Mon-Fri 09:00 - 17:00).
        8. Handles rollback of Auth user if database insertions fail.
        """
        # 1. Check specialty
        spec_res = self.supabase.table("specialties").select("*").eq("id", data.specialty_id).execute()
        if not spec_res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Specialty with ID '{data.specialty_id}' does not exist"
            )
        specialty_data = spec_res.data[0]

        # 2. Check if email already exists in profiles
        prof_res = self.supabase.table("profiles").select("id").eq("email", data.email).execute()
        if prof_res.data and len(prof_res.data) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A user with email '{data.email}' already exists"
            )

        # 3. Create Supabase Auth user first using service-role Admin API
        doctor_user_id = None
        try:
            if not hasattr(self.supabase, 'auth') or not hasattr(self.supabase.auth, 'admin'):
                raise RuntimeError("Supabase Auth Admin client is not available")

            user_create_res = self.supabase.auth.admin.create_user({
                "email": data.email,
                "password": data.password or "Doctor123!@",
                "email_confirm": True,
                "user_metadata": {
                    "full_name": data.full_name,
                    "phone": data.phone,
                    "role": "doctor"
                }
            })

            # Extract user id from response
            if hasattr(user_create_res, 'user') and user_create_res.user:
                doctor_user_id = getattr(user_create_res.user, 'id', None) or user_create_res.user.get('id')
            elif isinstance(user_create_res, dict):
                user_obj = user_create_res.get('user', user_create_res)
                doctor_user_id = user_obj.get('id') if isinstance(user_obj, dict) else getattr(user_obj, 'id', None)

            if not doctor_user_id:
                raise RuntimeError("Failed to obtain user ID from Supabase Auth response")

        except HTTPException:
            raise
        except Exception as e:
            err_msg = str(e)
            logger.error(f"Supabase Auth user creation failed for doctor '{data.email}': {err_msg}")
            if "already exists" in err_msg.lower() or "already registered" in err_msg.lower():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A user with email '{data.email}' already exists in Supabase Authentication."
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST if "password" in err_msg.lower() else status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create doctor authentication account: {err_msg}"
            )

        # 4. Insert database records using the authoritative Auth UUID
        try:
            # 4a. Insert or update profile (role = doctor)
            self.supabase.table("profiles").upsert({
                "id": doctor_user_id,
                "email": data.email,
                "full_name": data.full_name,
                "phone": data.phone,
                "role": "doctor"
            }).execute()

            # 4b. Insert doctor record
            doc_record = {
                "id": doctor_user_id,
                "specialty_id": data.specialty_id,
                "qualification": data.qualification,
                "bio": data.bio,
                "is_active": data.is_active
            }
            self.supabase.table("doctors").insert(doc_record).execute()

            # 4c. Seed default working hours (Mon-Fri 09:00 - 17:00, Sat-Sun off)
            default_wh = [
                {"doctor_id": doctor_user_id, "day_of_week": 1, "start_time": "09:00:00", "end_time": "17:00:00", "is_available": True},
                {"doctor_id": doctor_user_id, "day_of_week": 2, "start_time": "09:00:00", "end_time": "17:00:00", "is_available": True},
                {"doctor_id": doctor_user_id, "day_of_week": 3, "start_time": "09:00:00", "end_time": "17:00:00", "is_available": True},
                {"doctor_id": doctor_user_id, "day_of_week": 4, "start_time": "09:00:00", "end_time": "17:00:00", "is_available": True},
                {"doctor_id": doctor_user_id, "day_of_week": 5, "start_time": "09:00:00", "end_time": "17:00:00", "is_available": True},
                {"doctor_id": doctor_user_id, "day_of_week": 6, "start_time": "09:00:00", "end_time": "14:00:00", "is_available": False},
                {"doctor_id": doctor_user_id, "day_of_week": 0, "start_time": "09:00:00", "end_time": "14:00:00", "is_available": False},
            ]
            try:
                for wh in default_wh:
                    self.supabase.table("doctor_working_hours").insert(wh).execute()
            except Exception as wh_err:
                logger.warning(f"Working hours insert notice for doctor {doctor_user_id}: {wh_err}")

            return DoctorListItem(
                id=doctor_user_id,
                full_name=data.full_name,
                email=data.email,
                phone=data.phone,
                qualification=data.qualification,
                bio=data.bio,
                is_active=data.is_active,
                specialty=SpecialtyBase(
                    id=specialty_data["id"],
                    name=specialty_data["name"],
                    description=specialty_data.get("description")
                )
            )
        except Exception as db_err:
            logger.error(f"Database insertion failed for doctor {doctor_user_id}, initiating rollback: {db_err}")
            # Rollback: delete the created Auth user to avoid orphaned account
            if doctor_user_id and hasattr(self.supabase, 'auth') and hasattr(self.supabase.auth, 'admin'):
                try:
                    self.supabase.auth.admin.delete_user(doctor_user_id)
                    logger.info(f"Successfully rolled back Auth user {doctor_user_id}")
                except Exception as rollback_err:
                    logger.error(f"Failed to rollback Auth user {doctor_user_id}: {rollback_err}")

            if isinstance(db_err, HTTPException):
                raise db_err
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create doctor database records: {str(db_err)}"
            )

    def set_doctor_status(self, doctor_id: str, is_active: bool) -> Dict[str, Any]:
        """
        Activates or deactivates a doctor.
        Deactivation halts new bookings while preserving historical records.
        """
        try:
            res = self.supabase.table("doctors").select("id").eq("id", doctor_id).execute()
            if not res.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Doctor not found"
                )

            self.supabase.table("doctors").update({"is_active": is_active}).eq("id", doctor_id).execute()
            return {"doctor_id": doctor_id, "is_active": is_active, "message": f"Doctor {'activated' if is_active else 'deactivated'} successfully"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update doctor status: {str(e)}"
            )

    def update_doctor(self, doctor_id: str, data: DoctorUpdate) -> Dict[str, Any]:
        """
        Updates doctor metadata and linked profile contact info.
        """
        try:
            res = self.supabase.table("doctors").select("id").eq("id", doctor_id).execute()
            if not res.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Doctor not found"
                )

            # Update profile fields if provided
            prof_updates = {}
            if data.full_name is not None:
                prof_updates["full_name"] = data.full_name
            if data.phone is not None:
                prof_updates["phone"] = data.phone
            if prof_updates:
                self.supabase.table("profiles").update(prof_updates).eq("id", doctor_id).execute()

            # Update doctor fields
            doc_updates = {}
            if data.specialty_id is not None:
                spec_res = self.supabase.table("specialties").select("id").eq("id", data.specialty_id).execute()
                if not spec_res.data:
                    raise HTTPException(status_code=400, detail="Invalid specialty ID")
                doc_updates["specialty_id"] = data.specialty_id
            if data.qualification is not None:
                doc_updates["qualification"] = data.qualification
            if data.bio is not None:
                doc_updates["bio"] = data.bio
            if data.is_active is not None:
                doc_updates["is_active"] = data.is_active

            if doc_updates:
                self.supabase.table("doctors").update(doc_updates).eq("id", doctor_id).execute()

            return {"doctor_id": doctor_id, "status": "updated"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    def get_doctor_working_hours(self, doctor_id: str) -> List[WorkingHoursBase]:
        """
        Returns working hours schedule for a doctor.
        """
        try:
            res = (
                self.supabase.table("doctor_working_hours")
                .select("day_of_week, start_time, end_time, is_available")
                .eq("doctor_id", doctor_id)
                .order("day_of_week")
                .execute()
            )
            items = res.data or []
            return [
                WorkingHoursBase(
                    day_of_week=w["day_of_week"],
                    start_time=w["start_time"],
                    end_time=w["end_time"],
                    is_available=w.get("is_available", True)
                )
                for w in items
            ]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get working hours: {str(e)}")

    def update_working_hours(
        self,
        doctor_id: str,
        working_hours: List[WorkingHoursUpdateItem]
    ) -> List[WorkingHoursBase]:
        """
        Updates doctor recurring weekly schedule.
        Validates:
        - start_time < end_time
        - day_of_week in 0..6
        - 30-minute interval step compatibility
        """
        for wh in working_hours:
            if wh.day_of_week < 0 or wh.day_of_week > 6:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid day_of_week: {wh.day_of_week}. Must be 0 (Sun) to 6 (Sat)."
                )

            if wh.is_available:
                # Validate start < end
                try:
                    s_parts = [int(p) for p in wh.start_time.split(":")[:2]]
                    e_parts = [int(p) for p in wh.end_time.split(":")[:2]]
                    s_min = s_parts[0] * 60 + s_parts[1]
                    e_min = e_parts[0] * 60 + e_parts[1]
                    if s_min >= e_min:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Start time ({wh.start_time}) must be before end time ({wh.end_time})"
                        )
                    if (e_min - s_min) < 30:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Working period must be at least 30 minutes for slot compatibility"
                        )
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Times must be in valid HH:MM format"
                    )

        # Upsert into database
        for wh in working_hours:
            payload = {
                "doctor_id": doctor_id,
                "day_of_week": wh.day_of_week,
                "start_time": wh.start_time if len(wh.start_time.split(':')) == 3 else f"{wh.start_time}:00",
                "end_time": wh.end_time if len(wh.end_time.split(':')) == 3 else f"{wh.end_time}:00",
                "is_available": wh.is_available
            }
            # Check existing for that day
            existing = (
                self.supabase.table("doctor_working_hours")
                .select("id")
                .eq("doctor_id", doctor_id)
                .eq("day_of_week", wh.day_of_week)
                .execute()
            )
            if existing.data and len(existing.data) > 0:
                self.supabase.table("doctor_working_hours").update(payload).eq("id", existing.data[0]["id"]).execute()
            else:
                self.supabase.table("doctor_working_hours").insert(payload).execute()

        return self.get_doctor_working_hours(doctor_id)

    def get_doctor_leaves(self, doctor_id: str) -> List[DoctorLeaveResponse]:
        """
        Returns all scheduled leaves for the doctor.
        """
        try:
            res = (
                self.supabase.table("doctor_leaves")
                .select("id, doctor_id, leave_date, reason, created_at")
                .eq("doctor_id", doctor_id)
                .order("leave_date")
                .execute()
            )
            return [
                DoctorLeaveResponse(
                    id=l["id"],
                    doctor_id=l["doctor_id"],
                    leave_date=str(l["leave_date"]),
                    reason=l.get("reason"),
                    created_at=str(l.get("created_at", ""))
                )
                for l in (res.data or [])
            ]
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    def add_doctor_leave(
        self,
        doctor_id: str,
        leave_date_str: str,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Adds a leave date for a doctor.
        CRITICAL BUSINESS RULE:
        If the doctor adds leave for a date that already contains Pending or Confirmed appointments:
        1. Automatically cancel those appointments (status = 'cancelled').
        2. Set cancellation_reason = 'Cancelled due to doctor scheduled leave'.
        3. Preserve the appointment record (do NOT delete).
        4. Release the slot back to the clinic pool.
        5. Do NOT cancel Completed appointments!
        """
        # Validate date
        try:
            target_date = date.fromisoformat(leave_date_str)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Expected YYYY-MM-DD"
            )

        # Check existing leave
        existing = (
            self.supabase.table("doctor_leaves")
            .select("id")
            .eq("doctor_id", doctor_id)
            .eq("leave_date", leave_date_str)
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Leave date {leave_date_str} is already scheduled for this doctor"
            )

        # Insert leave record
        new_id = str(uuid.uuid4())
        leave_record = {
            "id": new_id,
            "doctor_id": doctor_id,
            "leave_date": leave_date_str,
            "reason": reason or "Scheduled leave"
        }
        self.supabase.table("doctor_leaves").insert(leave_record).execute()

        # Execute Auto-Cancellation of Pending & Confirmed appointments
        # Find all appointments for this doctor on that calendar date (Asia/Karachi)
        appts_res = (
            self.supabase.table("appointments")
            .select("id, start_time, status")
            .eq("doctor_id", doctor_id)
            .execute()
        )

        cancelled_count = 0
        for a in (appts_res.data or []):
            st_str = a.get("start_time", "")
            current_status = a.get("status")
            
            # Only affect pending or confirmed appointments!
            if current_status in ["pending", "confirmed"]:
                # Check date match
                if leave_date_str in st_str:
                    self.supabase.table("appointments").update({
                        "status": "cancelled",
                        "cancellation_reason": f"Cancelled due to doctor leave: {reason or 'Scheduled off-duty'}",
                        "cancelled_by": doctor_id
                    }).eq("id", a["id"]).execute()
                    cancelled_count += 1

        return {
            "id": new_id,
            "doctor_id": doctor_id,
            "leave_date": leave_date_str,
            "reason": reason,
            "cancelled_appointments_count": cancelled_count,
            "message": f"Leave registered for {leave_date_str}. {cancelled_count} pending/confirmed appointments automatically cancelled."
        }

    def delete_doctor_leave(self, doctor_id: str, leave_id: str) -> Dict[str, Any]:
        """
        Deletes a leave date. Verifies ownership so doctor cannot delete another doctor's leave.
        """
        res = (
            self.supabase.table("doctor_leaves")
            .select("id, doctor_id")
            .eq("id", leave_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave record not found")

        record = res.data[0]
        if record["doctor_id"] != doctor_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot delete another doctor's leave record"
            )

        self.supabase.table("doctor_leaves").delete().eq("id", leave_id).execute()
        return {"id": leave_id, "status": "deleted"}
