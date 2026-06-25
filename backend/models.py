from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
import datetime
from database import Base

class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, index=True)  # Zoom-style format: "982-371-294"
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    meeting_type = Column(String, nullable=False)  # "instant" or "scheduled"
    start_time = Column(DateTime, nullable=True)  # Nullable for instant meetings
    duration = Column(Integer, nullable=True)      # Duration in minutes
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    host_name = Column(String, default="Default User")
    is_active = Column(Boolean, default=True)

    participants = relationship("ParticipantHistory", back_populates="meeting", cascade="all, delete-orphan")

class ParticipantHistory(Base):
    __tablename__ = "participant_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    meeting_id = Column(String, ForeignKey("meetings.id"), nullable=False)
    display_name = Column(String, nullable=False)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)
    left_at = Column(DateTime, nullable=True)

    meeting = relationship("Meeting", back_populates="participants")
