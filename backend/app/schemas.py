from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator


class DeviceRegister(BaseModel):
    device_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
    name: str = Field(default="Authorized device", min_length=1, max_length=128)


class LocationCreate(BaseModel):
    device_id: str = Field(min_length=1, max_length=128)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0, le=100000)
    altitude: float | None = None
    speed: float | None = Field(default=None, ge=0)
    bearing: float | None = Field(default=None, ge=0, le=360)
    battery: int | None = Field(default=None, ge=0, le=100)
    timestamp: datetime

    @field_validator("timestamp")
    @classmethod
    def timestamp_must_be_aware(cls, value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class LocationOut(LocationCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TrackingStatus(BaseModel):
    device_id: str
    tracking_enabled: bool
    last_update: datetime | None
    gps_accuracy: float | None
    battery: int | None
    network_status: str


class Health(BaseModel):
    status: str
