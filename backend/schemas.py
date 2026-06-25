from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class MeetingBase(BaseModel):
    title: str
    description: Optional[str] = None
    meeting_type: str  # "instant" or "scheduled"
    start_time: Optional[datetime] = None
    duration: Optional[int] = None
    host_name: Optional[str] = "Default User"

class MeetingCreate(MeetingBase):
    pass

class ParticipantHistoryResponse(BaseModel):
    id: int
    meeting_id: str
    display_name: str
    joined_at: datetime
    left_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class MeetingResponse(MeetingBase):
    id: str
    created_at: datetime
    is_active: bool
    participants: List[ParticipantHistoryResponse] = []

    class Config:
        from_attributes = True
