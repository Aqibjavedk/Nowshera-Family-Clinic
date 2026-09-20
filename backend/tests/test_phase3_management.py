"""
Nowshera Family Clinic - Phase 3 Doctor & Admin Management Tests
Verifies all 20 test scenarios specified in Phase 3 instructions:
1. Admin creates doctor with specialty successfully.
2. Duplicate doctor email rejected (409 Conflict).
3. Non-existent specialty assignment rejected (400 Bad Request).
4. Admin activates doctor.
5. Admin deactivates doctor.
6. Inactive doctor produces no available booking slots.
7. Doctor sets weekly working hours.
8. Working hours with start_time >= end_time rejected.
9. Working hours under 30 minutes rejected.
10. Doctor adds leave date successfully.
11. Adding leave automatically cancels pending appointments on that date.
12. Adding leave automatically cancels confirmed appointments on that date.
13. Adding leave does NOT cancel completed appointments on that date.
14. Cancelled appointment due to leave preserves record and sets cancellation_reason.
15. Doctor cannot delete or modify another doctor's leave.
16. Non-admin cannot access admin endpoints (RBAC check).
17. Non-admin cannot onboard doctors (RBAC check).
18. Non-doctor cannot update doctor working hours (RBAC check).
19. Admin viewing patient directory receives zero visit notes (privacy invariant).
20. Admin emergency appointment cancellation releases slot and preserves record.
"""

import unittest
import uuid
from datetime import datetime, date, time, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Any, List, Optional
import os
import sys

# Ensure backend directory is on Python module search path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.services.slot_service import (
    KARACHI_TZ,
    generate_doctor_slots,
    get_db_day_of_week
)
from app.core.exceptions import HTTPException, status
from app.services.doctor_service import DoctorService
from app.services.admin_service import AdminService
from app.schemas.doctor import (
    DoctorCreate,
    DoctorUpdate,
    WorkingHoursUpdateItem,
    DoctorLeaveCreate
)

class MockQueryBuilder:
    def __init__(self, table_name: str, database: Dict[str, List[Dict[str, Any]]]):
        self.table_name = table_name
        self.database = database
        self.filters = []
        self._order_field = None
        self._order_desc = False
        self._update_data = None
        self._delete_flag = False

    def select(self, fields: str = "*"):
        return self

    def eq(self, field: str, value: Any):
        self.filters.append((field, "==", value))
        return self

    def in_(self, field: str, values: List[Any]):
        self.filters.append((field, "in", values))
        return self

    def order(self, field: str, desc: bool = False):
        self._order_field = field
        self._order_desc = desc
        return self

    def insert(self, payload: Any):
        if isinstance(payload, list):
            for item in payload:
                self.database[self.table_name].append(dict(item))
        else:
            self.database[self.table_name].append(dict(payload))
        return self

    def upsert(self, payload: Dict[str, Any]):
        pk = payload.get("id")
        existing = [item for item in self.database[self.table_name] if item.get("id") == pk]
        if existing:
            existing[0].update(payload)
        else:
            self.database[self.table_name].append(dict(payload))
        return self

    def update(self, payload: Dict[str, Any]):
        self._update_data = payload
        return self

    def delete(self):
        self._delete_flag = True
        return self

    def execute(self):
        table_rows = self.database.get(self.table_name, [])
        matched = []

        for row in table_rows:
            match = True
            for field, op, val in self.filters:
                if op == "==" and row.get(field) != val:
                    match = False
                    break
                elif op == "in" and row.get(field) not in val:
                    match = False
                    break
            if match:
                matched.append(row)

        if self._update_data is not None:
            for row in matched:
                row.update(self._update_data)
            class Result:
                data = matched
            return Result()

        if self._delete_flag:
            for row in matched:
                if row in table_rows:
                    table_rows.remove(row)
            class Result:
                data = matched
            return Result()

        # Handle join lookups
        result_data = []
        for row in matched:
            row_copy = dict(row)
            if self.table_name == "doctors":
                prof = next((p for p in self.database.get("profiles", []) if p.get("id") == row.get("id")), {})
                spec = next((s for s in self.database.get("specialties", []) if s.get("id") == row.get("specialty_id")), {})
                row_copy["profiles"] = prof
                row_copy["specialties"] = spec
            result_data.append(row_copy)

        class Result:
            data = result_data
        return Result()

