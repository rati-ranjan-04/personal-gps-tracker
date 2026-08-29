import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import Base, engine, get_db
from .models import Device, Location, utcnow
from .schemas import DeviceRegister, Health, LocationCreate, LocationOut, TrackingStatus

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("gps-tracker")
app = FastAPI(title=settings.app_name, version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Authorization", "Content-Type"])
Base.metadata.create_all(bind=engine)

_buckets: dict[str, deque[float]] = defaultdict(deque)


def auth(authorization: Annotated[str | None, Header()] = None) -> None:
    if not authorization or authorization != f"Bearer {settings.api_token}":
        logger.warning("authentication failure")
        raise HTTPException(status_code=401, detail="Authentication required")


def rate_limit(request: Request) -> None:
    now = time.monotonic()
    bucket = _buckets[request.client.host if request.client else "unknown"]
    while bucket and now - bucket[0] > 60:
        bucket.popleft()
    if len(bucket) >= settings.rate_limit_per_minute:
        raise HTTPException(status_code=429, detail="Too many requests")
    bucket.append(now)

Auth = Annotated[None, Depends(auth)]


@app.middleware("http")
async def request_logging(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    logger.info("request method=%s path=%s status=%s duration_ms=%.1f", request.method, request.url.path, response.status_code, (time.perf_counter() - started) * 1000)
    return response


@app.get("/api/health", response_model=Health)
def health(_: None = Depends(rate_limit)):
    return {"status": "ok"}


@app.post("/api/device/register")
def register_device(payload: DeviceRegister, _: Auth, db: Session = Depends(get_db)):
    device = db.scalar(select(Device).where(Device.device_id == payload.device_id))
    if device is None:
        device = Device(device_id=payload.device_id, name=payload.name)
        db.add(device)
    else:
        device.name = payload.name
    db.commit()
    return {"device_id": device.device_id, "registered": True}


def get_authorized_device(device_id: str, db: Session) -> Device:
    device = db.scalar(select(Device).where(Device.device_id == device_id))
    if device is None:
        raise HTTPException(status_code=404, detail="Device not registered")
    return device


@app.post("/api/location", response_model=LocationOut, status_code=201)
def receive_location(payload: LocationCreate, _: Auth, db: Session = Depends(get_db)):
    device = get_authorized_device(payload.device_id, db)
    if not device.tracking_enabled:
        raise HTTPException(status_code=409, detail="Tracking is disabled")
    location = Location(**payload.model_dump())
    device.last_seen = utcnow()
    db.add(location)
    db.commit()
    db.refresh(location)
    logger.info("location update received device=%s", device.device_id)
    return location


@app.get("/api/location/latest", response_model=LocationOut)
def latest_location(_: Auth, db: Session = Depends(get_db)):
    location = db.scalar(select(Location).order_by(Location.timestamp.desc()).limit(1))
    if location is None:
        raise HTTPException(status_code=404, detail="No location available")
    return location


@app.get("/api/location/history", response_model=list[LocationOut])
def location_history(_: Auth, db: Session = Depends(get_db), limit: int = Query(10, ge=1, le=100), start_time: datetime | None = None, end_time: datetime | None = None):
    query = select(Location).order_by(Location.timestamp.desc()).limit(min(limit, settings.max_history_limit))
    if start_time:
        query = query.where(Location.timestamp >= start_time)
    if end_time:
        query = query.where(Location.timestamp <= end_time)
    return list(db.scalars(query).all())


@app.get("/api/tracking/status", response_model=TrackingStatus)
def tracking_status(_: Auth, db: Session = Depends(get_db)):
    device = db.scalar(select(Device).order_by(Device.last_seen.desc().nullslast()).limit(1))
    if device is None:
        raise HTTPException(status_code=404, detail="Device not registered")
    latest = db.scalar(select(Location).where(Location.device_id == device.device_id).order_by(Location.timestamp.desc()).limit(1))
    return TrackingStatus(device_id=device.device_id, tracking_enabled=device.tracking_enabled, last_update=latest.timestamp if latest else None, gps_accuracy=latest.accuracy if latest else None, battery=latest.battery if latest else None, network_status="online" if device.last_seen and utcnow() - device.last_seen < timedelta(minutes=5) else "offline")


def set_tracking(enabled: bool, db: Session):
    device = db.scalar(select(Device).order_by(Device.last_seen.desc().nullslast()).limit(1))
    if device is None:
        raise HTTPException(status_code=404, detail="Device not registered")
    device.tracking_enabled = enabled
    db.commit()
    return {"tracking_enabled": enabled}


@app.post("/api/tracking/start")
def start_tracking(_: Auth, db: Session = Depends(get_db)):
    return set_tracking(True, db)


@app.post("/api/tracking/stop")
def stop_tracking(_: Auth, db: Session = Depends(get_db)):
    return set_tracking(False, db)


@app.delete("/api/location/history")
def clear_history(_: Auth, db: Session = Depends(get_db)):
    result = db.execute(delete(Location))
    db.commit()
    return {"deleted": result.rowcount or 0}
