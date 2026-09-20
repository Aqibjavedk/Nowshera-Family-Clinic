"""
Nowshera Family Clinic - Phase 2 Appointment Engine Tests
Verifies all 15 test requirements specified in Phase 2 instructions:
1. Patient successfully requests an available slot.
2. Same doctor + same slot cannot be booked twice (Double-booking protection).
3. Same patient cannot book two doctors at the same time.
4. Booking outside doctor's working hours is rejected.
5. Booking on doctor leave is rejected.
6. Booking with inactive doctor is rejected.
7. Patient cannot cancel within the 2-hour cutoff.
8. Patient can cancel before the 2-hour cutoff.
9. Doctor cannot mark a future appointment completed.
10. Doctor cannot access another doctor's appointments.
11. Patient cannot access another patient's appointments.
12. Pending appointment expires after its start time.
13. Rescheduling releases the old slot.
14. Rescheduling creates a new pending appointment.
15. Cancelled appointment slot becomes available again.
"""

import unittest
import asyncio
from datetime import datetime, date, time, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Any, List

import os
import sys

# Ensure backend directory is on Python module search path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Core domain modules
from app.services.slot_service import (
    KARACHI_TZ,
    generate_doctor_slots,
    get_db_day_of_week
)
from app.services.appointment_service import (
    AppointmentService,
    validate_booking_time,
    HTTPException
)
from app.schemas.appointment import AppointmentCreate

# In-Memory Supabase Table Mock for strict database simulation
class MockSupabaseQuery:
    def __init__(self, data_store: List[Dict[str, Any]], table_name: str):
        self.data_store = data_store
        self.table_name = table_name
        self.filters = []
        self._order_field = None
        self._order_desc = False
        self._limit = None
        self._update_payload = None

    def select(self, *args, **kwargs):
        return self

    def eq(self, field: str, value: Any):
        self.filters.append((field, "eq", value))
        return self

    def neq(self, field: str, value: Any):
        self.filters.append((field, "neq", value))
        return self

    def gte(self, field: str, value: Any):
        self.filters.append((field, "gte", value))
        return self

    def lte(self, field: str, value: Any):
        self.filters.append((field, "lte", value))
        return self

    def order(self, field: str, desc: bool = False):
        self._order_field = field
        self._order_desc = desc
        return self

    def limit(self, count: int):
        self._limit = count
        return self

    def insert(self, payload: Dict[str, Any]):
        class ExecWrapper:
            def __init__(self, store, p):
                self.store = store
                self.payload = p
            def execute(inner_self):
                item = dict(inner_self.payload)
                if "id" not in item:
                    item["id"] = f"mock-id-{len(inner_self.store) + 1}"
                if "created_at" not in item:
                    item["created_at"] = datetime.now(KARACHI_TZ).isoformat()
                inner_self.store.append(item)
                class Result:
                    data = [item]
                return Result()
        return ExecWrapper(self.data_store, payload)

    def update(self, payload: Dict[str, Any]):
        self._update_payload = payload
        return self

    def execute(self):
        if self._update_payload is not None:
            updated_items = []
            for item in self.data_store:
                match = True
                for field, op, val in self.filters:
                    if op == "eq" and item.get(field) != val:
                        match = False
                    elif op == "neq" and item.get(field) == val:
                        match = False
                if match:
                    item.update(self._update_payload)
                    updated_items.append(dict(item))
            class Result:
                data = updated_items
            return Result()

        filtered = []
        for item in self.data_store:
            match = True
            for field, op, val in self.filters:
                item_val = item.get(field)
                if op == "eq" and item_val != val:
                    match = False
                elif op == "neq" and item_val == val:
                    match = False
                elif op == "gte" and str(item_val) < str(val):
                    match = False
                elif op == "lte" and str(item_val) > str(val):
                    match = False
            if match:
                filtered.append(dict(item))

        if self._order_field:
            filtered.sort(key=lambda x: x.get(self._order_field, ""), reverse=self._order_desc)
        if self._limit:
            filtered = filtered[:self._limit]

        class Result:
            data = filtered
        return Result()

class MockSupabaseClient:
    def __init__(self):
        self.tables: Dict[str, List[Dict[str, Any]]] = {
            "doctors": [],
            "doctor_working_hours": [],
            "doctor_leaves": [],
            "appointments": [],
            "profiles": []
        }

    def table(self, table_name: str) -> MockSupabaseQuery:
        if table_name not in self.tables:
            self.tables[table_name] = []
        return MockSupabaseQuery(self.tables[table_name], table_name)


