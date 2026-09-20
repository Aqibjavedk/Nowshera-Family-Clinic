from datetime import datetime, date, time, timedelta
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

from app.schemas.appointment import SlotResponse

KARACHI_TZ = ZoneInfo("Asia/Karachi")

def parse_iso_datetime(dt_str: str) -> datetime:
    """
    Parses an ISO 8601 string and ensures it is timezone-aware in Asia/Karachi.
    """
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=KARACHI_TZ)
    return dt.astimezone(KARACHI_TZ)

def get_db_day_of_week(d: date) -> int:
    """
    Maps Python weekday (Monday=0 ... Sunday=6)
    to database day_of_week constraint (Sunday=0, Monday=1 ... Saturday=6).
    """
    return (d.weekday() + 1) % 7

def generate_doctor_slots(
    doctor_id: str,
    target_date: date,
    doctor_data: Dict[str, Any],
    working_hours_list: List[Dict[str, Any]],
    leaves_list: List[Dict[str, Any]],
    active_appointments: List[Dict[str, Any]],
    current_time: Optional[datetime] = None,
) -> List[SlotResponse]:
    """
    Pure generator for doctor 30-minute slots applying all clinic business rules:
    - Doctor active verification
    - Leave date detection
    - Weekly schedule hours lookup
    - 30-minute interval stepping
    - Active appointment conflict exclusion (cancelled appointments do not block)
    - Past time exclusion relative to Asia/Karachi
    """
    if not doctor_data.get("is_active", True):
        return []

    # 1. Check if doctor is on leave on target_date
    date_str = target_date.isoformat()
    for leave in leaves_list:
        leave_val = str(leave.get("leave_date", ""))
        if leave_val.startswith(date_str):
            # Doctor is on leave for the full day
            return []

    # 2. Determine day of week
    db_dow = get_db_day_of_week(target_date)
    matching_wh = None
    for wh in working_hours_list:
        if wh.get("day_of_week") == db_dow and wh.get("is_available", True):
            matching_wh = wh
            break

    if not matching_wh:
        # Not a working day for this doctor
        return []

    # Parse start and end time
    start_time_val = matching_wh["start_time"]
    end_time_val = matching_wh["end_time"]

    if isinstance(start_time_val, str):
        wh_start = time.fromisoformat(start_time_val)
    else:
        wh_start = start_time_val

    if isinstance(end_time_val, str):
        wh_end = time.fromisoformat(end_time_val)
    else:
        wh_end = end_time_val

    # Construct start and end datetime in Asia/Karachi
    day_start_dt = datetime.combine(target_date, wh_start, tzinfo=KARACHI_TZ)
    day_end_dt = datetime.combine(target_date, wh_end, tzinfo=KARACHI_TZ)

    # 3. Identify occupied start times (only appointments WHERE status != 'cancelled')
    occupied_starts = set()
    for appt in active_appointments:
        if appt.get("status") != "cancelled":
            appt_start = parse_iso_datetime(str(appt["start_time"]))
            occupied_starts.add(appt_start.isoformat())

    # 4. Current time comparison in Asia/Karachi
    now_karachi = current_time or datetime.now(KARACHI_TZ)

    # 5. Generate 30-minute slots
    slots: List[SlotResponse] = []
    slot_cursor = day_start_dt
    slot_duration = timedelta(minutes=30)

    while slot_cursor + slot_duration <= day_end_dt:
        slot_end = slot_cursor + slot_duration

        # Condition 6: Remove slots that are in the past
        if slot_cursor <= now_karachi:
            slot_cursor += slot_duration
            continue

        # Condition 5: Remove slots occupied by an active appointment
        if slot_cursor.isoformat() in occupied_starts:
            slot_cursor += slot_duration
            continue

        slots.append(
            SlotResponse(
                start_time=slot_cursor.isoformat(),
                end_time=slot_end.isoformat(),
                available=True
            )
        )
        slot_cursor += slot_duration

    return slots

async def fetch_and_generate_available_slots(
    doctor_id: str,
    date_str: str,
    supabase_client: Any,
    current_time: Optional[datetime] = None
) -> List[SlotResponse]:
    """
    Fetches required database entities and executes slot generation for an active doctor.
    """
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Expected YYYY-MM-DD"
        )

    # 1. Fetch doctor record
    doc_res = (
        supabase_client.table("doctors")
        .select("id, is_active, profiles(full_name)")
        .eq("id", doctor_id)
        .limit(1)
        .execute()
    )
    if not doc_res.data or len(doc_res.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found"
        )

    doctor_data = doc_res.data[0]
    if not doctor_data.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Doctor is currently inactive"
        )

    # 2. Fetch working hours
    wh_res = (
        supabase_client.table("doctor_working_hours")
        .select("day_of_week, start_time, end_time, is_available")
        .eq("doctor_id", doctor_id)
        .execute()
    )
    working_hours = wh_res.data or []

    # 3. Fetch leaves
    leaves_res = (
        supabase_client.table("doctor_leaves")
        .select("leave_date")
        .eq("doctor_id", doctor_id)
        .execute()
    )
    leaves = leaves_res.data or []

    # 4. Fetch active appointments for this doctor on target_date
    start_of_day = datetime.combine(target_date, time.min, tzinfo=KARACHI_TZ).isoformat()
    end_of_day = datetime.combine(target_date, time.max, tzinfo=KARACHI_TZ).isoformat()

    appts_res = (
        supabase_client.table("appointments")
        .select("start_time, end_time, status")
        .eq("doctor_id", doctor_id)
        .gte("start_time", start_of_day)
        .lte("start_time", end_of_day)
        .neq("status", "cancelled")
        .execute()
    )
    active_appts = appts_res.data or []

    return generate_doctor_slots(
        doctor_id=doctor_id,
        target_date=target_date,
        doctor_data=doctor_data,
        working_hours_list=working_hours,
        leaves_list=leaves,
        active_appointments=active_appts,
        current_time=current_time
    )
