from datetime import datetime, time, timedelta, date
from zoneinfo import ZoneInfo
from typing import List, Optional, Dict, Any
try:
    from fastapi import HTTPException, status
except ImportError:
    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str = ""):
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail)
    class status:
        HTTP_400_BAD_REQUEST = 400
        HTTP_401_UNAUTHORIZED = 401
        HTTP_403_FORBIDDEN = 403
        HTTP_404_NOT_FOUND = 404
        HTTP_409_CONFLICT = 409
        HTTP_500_INTERNAL_SERVER_ERROR = 500

from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentResponse,
    DoctorBrief,
    PatientBrief,
    AppointmentStatusEnum
)
from app.services.slot_service import (
    KARACHI_TZ,
    parse_iso_datetime,
    get_db_day_of_week
)

def validate_booking_time(
    doctor_id: str,
    start_dt: datetime,
    doctor_data: Dict[str, Any],
    working_hours: List[Dict[str, Any]],
    leaves: List[Dict[str, Any]],
    current_time: Optional[datetime] = None
) -> datetime:
    """
    Validates that a requested appointment time meets all clinic rules:
    - Timezone is Asia/Karachi
    - Doctor is active
    - Time is not in the past
    - Day is a valid working day
    - Time falls within working hours
    - Date is not a doctor leave date
    Returns the computed end_time (start_dt + 30m).
    """
    now_karachi = current_time or datetime.now(KARACHI_TZ)

    # 1. Doctor active
    if not doctor_data.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot book an appointment with an inactive doctor"
        )

    # 2. Not in the past
    if start_dt <= now_karachi:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot book an appointment in the past"
        )

    # 3. Exactly 30 minutes duration
    end_dt = start_dt + timedelta(minutes=30)

    # 4. Check doctor leave
    target_date = start_dt.date()
    target_date_str = target_date.isoformat()
    for leave in leaves:
        leave_str = str(leave.get("leave_date", ""))
        if leave_str.startswith(target_date_str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Doctor is on leave on {target_date_str}"
            )

    # 5. Check working hours
    db_dow = get_db_day_of_week(target_date)
    matching_wh = None
    for wh in working_hours:
        if wh.get("day_of_week") == db_dow and wh.get("is_available", True):
            matching_wh = wh
            break

    if not matching_wh:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Doctor does not practice on this day of the week (day code {db_dow})"
        )

    wh_start_val = matching_wh["start_time"]
    wh_end_val = matching_wh["end_time"]

    wh_start = time.fromisoformat(wh_start_val) if isinstance(wh_start_val, str) else wh_start_val
    wh_end = time.fromisoformat(wh_end_val) if isinstance(wh_end_val, str) else wh_end_val

    req_start_time = start_dt.time()
    req_end_time = end_dt.time()

    if req_start_time < wh_start or req_end_time > wh_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Requested slot {req_start_time}-{req_end_time} is outside doctor working hours ({wh_start}-{wh_end})"
        )

    return end_dt