class TestAppointmentEngine(unittest.TestCase):
    def setUp(self):
        self.mock_client = MockSupabaseClient()
        self.service = AppointmentService(self.mock_client)

        # Baseline timestamp in Asia/Karachi (Monday morning 08:00 AM)
        self.simulated_now = datetime(2026, 9, 21, 8, 0, 0, tzinfo=KARACHI_TZ)
        self.monday_date = date(2026, 9, 21) # 2026-09-21 is Monday (day_of_week 1 in DB)

        # 1. Setup Active Doctor
        self.doctor_id = "doc-uuid-001"
        self.mock_client.tables["doctors"] = [{
            "id": self.doctor_id,
            "is_active": True,
            "qualification": "MBBS, FCPS",
            "profiles": {"full_name": "Dr. Shams ur Rehman"},
            "specialties": {"name": "Family Medicine"}
        }]

        # Monday is 1 in clinic DB (Sunday=0, Monday=1, ..., Saturday=6)
        self.mock_client.tables["doctor_working_hours"] = [{
            "doctor_id": self.doctor_id,
            "day_of_week": 1,
            "start_time": "09:00:00",
            "end_time": "17:00:00",
            "is_available": True
        }]

        self.mock_client.tables["doctor_leaves"] = []
        self.mock_client.tables["appointments"] = []

        self.patient_id = "patient-uuid-101"
        self.patient_2_id = "patient-uuid-102"

    # --------------------------------------------------------------------------
    # Case 1: Patient successfully requests an available slot.
    # --------------------------------------------------------------------------
    def test_case_01_patient_successfully_requests_available_slot(self):
        req = AppointmentCreate(
            doctor_id=self.doctor_id,
            start_time="2026-09-21T09:30:00+05:00"
        )
        res = asyncio.run(self.service.create_appointment(
            patient_id=self.patient_id,
            data=req,
            current_time=self.simulated_now
        ))
        self.assertEqual(res.status, "pending")
        self.assertEqual(res.doctor_id, self.doctor_id)
        self.assertEqual(res.patient_id, self.patient_id)
        self.assertEqual(res.start_time, "2026-09-21T09:30:00+05:00")
        self.assertEqual(res.end_time, "2026-09-21T10:00:00+05:00")

    # --------------------------------------------------------------------------
    # Case 2: Same doctor + same slot cannot be booked twice (Double-booking protection).
    # --------------------------------------------------------------------------
    def test_case_02_doctor_double_booking_rejected(self):
        req = AppointmentCreate(
            doctor_id=self.doctor_id,
            start_time="2026-09-21T10:00:00+05:00"
        )
        # First booking succeeds
        asyncio.run(self.service.create_appointment(
            patient_id=self.patient_id,
            data=req,
            current_time=self.simulated_now
        ))

        # Second booking for same doctor & slot by another patient must raise 409 Conflict
        req_second = AppointmentCreate(
            doctor_id=self.doctor_id,
            start_time="2026-09-21T10:00:00+05:00"
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(self.service.create_appointment(
                patient_id=self.patient_2_id,
                data=req_second,
                current_time=self.simulated_now
            ))
        self.assertEqual(ctx.exception.status_code, 409)

    # --------------------------------------------------------------------------
    # Case 3: Same patient cannot book two doctors at the same time.
    # --------------------------------------------------------------------------
    def test_case_03_patient_overlapping_appointment_rejected(self):
        # Add Doctor 2
        doctor_2_id = "doc-uuid-002"
        self.mock_client.tables["doctors"].append({
            "id": doctor_2_id,
            "is_active": True,
            "qualification": "MD Pediatrics",
            "profiles": {"full_name": "Dr. Ayesha"},
            "specialties": {"name": "Pediatrics"}
        })
        self.mock_client.tables["doctor_working_hours"].append({
            "doctor_id": doctor_2_id,
            "day_of_week": 1,
            "start_time": "09:00:00",
            "end_time": "17:00:00",
            "is_available": True
        })

        # Book with Doctor 1 at 11:00 AM
        req1 = AppointmentCreate(
            doctor_id=self.doctor_id,
            start_time="2026-09-21T11:00:00+05:00"
        )
        asyncio.run(self.service.create_appointment(
            patient_id=self.patient_id,
            data=req1,
            current_time=self.simulated_now
        ))

        # Attempt to book Doctor 2 at same 11:00 AM with same patient
        req2 = AppointmentCreate(
            doctor_id=doctor_2_id,
            start_time="2026-09-21T11:00:00+05:00"
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(self.service.create_appointment(
                patient_id=self.patient_id,
                data=req2,
                current_time=self.simulated_now
            ))
        self.assertEqual(ctx.exception.status_code, 409)

    # --------------------------------------------------------------------------
    # Case 4: Booking outside doctor's working hours is rejected.
    # --------------------------------------------------------------------------
    def test_case_04_booking_outside_working_hours_rejected(self):
        # 18:00 PM is after 17:00 PM closing
        req = AppointmentCreate(
            doctor_id=self.doctor_id,
            start_time="2026-09-21T18:00:00+05:00"
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(self.service.create_appointment(
                patient_id=self.patient_id,
                data=req,
                current_time=self.simulated_now
            ))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("working hours", ctx.exception.detail.lower())

    # --------------------------------------------------------------------------
    # Case 5: Booking on doctor leave is rejected.
    # --------------------------------------------------------------------------
    def test_case_05_booking_on_doctor_leave_rejected(self):
        self.mock_client.tables["doctor_leaves"].append({
            "doctor_id": self.doctor_id,
            "leave_date": "2026-09-21",
            "reason": "Annual Medical Conference"
        })
        req = AppointmentCreate(
            doctor_id=self.doctor_id,
            start_time="2026-09-21T10:00:00+05:00"
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(self.service.create_appointment(
                patient_id=self.patient_id,
                data=req,
                current_time=self.simulated_now
            ))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("leave", ctx.exception.detail.lower())

    # --------------------------------------------------------------------------
    # Case 6: Booking with inactive doctor is rejected.
    # --------------------------------------------------------------------------
    def test_case_06_booking_with_inactive_doctor_rejected(self):
        self.mock_client.tables["doctors"][0]["is_active"] = False
        req = AppointmentCreate(
            doctor_id=self.doctor_id,
            start_time="2026-09-21T10:00:00+05:00"
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(self.service.create_appointment(
                patient_id=self.patient_id,
                data=req,
                current_time=self.simulated_now
            ))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("inactive", ctx.exception.detail.lower())

    # --------------------------------------------------------------------------
    # Case 7: Patient cannot cancel within the 2-hour cutoff.
    # --------------------------------------------------------------------------
    def test_case_07_cancel_within_2_hours_rejected(self):
        # Appointment at 09:30 AM
        appt_id = "appt-cutoff-test"
        self.mock_client.tables["appointments"].append({
            "id": appt_id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T09:30:00+05:00",
            "end_time": "2026-09-21T10:00:00+05:00",
            "status": "confirmed"
        })
        # Current time is 08:30 AM (only 1 hour prior -> less than 2 hours cutoff)
        now_1h_prior = datetime(2026, 9, 21, 8, 30, 0, tzinfo=KARACHI_TZ)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(self.service.cancel_appointment(
                patient_id=self.patient_id,
                appointment_id=appt_id,
                reason="Personal emergency",
                current_time=now_1h_prior
            ))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("2 hours", ctx.exception.detail)

    # --------------------------------------------------------------------------
    # Case 8: Patient can cancel before the 2-hour cutoff.
    # --------------------------------------------------------------------------
    def test_case_08_cancel_before_2_hours_succeeds(self):
        appt_id = "appt-cancel-allowed"
        self.mock_client.tables["appointments"].append({
            "id": appt_id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T14:00:00+05:00",
            "end_time": "2026-09-21T14:30:00+05:00",
            "status": "confirmed"
        })
        # Current time 08:00 AM (6 hours before -> allowed)
        res = asyncio.run(self.service.cancel_appointment(
            patient_id=self.patient_id,
            appointment_id=appt_id,
            reason="Schedule change",
            current_time=self.simulated_now
        ))
        self.assertEqual(res.status, "cancelled")
        self.assertEqual(res.cancellation_reason, "Schedule change")
        self.assertEqual(res.cancelled_by, self.patient_id)

    # --------------------------------------------------------------------------
    # Case 9: Doctor cannot mark a future appointment completed.
    # --------------------------------------------------------------------------
    def test_case_09_doctor_cannot_mark_future_appointment_completed(self):
        appt_id = "appt-future"
        self.mock_client.tables["appointments"].append({
            "id": appt_id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T14:00:00+05:00",
            "end_time": "2026-09-21T14:30:00+05:00",
            "status": "confirmed"
        })
        # Current time is 08:00 AM
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(self.service.complete_appointment(
                doctor_id=self.doctor_id,
                appointment_id=appt_id,
                current_time=self.simulated_now
            ))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("before its scheduled start time", ctx.exception.detail.lower())

    # --------------------------------------------------------------------------
    # Case 10: Doctor cannot access another doctor's appointments.
    # --------------------------------------------------------------------------
    def test_case_10_doctor_cannot_manage_another_doctors_appointment(self):
        other_doctor_id = "doc-uuid-999"
        appt_id = "appt-other-doc"
        self.mock_client.tables["appointments"].append({
            "id": appt_id,
            "patient_id": self.patient_id,
            "doctor_id": other_doctor_id,
            "start_time": "2026-09-21T10:00:00+05:00",
            "end_time": "2026-09-21T10:30:00+05:00",
            "status": "pending"
        })
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(self.service.confirm_appointment(
                doctor_id=self.doctor_id, # Attempted by doctor 1
                appointment_id=appt_id,
                current_time=self.simulated_now
            ))
        self.assertEqual(ctx.exception.status_code, 403)

    # --------------------------------------------------------------------------
    # Case 11: Patient cannot access another patient's appointments.
    # --------------------------------------------------------------------------
    def test_case_11_patient_cannot_cancel_another_patients_appointment(self):
        appt_id = "appt-patient2"
        self.mock_client.tables["appointments"].append({
            "id": appt_id,
            "patient_id": self.patient_2_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T15:00:00+05:00",
            "end_time": "2026-09-21T15:30:00+05:00",
            "status": "confirmed"
        })
        # Patient 1 tries to cancel Patient 2's appointment
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(self.service.cancel_appointment(
                patient_id=self.patient_id,
                appointment_id=appt_id,
                current_time=self.simulated_now
            ))
        self.assertEqual(ctx.exception.status_code, 403)

    # --------------------------------------------------------------------------
    # Case 12: Pending appointment expires after its start time (and all status invariants).
    # --------------------------------------------------------------------------
    def test_case_12_pending_appointment_expires_after_start_time(self):
        # 1. Past Pending -> Must become Cancelled
        self.mock_client.tables["appointments"].append({
            "id": "appt-stale-pending",
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T07:00:00+05:00",
            "end_time": "2026-09-21T07:30:00+05:00",
            "status": "pending"
        })
        # 2. Future Pending -> Must remain Pending
        self.mock_client.tables["appointments"].append({
            "id": "appt-future-pending",
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T09:00:00+05:00",
            "end_time": "2026-09-21T09:30:00+05:00",
            "status": "pending"
        })
        # 3. Past Confirmed -> Must remain Confirmed
        self.mock_client.tables["appointments"].append({
            "id": "appt-past-confirmed",
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T07:30:00+05:00",
            "end_time": "2026-09-21T08:00:00+05:00",
            "status": "confirmed"
        })
        # 4. Past Completed -> Must remain Completed
        self.mock_client.tables["appointments"].append({
            "id": "appt-past-completed",
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T06:30:00+05:00",
            "end_time": "2026-09-21T07:00:00+05:00",
            "status": "completed"
        })
        # 5. Past No-Show -> Must remain No-Show
        self.mock_client.tables["appointments"].append({
            "id": "appt-past-noshow",
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T06:00:00+05:00",
            "end_time": "2026-09-21T06:30:00+05:00",
            "status": "no_show"
        })
        # 6. Past Cancelled -> Must remain Cancelled
        self.mock_client.tables["appointments"].append({
            "id": "appt-past-cancelled",
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T05:30:00+05:00",
            "end_time": "2026-09-21T06:00:00+05:00",
            "status": "cancelled",
            "cancellation_reason": "Patient cancelled earlier"
        })

        # Run expiration at 08:00 AM (only appt-stale-pending qualifies)
        count = asyncio.run(self.service.expire_pending_appointments(
            current_time=self.simulated_now
        ))
        self.assertEqual(count, 1)

        # Verify all records
        records_by_id = {r["id"]: r for r in self.mock_client.tables["appointments"]}
        self.assertEqual(records_by_id["appt-stale-pending"]["status"], "cancelled")
        self.assertEqual(records_by_id["appt-stale-pending"]["cancellation_reason"], "Pending appointment expired")
        self.assertEqual(records_by_id["appt-future-pending"]["status"], "pending")
        self.assertEqual(records_by_id["appt-past-confirmed"]["status"], "confirmed")
        self.assertEqual(records_by_id["appt-past-completed"]["status"], "completed")
        self.assertEqual(records_by_id["appt-past-noshow"]["status"], "no_show")
        self.assertEqual(records_by_id["appt-past-cancelled"]["status"], "cancelled")
        self.assertEqual(records_by_id["appt-past-cancelled"]["cancellation_reason"], "Patient cancelled earlier")

    # --------------------------------------------------------------------------
    # Case 13: Rescheduling releases the old slot.
    # --------------------------------------------------------------------------
    def test_case_13_rescheduling_releases_old_slot(self):
        old_appt_id = "appt-to-reschedule-1"
        self.mock_client.tables["appointments"].append({
            "id": old_appt_id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T11:00:00+05:00",
            "end_time": "2026-09-21T11:30:00+05:00",
            "status": "confirmed"
        })

        new_slot_str = "2026-09-21T14:30:00+05:00"
        asyncio.run(self.service.reschedule_appointment(
            patient_id=self.patient_id,
            appointment_id=old_appt_id,
            new_start_time_str=new_slot_str,
            current_time=self.simulated_now
        ))

        # Check that old appointment status was set to cancelled and old slot released
        old_record = [a for a in self.mock_client.tables["appointments"] if a["id"] == old_appt_id][0]
        self.assertEqual(old_record["status"], "cancelled")
        self.assertIn("Rescheduled", old_record["cancellation_reason"])

    # --------------------------------------------------------------------------
    # Case 14: Rescheduling creates a new pending appointment.
    # --------------------------------------------------------------------------
    def test_case_14_rescheduling_creates_new_pending_appointment(self):
        old_appt_id = "appt-to-reschedule-2"
        self.mock_client.tables["appointments"].append({
            "id": old_appt_id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "start_time": "2026-09-21T11:30:00+05:00",
            "end_time": "2026-09-21T12:00:00+05:00",
            "status": "confirmed"
        })

        new_slot_str = "2026-09-21T15:00:00+05:00"
        new_res = asyncio.run(self.service.reschedule_appointment(
            patient_id=self.patient_id,
            appointment_id=old_appt_id,
            new_start_time_str=new_slot_str,
            current_time=self.simulated_now
        ))

        self.assertEqual(new_res.status, "pending")
        self.assertEqual(new_res.start_time, new_slot_str)

    # --------------------------------------------------------------------------
    # Case 15: Cancelled appointment slot becomes available again.
    # --------------------------------------------------------------------------
    def test_case_15_cancelled_appointment_slot_becomes_available_again(self):
        # 1. Book slot at 10:30 AM
        active_appts = [{
            "start_time": "2026-09-21T10:30:00+05:00",
            "end_time": "2026-09-21T11:00:00+05:00",
            "status": "confirmed"
        }]
        slots_occupied = generate_doctor_slots(
            doctor_id=self.doctor_id,
            target_date=self.monday_date,
            doctor_data={"is_active": True},
            working_hours_list=self.mock_client.tables["doctor_working_hours"],
            leaves_list=[],
            active_appointments=active_appts,
            current_time=self.simulated_now
        )
        occupied_times = [s.start_time for s in slots_occupied]
        self.assertNotIn("2026-09-21T10:30:00+05:00", occupied_times)

        # 2. Cancel the appointment
        active_appts[0]["status"] = "cancelled"
        slots_after_cancel = generate_doctor_slots(
            doctor_id=self.doctor_id,
            target_date=self.monday_date,
            doctor_data={"is_active": True},
            working_hours_list=self.mock_client.tables["doctor_working_hours"],
            leaves_list=[],
            active_appointments=active_appts,
            current_time=self.simulated_now
        )
        available_times = [s.start_time for s in slots_after_cancel]
        # The slot is now available again
        self.assertIn("2026-09-21T10:30:00+05:00", available_times)

if __name__ == "__main__":
    unittest.main()
