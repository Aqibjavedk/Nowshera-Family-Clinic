from fastapi import APIRouter
from app.api.v1.endpoints import health, auth, doctors, slots, appointments, admin

api_router = APIRouter()

api_router.include_router(health.router, tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(doctors.router, prefix="/doctors", tags=["Doctors"])
api_router.include_router(slots.router, prefix="/slots", tags=["Slots"])
api_router.include_router(appointments.router, prefix="/appointments", tags=["Appointments"])
api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