class AppointmentService:
    def __init__(self, supabase_admin_client: Any):
        self.db = supabase_admin_client

    async def create_appointment(
        self,
        patient_id: str,
        data: AppointmentCreate,
        current_time: Optional[datetime] = None
    ) -> AppointmentResponse:
        start_dt = parse_iso_datetime(data.start_time)

        # Fetch doctor
        doc_res = (
            self.db.table("doctors")
            .select("id, is_active, qualification, profiles(full_name), specialties(name)")
            .eq("id", data.doctor_id)
            .limit(1)
            .execute()
        )
        if not doc_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
        doc_info = doc_res.data[0]

        # Fetch working hours & leaves
        wh_res = self.db.table("doctor_working_hours").select("*").eq("doctor_id", data.doctor_id).execute()
        leaves_res = self.db.table("doctor_leaves").select("*").eq("doctor_id", data.doctor_id).execute()

        end_dt = validate_booking_time(
            doctor_id=data.doctor_id,
            start_dt=start_dt,
            doctor_data=doc_info,
            working_hours=wh_res.data or [],
            leaves=leaves_res.data or [],
            current_time=current_time
        )

        start_iso = start_dt.isoformat()
        end_iso = end_dt.isoformat()

        # Check doctor double booking
        doc_conflict = (
            self.db.table("appointments")
            .select("id")
            .eq("doctor_id", data.doctor_id)
            .eq("start_time", start_iso)
            .neq("status", "cancelled")
            .execute()
        )
        if doc_conflict.data and len(doc_conflict.data) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This doctor slot is already booked"
            )

        # Check patient double booking
        patient_conflict = (
            self.db.table("appointments")
            .select("id")
            .eq("patient_id", patient_id)
            .eq("start_time", start_iso)
            .neq("status", "cancelled")
            .execute()
        )
        if patient_conflict.data and len(patient_conflict.data) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You already have an active appointment booked at this exact time"
            )

        # Insert new pending appointment
        try:
            insert_payload = {
                "patient_id": patient_id,
                "doctor_id": data.doctor_id,
                "start_time": start_iso,
                "end_time": end_iso,
                "status": "pending"
            }
            res = self.db.table("appointments").insert(insert_payload).execute()
            if not res.data:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create appointment")
            appt = res.data[0]
        except Exception as e:
            err_str = str(e).lower()
            if "unique" in err_str or "duplicate" in err_str or "conflict" in err_str:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Slot conflict: This appointment time is no longer available"
                )
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {str(e)}")

        # Fetch profile and specialty details to return full object
        profile = doc_info.get("profiles") or {}
        specialty = doc_info.get("specialties") or {}

        return AppointmentResponse(
            id=appt["id"],
            patient_id=appt["patient_id"],
            doctor_id=appt["doctor_id"],
            start_time=appt["start_time"],
            end_time=appt["end_time"],
            status=appt["status"],
            created_at=appt["created_at"],
            doctor=DoctorBrief(
                id=doc_info["id"],
                full_name=profile.get("full_name", "Doctor"),
                qualification=doc_info.get("qualification", ""),
                specialty=specialty.get("name", "General Practice")
            ),
            specialty=specialty.get("name", "General Practice")
        )

    async def get_my_appointments(self, patient_id: str) -> List[AppointmentResponse]:
        """
        Retrieves all appointments belonging to the requesting patient.
        """
        res = (
            self.db.table("appointments")
            .select("*, doctors(id, qualification, profiles(full_name), specialties(name))")
            .eq("patient_id", patient_id)
            .order("start_time", desc=True)
            .execute()
        )
        results: List[AppointmentResponse] = []
        for a in (res.data or []):
            doc = a.get("doctors") or {}
            prof = doc.get("profiles") or {}
            spec = doc.get("specialties") or {}

            results.append(
                AppointmentResponse(
                    id=a["id"],
                    patient_id=a["patient_id"],
                    doctor_id=a["doctor_id"],
                    start_time=a["start_time"],
                    end_time=a["end_time"],
                    status=a["status"],
                    cancellation_reason=a.get("cancellation_reason"),
                    cancelled_by=a.get("cancelled_by"),
                    created_at=a["created_at"],
                    doctor=DoctorBrief(
                        id=doc.get("id", a["doctor_id"]),
                        full_name=prof.get("full_name", "Doctor"),
                        qualification=doc.get("qualification", ""),
                        specialty=spec.get("name", "General")
                    ),
                    specialty=spec.get("name", "General")
                )
            )
        return results

    async def get_doctor_appointments(
        self,
        doctor_id: str,
        date_filter: Optional[str] = None,
        status_filter: Optional[str] = None
    ) -> List[AppointmentResponse]:
        """
        Retrieves appointments assigned to the requesting doctor with optional date and status filters.
        """
        query = (
            self.db.table("appointments")
            .select("*, profiles:patient_id(id, full_name, email, phone)")
            .eq("doctor_id", doctor_id)
        )

        if status_filter:
            query = query.eq("status", status_filter)

        if date_filter:
            start_of_day = f"{date_filter}T00:00:00+05:00"
            end_of_day = f"{date_filter}T23:59:59+05:00"
            query = query.gte("start_time", start_of_day).lte("start_time", end_of_day)

        res = query.order("start_time", desc=False).execute()
        results: List[AppointmentResponse] = []
        for a in (res.data or []):
            patient_data = a.get("profiles") or {}
            results.append(
                AppointmentResponse(
                    id=a["id"],
                    patient_id=a["patient_id"],
                    doctor_id=a["doctor_id"],
                    start_time=a["start_time"],
                    end_time=a["end_time"],
                    status=a["status"],
                    cancellation_reason=a.get("cancellation_reason"),
                    cancelled_by=a.get("cancelled_by"),
                    created_at=a["created_at"],
                    patient=PatientBrief(
                        id=patient_data.get("id", a["patient_id"]),
                        full_name=patient_data.get("full_name", "Patient"),
                        email=patient_data.get("email", ""),
                        phone=patient_data.get("phone")
                    )
                )
            )
        return results

    async def confirm_appointment(
        self,
        doctor_id: str,
        appointment_id: str,
        current_time: Optional[datetime] = None
    ) -> AppointmentResponse:
        now_karachi = current_time or datetime.now(KARACHI_TZ)

        res = self.db.table("appointments").select("*").eq("id", appointment_id).limit(1).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

        appt = res.data[0]
        if appt["doctor_id"] != doctor_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage appointments belonging to another doctor")

        if appt["status"] == "cancelled":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot confirm a cancelled appointment")

        if appt["status"] != "pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot confirm an appointment in '{appt['status']}' status")

        start_dt = parse_iso_datetime(appt["start_time"])
        if start_dt <= now_karachi:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot confirm an appointment whose start time has already passed")

        update_res = (
            self.db.table("appointments")
            .update({"status": "confirmed"})
            .eq("id", appointment_id)
            .execute()
        )
        updated = update_res.data[0]
        return AppointmentResponse(**updated)

    async def reject_appointment(
        self,
        doctor_id: str,
        appointment_id: str
    ) -> AppointmentResponse:
        res = self.db.table("appointments").select("*").eq("id", appointment_id).limit(1).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

        appt = res.data[0]
        if appt["doctor_id"] != doctor_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot manage appointments belonging to another doctor")

        if appt["status"] != "pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending appointments can be rejected")

        update_res = (
            self.db.table("appointments")
            .update({
                "status": "cancelled",
                "cancellation_reason": "Rejected by doctor",
                "cancelled_by": doctor_id
            })
            .eq("id", appointment_id)
            .execute()
        )
        updated = update_res.data[0]
        return AppointmentResponse(**updated)

    async def cancel_appointment(
        self,
        patient_id: str,
        appointment_id: str,
        reason: Optional[str] = None,
        current_time: Optional[datetime] = None
    ) -> AppointmentResponse:
        now_karachi = current_time or datetime.now(KARACHI_TZ)

        res = self.db.table("appointments").select("*").eq("id", appointment_id).limit(1).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

        appt = res.data[0]
        if appt["patient_id"] != patient_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot cancel another patient's appointment")

        if appt["status"] not in ("pending", "confirmed"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel appointment with status '{appt['status']}'"
            )

        start_dt = parse_iso_datetime(appt["start_time"])
        if start_dt <= now_karachi:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Past appointments cannot be cancelled"
            )

        time_until_start = start_dt - now_karachi
        if time_until_start < timedelta(hours=2):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cancellations are only permitted at least 2 hours before the scheduled appointment time"
            )

        update_res = (
            self.db.table("appointments")
            .update({
                "status": "cancelled",
                "cancellation_reason": reason or "Cancelled by patient",
                "cancelled_by": patient_id
            })
            .eq("id", appointment_id)
            .execute()
        )
        updated = update_res.data[0]
        return AppointmentResponse(**updated)

    async def reschedule_appointment(
        self,
        patient_id: str,
        appointment_id: str,
        new_start_time_str: str,
        current_time: Optional[datetime] = None
    ) -> AppointmentResponse:
        now_karachi = current_time or datetime.now(KARACHI_TZ)

        # 1. Fetch existing appointment
        res = self.db.table("appointments").select("*").eq("id", appointment_id).limit(1).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

        old_appt = res.data[0]
        if old_appt["patient_id"] != patient_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot reschedule another patient's appointment")

        if old_appt["status"] not in ("pending", "confirmed"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reschedule an appointment in '{old_appt['status']}' status"
            )

        orig_start_dt = parse_iso_datetime(old_appt["start_time"])
        if orig_start_dt <= now_karachi:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot reschedule past appointments")

        if orig_start_dt - now_karachi < timedelta(hours=2):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rescheduling is only permitted at least 2 hours before the scheduled appointment time"
            )

        doctor_id = old_appt["doctor_id"]
        new_start_dt = parse_iso_datetime(new_start_time_str)

        # Validate new time with doctor
        doc_res = self.db.table("doctors").select("*, profiles(full_name), specialties(name)").eq("id", doctor_id).limit(1).execute()
        doc_info = doc_res.data[0]

        wh_res = self.db.table("doctor_working_hours").select("*").eq("doctor_id", doctor_id).execute()
        leaves_res = self.db.table("doctor_leaves").select("*").eq("doctor_id", doctor_id).execute()

        new_end_dt = validate_booking_time(
            doctor_id=doctor_id,
            start_dt=new_start_dt,
            doctor_data=doc_info,
            working_hours=wh_res.data or [],
            leaves=leaves_res.data or [],
            current_time=now_karachi
        )

        new_start_iso = new_start_dt.isoformat()
        new_end_iso = new_end_dt.isoformat()

        # Check doctor slot conflict
        doc_conflict = (
            self.db.table("appointments")
            .select("id")
            .eq("doctor_id", doctor_id)
            .eq("start_time", new_start_iso)
            .neq("status", "cancelled")
            .execute()
        )
        if doc_conflict.data and len(doc_conflict.data) > 0:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The requested new slot is already booked")

        # Check patient conflict
        pat_conflict = (
            self.db.table("appointments")
            .select("id")
            .eq("patient_id", patient_id)
            .eq("start_time", new_start_iso)
            .neq("status", "cancelled")
            .neq("id", appointment_id)
            .execute()
        )
        if pat_conflict.data and len(pat_conflict.data) > 0:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already have another active appointment at that time")

        # Safely transition: cancel the old appointment first to release the slot
        cancel_res = (
            self.db.table("appointments")
            .update({
                "status": "cancelled",
                "cancellation_reason": f"Rescheduled to {new_start_iso}",
                "cancelled_by": patient_id
            })
            .eq("id", appointment_id)
            .execute()
        )

        # Create new appointment with status pending
        try:
            insert_res = (
                self.db.table("appointments")
                .insert({
                    "patient_id": patient_id,
                    "doctor_id": doctor_id,
                    "start_time": new_start_iso,
                    "end_time": new_end_iso,
                    "status": "pending"
                })
                .execute()
            )
            new_appt = insert_res.data[0]
        except Exception as e:
            # Rollback old appointment status if new slot fails
            self.db.table("appointments").update({"status": old_appt["status"], "cancellation_reason": None, "cancelled_by": None}).eq("id", appointment_id).execute()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Conflict creating rescheduled appointment: {str(e)}")

        return AppointmentResponse(**new_appt)

    async def complete_appointment(
        self,
        doctor_id: str,
        appointment_id: str,
        current_time: Optional[datetime] = None
    ) -> AppointmentResponse:
        now_karachi = current_time or datetime.now(KARACHI_TZ)

        res = self.db.table("appointments").select("*").eq("id", appointment_id).limit(1).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

        appt = res.data[0]
        if appt["doctor_id"] != doctor_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot complete appointments belonging to another doctor")

        if appt["status"] != "confirmed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only confirmed appointments can be marked completed (current status: '{appt['status']}')"
            )

        start_dt = parse_iso_datetime(appt["start_time"])
        if now_karachi < start_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot mark an appointment as completed before its scheduled start time"
            )

        update_res = (
            self.db.table("appointments")
            .update({"status": "completed"})
            .eq("id", appointment_id)
            .execute()
        )
        return AppointmentResponse(**update_res.data[0])

    async def no_show_appointment(
        self,
        doctor_id: str,
        appointment_id: str,
        current_time: Optional[datetime] = None
    ) -> AppointmentResponse:
        now_karachi = current_time or datetime.now(KARACHI_TZ)

        res = self.db.table("appointments").select("*").eq("id", appointment_id).limit(1).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

        appt = res.data[0]
        if appt["doctor_id"] != doctor_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot mark no-show for another doctor's appointments")

        if appt["status"] != "confirmed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only confirmed appointments can be marked no-show (current status: '{appt['status']}')"
            )

        start_dt = parse_iso_datetime(appt["start_time"])
        if now_karachi < start_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot mark an appointment as no-show before its scheduled start time"
            )

        update_res = (
            self.db.table("appointments")
            .update({"status": "no_show"})
            .eq("id", appointment_id)
            .execute()
        )
        return AppointmentResponse(**update_res.data[0])

    async def expire_pending_appointments(
        self,
        current_time: Optional[datetime] = None
    ) -> int:
        """
        Cancels pending appointments when their start time has passed without doctor confirmation.
        Rule: pending + start_time <= current_time -> cancelled (reason: 'Pending appointment expired')
        """
        now_karachi = current_time or datetime.now(KARACHI_TZ)
        now_iso = now_karachi.isoformat()

        expired_query = (
            self.db.table("appointments")
            .select("id")
            .eq("status", "pending")
            .lte("start_time", now_iso)
            .execute()
        )

        expired_records = expired_query.data or []
        count = 0
        for rec in expired_records:
            self.db.table("appointments").update({
                "status": "cancelled",
                "cancellation_reason": "Pending appointment expired"
            }).eq("id", rec["id"]).execute()
            count += 1

        return count
