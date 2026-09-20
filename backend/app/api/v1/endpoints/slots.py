from typing import List
from fastapi import APIRouter, Query, Depends, HTTPException, status
from app.db.supabase import get_supabase_client
from app.schemas.appointment import SlotResponse
from app.services.slot_service import fetch_and_generate_available_slots

router = APIRouter()

@router.get("/available", response_model=List[SlotResponse], summary="Generate Available 30-Minute Slots")
async def get_available_slots(
    doctor_id: str = Query(..., description="UUID of the doctor"),
    date: str = Query(..., description="Date in YYYY-MM-DD format (clinic timezone Asia/Karachi)")
):
    """
    Generates 30-minute slots between the doctor's working hours for the requested date:
    - Verifies doctor exists and is active
    - Checks recurring weekly schedule
    - Checks for doctor leave on requested date
    - Filters out slots already occupied by active appointments (cancelled appointments do not block)
    - Filters out past slots relative to Asia/Karachi
    - Returns slot list with start_time, end_time, and available status
    """
    client = get_supabase_client()
    return await fetch_and_generate_available_slots(
        doctor_id=doctor_id,
        date_str=date,
        supabase_client=client
    )
