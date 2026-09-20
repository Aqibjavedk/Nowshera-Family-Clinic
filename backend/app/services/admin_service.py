from datetime import datetime, date
from zoneinfo import ZoneInfo
from typing import List, Optional, Dict, Any

from app.core.exceptions import HTTPException, status

from app.schemas.admin import AdminClinicStats, PatientSummary
from app.schemas.appointment import AppointmentResponse, DoctorBrief, PatientBrief
from app.services.slot_service import KARACHI_TZ

class AdminService:
    def __init__(self, supabase_client=None):
        if supabase_client is not None:
            self.supabase = supabase_client
        else:
            from app.db.supabase import get_supabase_admin
            self.supabase = get_supabase_admin()

    def get_clinic_stats(self) -> AdminClinicStats:
        """
        Aggregates facility-wide metrics for the Admin Dashboard:
        - Total & Active Doctors
        - Total Registered Patients
        - Total, Today's, Pending, Confirmed, Completed, No-show, Cancelled appointments
        """
        try:
            # 1. Doctors
            doc_res = self.supabase.table("doctors").select("id, is_active").execute()
            docs = doc_res.data or []
            total_docs = len(docs)
            active_docs = len([d for d in docs if d.get("is_active", True)])

            # 2. Patients
            pat_res = self.supabase.table("profiles").select("id").eq("role", "patient").execute()
            total_patients = len(pat_res.data or [])

            # 3. Appointments
            appt_res = self.supabase.table("appointments").select("id, start_time, status").execute()
            appts = appt_res.data or []

            now_karachi = datetime.now(KARACHI_TZ)
            today_str = now_karachi.strftime("%Y-%m-%d")

            today_count = 0
            pending_count = 0
            confirmed_count = 0
            completed_count = 0
            no_show_count = 0
            cancelled_count = 0

            for a in appts:
                st = a.get("start_time", "")
                stat = a.get("status")

                if today_str in st:
                    today_count += 1

                if stat == "pending":
                    pending_count += 1
                elif stat == "confirmed":
                    confirmed_count += 1
                elif stat == "completed":
                    completed_count += 1
                elif stat == "no_show":
                    no_show_count += 1
                elif stat == "cancelled":
                    cancelled_count += 1

            return AdminClinicStats(
                total_doctors=total_docs,
                active_doctors=active_docs,
                total_patients=total_patients,
                today_appointments=today_count,
                pending_appointments=pending_count,
                confirmed_appointments=confirmed_count,
                completed_appointments=completed_count,
                no_show_appointments=no_show_count,
                cancelled_appointments=cancelled_count
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to calculate clinic stats: {str(e)}")

    def get_patients_directory(self, search: Optional[str] = None) -> List[PatientSummary]:
        """
        Returns registered patient list with contact info and appointment counts.
        CRITICAL PRIVACY: Never returns or exposes clinical visit notes!
        """
        try:
            # Fetch patient profiles
            query = self.supabase.table("profiles").select("id, full_name, email, phone, created_at").eq("role", "patient")
            res = query.execute()
            profiles = res.data or []

            # Fetch appointments summary
            appts_res = self.supabase.table("appointments").select("patient_id, status").execute()
            appts = appts_res.data or []

            patient_appts: Dict[str, List[str]] = {}
            for a in appts:
                pid = a.get("patient_id")
                stat = a.get("status")
                if pid:
                    if pid not in patient_appts:
                        patient_appts[pid] = []
                    patient_appts[pid].append(stat)

            results: List[PatientSummary] = []
            for p in profiles:
                fn = p.get("full_name", "")
                em = p.get("email", "")
                ph = p.get("phone", "")

                if search:
                    term = search.lower()
                    if term not in fn.lower() and term not in em.lower() and (not ph or term not in ph.lower()):
                        continue

                p_statuses = patient_appts.get(p["id"], [])
                results.append(
                    PatientSummary(
                        id=p["id"],
                        full_name=fn,
                        email=em,
                        phone=ph,
                        created_at=str(p.get("created_at", "")),
                        total_appointments=len(p_statuses),
                        pending_appointments=len([s for s in p_statuses if s == "pending"]),
                        confirmed_appointments=len([s for s in p_statuses if s == "confirmed"]),
                        completed_appointments=len([s for s in p_statuses if s == "completed"]),
                        cancelled_appointments=len([s for s in p_statuses if s == "cancelled"]),
                        no_show_appointments=len([s for s in p_statuses if s == "no_show"])
                    )
                )

            return results
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load patient directory: {str(e)}")

    def get_all_appointments(
        self,
        doctor_id: Optional[str] = None,
        date_str: Optional[str] = None,
        status_filter: Optional[str] = None,
        patient_search: Optional[str] = None
    ) -> List[AppointmentResponse]:
        """
        Comprehensive master appointments query for Administrator.
        """
        try:
            query = self.supabase.table("appointments").select(
                "id, patient_id, doctor_id, start_time, end_time, status, cancellation_reason, cancelled_by, created_at, "
                "doctors(id, qualification, profiles(full_name, email), specialties(name)), "
                "profiles!appointments_patient_id_fkey(id, full_name, email, phone)"
            )
            if doctor_id:
                query = query.eq("doctor_id", doctor_id)
            if status_filter and status_filter != "all":
                query = query.eq("status", status_filter)

            res = query.order("start_time", desc=True).execute()
            items = res.data or []

            results: List[AppointmentResponse] = []
            for item in items:
                st = item.get("start_time", "")
                if date_str and not st.startswith(date_str):
                    continue

                doc_info = item.get("doctors") or {}
                doc_prof = doc_info.get("profiles") or {}
                doc_spec = doc_info.get("specialties") or {}
                pat_prof = item.get("profiles") or {}

                pat_name = pat_prof.get("full_name", "")
                pat_email = pat_prof.get("email", "")

                if patient_search:
                    term = patient_search.lower()
                    if term not in pat_name.lower() and term not in pat_email.lower():
                        continue

                results.append(
                    AppointmentResponse(
                        id=item["id"],
                        patient_id=item["patient_id"],
                        doctor_id=item["doctor_id"],
                        start_time=item["start_time"],
                        end_time=item["end_time"],
                        status=item["status"],
                        cancellation_reason=item.get("cancellation_reason"),
                        cancelled_by=item.get("cancelled_by"),
                        created_at=item["created_at"],
                        doctor=DoctorBrief(
                            id=doc_info.get("id"),
                            full_name=doc_prof.get("full_name", "Doctor"),
                            qualification=doc_info.get("qualification", ""),
                            specialty=doc_spec.get("name", "General")
                        ),
                        patient=PatientBrief(
                            id=pat_prof.get("id"),
                            full_name=pat_name,
                            email=pat_email,
                            phone=pat_prof.get("phone")
                        )
                    )
                )

            return results
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch appointments: {str(e)}")

    def cancel_appointment(self, appointment_id: str, admin_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
        """
        Admin emergency cancellation of an appointment.
        Preserves appointment record, sets status = 'cancelled', releases slot.
        """
        res = self.supabase.table("appointments").select("id, status").eq("id", appointment_id).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

        current = res.data[0]
        if current["status"] == "cancelled":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Appointment is already cancelled")
        if current["status"] == "completed":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel a completed appointment")

        self.supabase.table("appointments").update({
            "status": "cancelled",
            "cancellation_reason": reason or "Cancelled by clinic administration",
            "cancelled_by": admin_id
        }).eq("id", appointment_id).execute()

        return {"id": appointment_id, "status": "cancelled", "message": "Appointment cancelled and slot released"}