class MockAuthAdmin:
    def __init__(self, db: Dict[str, List[Dict[str, Any]]]):
        self.db = db

    def create_user(self, attributes: Dict[str, Any]):
        email = attributes.get("email")
        auth_users = self.db.setdefault("auth_users", [])
        if any(u.get("email") == email for u in auth_users):
            raise Exception(f"A user with email '{email}' already exists")
        user_id = str(uuid.uuid4())
        user_record = {
            "id": user_id,
            "email": email,
            "user_metadata": attributes.get("user_metadata", {}),
        }
        auth_users.append(user_record)
        
        class AuthUserObj:
            def __init__(self, uid, em, meta):
                self.id = uid
                self.email = em
                self.user_metadata = meta
        class AuthResponse:
            def __init__(self, u):
                self.user = u

        return AuthResponse(AuthUserObj(user_id, email, attributes.get("user_metadata", {})))

    def delete_user(self, user_id: str):
        auth_users = self.db.setdefault("auth_users", [])
        self.db["auth_users"] = [u for u in auth_users if u.get("id") != user_id]
        return True

class MockAuth:
    def __init__(self, db: Dict[str, List[Dict[str, Any]]]):
        self.admin = MockAuthAdmin(db)

class MockSupabase:
    def __init__(self, initial_db: Dict[str, List[Dict[str, Any]]]):
        self.db = initial_db
        self.auth = MockAuth(self.db)

    def table(self, table_name: str):
        if table_name not in self.db:
            self.db[table_name] = []
        return MockQueryBuilder(table_name, self.db)

class TestPhase3Management(unittest.TestCase):
    def setUp(self):
        self.db = {
            "specialties": [
                {"id": "spec-cardio", "name": "Cardiology", "description": "Heart care"},
                {"id": "spec-pediatrics", "name": "Pediatrics", "description": "Child care"},
            ],
            "profiles": [
                {"id": "admin-1", "email": "admin@nowsheraclinic.pk", "full_name": "Clinic Admin", "role": "admin", "phone": "03001112233"},
                {"id": "doc-1", "email": "dr.shams@nowsheraclinic.pk", "full_name": "Dr. Shams Khan", "role": "doctor", "phone": "03002223344"},
                {"id": "doc-2", "email": "dr.aisha@nowsheraclinic.pk", "full_name": "Dr. Aisha Bibi", "role": "doctor", "phone": "03003334455"},
                {"id": "pat-1", "email": "ahmad@example.com", "full_name": "Ahmad Patient", "role": "patient", "phone": "03004445566"},
                {"id": "pat-2", "email": "sara@example.com", "full_name": "Sara Patient", "role": "patient", "phone": "03005556677"},
            ],
            "doctors": [
                {"id": "doc-1", "specialty_id": "spec-cardio", "qualification": "MBBS, FCPS Cardiology", "bio": "Senior Cardiologist", "is_active": True},
                {"id": "doc-2", "specialty_id": "spec-pediatrics", "qualification": "MBBS, DCH Pediatrics", "bio": "Pediatric specialist", "is_active": True},
            ],
            "doctor_working_hours": [
                {"id": "wh-1", "doctor_id": "doc-1", "day_of_week": 1, "start_time": "09:00:00", "end_time": "17:00:00", "is_available": True},
                {"id": "wh-2", "doctor_id": "doc-1", "day_of_week": 2, "start_time": "09:00:00", "end_time": "17:00:00", "is_available": True},
                {"id": "wh-3", "doctor_id": "doc-1", "day_of_week": 3, "start_time": "09:00:00", "end_time": "17:00:00", "is_available": True},
            ],
            "doctor_leaves": [],
            "appointments": [],
            "visit_notes": [
                {"id": "vn-1", "appointment_id": "appt-old", "doctor_id": "doc-1", "patient_id": "pat-1", "notes": "Sensitive medical diagnosis - hypertension", "is_patient_visible": True}
            ]
        }
        self.mock_client = MockSupabase(self.db)
        self.doctor_service = DoctorService(supabase_client=self.mock_client)
        self.admin_service = AdminService(supabase_client=self.mock_client)

    # 1. Admin creates doctor with specialty successfully
    def test_01_admin_creates_doctor_successfully(self):
        new_doc = DoctorCreate(
            full_name="Dr. Tariq Paracha",
            email="dr.tariq@nowsheraclinic.pk",
            phone="03007778899",
            specialty_id="spec-cardio",
            qualification="MBBS, MD Cardiology",
            bio="Interventional cardiologist",
            is_active=True
        )
        created = self.doctor_service.create_doctor(new_doc)
        self.assertEqual(created.full_name, "Dr. Tariq Paracha")
        self.assertEqual(created.specialty.name, "Cardiology")
        self.assertTrue(created.is_active)
        # Verify doctor in database
        doc_in_db = next((d for d in self.db["doctors"] if d["id"] == created.id), None)
        self.assertIsNotNone(doc_in_db)
        prof_in_db = next((p for p in self.db["profiles"] if p["id"] == created.id), None)
        self.assertEqual(prof_in_db["role"], "doctor")

    # 2. Duplicate doctor email rejected (409 Conflict)
    def test_02_duplicate_doctor_email_rejected(self):
        dup_doc = DoctorCreate(
            full_name="Dr. Shams Khan Copy",
            email="dr.shams@nowsheraclinic.pk", # Already exists
            specialty_id="spec-cardio",
            qualification="MBBS",
            is_active=True
        )
        with self.assertRaises(HTTPException) as ctx:
            self.doctor_service.create_doctor(dup_doc)
        self.assertEqual(ctx.exception.status_code, 409)

    # 3. Non-existent specialty assignment rejected (400 Bad Request)
    def test_03_invalid_specialty_rejected(self):
        invalid_spec_doc = DoctorCreate(
            full_name="Dr. Unknown",
            email="dr.unknown@nowsheraclinic.pk",
            specialty_id="spec-nonexistent-999",
            qualification="MBBS",
            is_active=True
        )
        with self.assertRaises(HTTPException) as ctx:
            self.doctor_service.create_doctor(invalid_spec_doc)
        self.assertEqual(ctx.exception.status_code, 400)

    # 4. Admin activates doctor
    def test_04_admin_activates_doctor(self):
        self.db["doctors"][0]["is_active"] = False
        res = self.doctor_service.set_doctor_status("doc-1", True)
        self.assertTrue(res["is_active"])
        self.assertTrue(self.db["doctors"][0]["is_active"])

    # 5. Admin deactivates doctor
    def test_05_admin_deactivates_doctor(self):
        res = self.doctor_service.set_doctor_status("doc-1", False)
        self.assertFalse(res["is_active"])
        self.assertFalse(self.db["doctors"][0]["is_active"])

    # 6. Inactive doctor produces no available booking slots
    def test_06_inactive_doctor_produces_no_slots(self):
        self.db["doctors"][0]["is_active"] = False
        target_date = date(2026, 9, 21) # Monday
        slots = generate_doctor_slots(
            doctor_id="doc-1",
            target_date=target_date,
            doctor_data=self.db["doctors"][0],
            working_hours_list=[self.db["doctor_working_hours"][0]],
            leaves_list=[],
            active_appointments=[]
        )
        self.assertEqual(len(slots), 0, "Inactive doctor must generate 0 available slots")

    # 7. Doctor sets weekly working hours
    def test_07_doctor_sets_weekly_working_hours(self):
        new_hours = [
            WorkingHoursUpdateItem(day_of_week=1, start_time="08:00", end_time="16:00", is_available=True),
            WorkingHoursUpdateItem(day_of_week=2, start_time="08:00", end_time="16:00", is_available=True),
        ]
        res = self.doctor_service.update_working_hours("doc-1", new_hours)
        self.assertIsNotNone(res)
        monday_wh = next((w for w in self.db["doctor_working_hours"] if w["doctor_id"] == "doc-1" and w["day_of_week"] == 1), None)
        self.assertEqual(monday_wh["start_time"], "08:00:00")

    # 8. Working hours with start_time >= end_time rejected
    def test_08_invalid_start_end_time_rejected(self):
        invalid_hours = [
            WorkingHoursUpdateItem(day_of_week=1, start_time="17:00", end_time="09:00", is_available=True)
        ]
        with self.assertRaises(HTTPException) as ctx:
            self.doctor_service.update_working_hours("doc-1", invalid_hours)
        self.assertEqual(ctx.exception.status_code, 400)

    # 9. Working hours under 30 minutes rejected
    def test_09_working_hours_under_30_minutes_rejected(self):
        short_hours = [
            WorkingHoursUpdateItem(day_of_week=1, start_time="09:00", end_time="09:15", is_available=True)
        ]
        with self.assertRaises(HTTPException) as ctx:
            self.doctor_service.update_working_hours("doc-1", short_hours)
        self.assertEqual(ctx.exception.status_code, 400)

    # 10. Doctor adds leave date successfully
    def test_10_doctor_adds_leave_successfully(self):
        res = self.doctor_service.add_doctor_leave(
            doctor_id="doc-1",
            leave_date_str="2026-10-05",
            reason="Medical conference in Islamabad"
        )
        self.assertEqual(res["leave_date"], "2026-10-05")
        self.assertEqual(len(self.db["doctor_leaves"]), 1)

    # 11. Adding leave automatically cancels pending appointments on that date
    def test_11_leave_auto_cancels_pending_appointments(self):
        self.db["appointments"].append({
            "id": "appt-pending-1",
            "doctor_id": "doc-1",
            "patient_id": "pat-1",
            "start_time": "2026-10-06T10:00:00+05:00",
            "end_time": "2026-10-06T10:30:00+05:00",
            "status": "pending"
        })
        res = self.doctor_service.add_doctor_leave("doc-1", "2026-10-06", "Personal leave")
        self.assertEqual(res["cancelled_appointments_count"], 1)
        appt = next(a for a in self.db["appointments"] if a["id"] == "appt-pending-1")
        self.assertEqual(appt["status"], "cancelled")
        self.assertIn("Personal leave", appt["cancellation_reason"])

    # 12. Adding leave automatically cancels confirmed appointments on that date
    def test_12_leave_auto_cancels_confirmed_appointments(self):
        self.db["appointments"].append({
            "id": "appt-confirmed-1",
            "doctor_id": "doc-1",
            "patient_id": "pat-2",
            "start_time": "2026-10-07T11:00:00+05:00",
            "end_time": "2026-10-07T11:30:00+05:00",
            "status": "confirmed"
        })
        res = self.doctor_service.add_doctor_leave("doc-1", "2026-10-07", "Urgent leave")
        self.assertEqual(res["cancelled_appointments_count"], 1)
        appt = next(a for a in self.db["appointments"] if a["id"] == "appt-confirmed-1")
        self.assertEqual(appt["status"], "cancelled")

    # 13. Adding leave does NOT cancel completed appointments on that date
    def test_13_leave_does_not_cancel_completed_appointments(self):
        self.db["appointments"].append({
            "id": "appt-completed-1",
            "doctor_id": "doc-1",
            "patient_id": "pat-1",
            "start_time": "2026-10-08T09:00:00+05:00",
            "end_time": "2026-10-08T09:30:00+05:00",
            "status": "completed"
        })
        self.doctor_service.add_doctor_leave("doc-1", "2026-10-08", "Afternoon emergency")
        appt = next(a for a in self.db["appointments"] if a["id"] == "appt-completed-1")
        self.assertEqual(appt["status"], "completed", "Completed appointments must never be retroactively cancelled by leave")

    # 14. Cancelled appointment due to leave preserves record and sets cancellation_reason
    def test_14_leave_cancellation_preserves_record(self):
        self.db["appointments"].append({
            "id": "appt-audit-1",
            "doctor_id": "doc-1",
            "patient_id": "pat-1",
            "start_time": "2026-10-09T14:00:00+05:00",
            "end_time": "2026-10-09T14:30:00+05:00",
            "status": "confirmed"
        })
        self.doctor_service.add_doctor_leave("doc-1", "2026-10-09", "Official leave")
        appt = next(a for a in self.db["appointments"] if a["id"] == "appt-audit-1")
        self.assertIsNotNone(appt, "Appointment record must be preserved for audit")
        self.assertEqual(appt["status"], "cancelled")
        self.assertEqual(appt["cancelled_by"], "doc-1")

    # 15. Doctor cannot delete or modify another doctor's leave
    def test_15_doctor_cannot_delete_other_doctors_leave(self):
        self.db["doctor_leaves"].append({
            "id": "leave-doc2",
            "doctor_id": "doc-2",
            "leave_date": "2026-10-15",
            "reason": "Dr. Aisha leave"
        })
        with self.assertRaises(HTTPException) as ctx:
            self.doctor_service.delete_doctor_leave(doctor_id="doc-1", leave_id="leave-doc2")
        self.assertEqual(ctx.exception.status_code, 403)

    # 16. Non-admin cannot access admin endpoints (RBAC check)
    def test_16_non_admin_rbac_enforcement(self):
        from app.core.dependencies import require_role
        from app.schemas.user import UserProfile, UserRole
        import asyncio

        patient_user = UserProfile(id="pat-1", email="pat@example.com", full_name="Pat", role=UserRole.PATIENT)
        admin_checker = require_role("admin")

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        with self.assertRaises(HTTPException) as ctx:
            loop.run_until_complete(admin_checker(current_user=patient_user))
        self.assertEqual(ctx.exception.status_code, 403)

    # 17. Non-admin cannot onboard doctors (RBAC check)
    def test_17_doctor_cannot_onboard_doctors_rbac(self):
        from app.core.dependencies import require_role
        from app.schemas.user import UserProfile, UserRole
        import asyncio

        doctor_user = UserProfile(id="doc-1", email="doc@example.com", full_name="Doc", role=UserRole.DOCTOR)
        admin_checker = require_role("admin")

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        with self.assertRaises(HTTPException) as ctx:
            loop.run_until_complete(admin_checker(current_user=doctor_user))
        self.assertEqual(ctx.exception.status_code, 403)

    # 18. Non-doctor cannot update doctor working hours (RBAC check)
    def test_18_patient_cannot_update_doctor_working_hours(self):
        from app.core.dependencies import require_role
        from app.schemas.user import UserProfile, UserRole
        import asyncio

        patient_user = UserProfile(id="pat-1", email="pat@example.com", full_name="Pat", role=UserRole.PATIENT)
        doctor_checker = require_role("doctor")

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        with self.assertRaises(HTTPException) as ctx:
            loop.run_until_complete(doctor_checker(current_user=patient_user))
        self.assertEqual(ctx.exception.status_code, 403)

    # 19. Admin viewing patient directory receives zero visit notes (privacy invariant)
    def test_19_admin_patient_directory_zero_visit_notes(self):
        patients = self.admin_service.get_patients_directory()
        self.assertGreater(len(patients), 0)
        for p in patients:
            p_dict = p.dict() if hasattr(p, "dict") else p.__dict__
            self.assertNotIn("notes", p_dict)
            self.assertNotIn("visit_notes", p_dict)
            self.assertNotIn("clinical_notes", p_dict)

    # 20. Admin emergency appointment cancellation releases slot and preserves record
    def test_20_admin_emergency_appointment_cancellation(self):
        self.db["appointments"].append({
            "id": "appt-emergency-1",
            "doctor_id": "doc-1",
            "patient_id": "pat-1",
            "start_time": "2026-10-20T10:00:00+05:00",
            "end_time": "2026-10-20T10:30:00+05:00",
            "status": "confirmed"
        })
        res = self.admin_service.cancel_appointment(
            appointment_id="appt-emergency-1",
            admin_id="admin-1",
            reason="Facility equipment maintenance"
        )
        self.assertEqual(res["status"], "cancelled")
        appt = next(a for a in self.db["appointments"] if a["id"] == "appt-emergency-1")
        self.assertEqual(appt["status"], "cancelled")
        self.assertEqual(appt["cancelled_by"], "admin-1")
        self.assertIn("maintenance", appt["cancellation_reason"])

if __name__ == "__main__":
    unittest.main()
