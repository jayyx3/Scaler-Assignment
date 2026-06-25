import random
import datetime
from sqlalchemy.orm import Session
import models
import schemas

def generate_meeting_id(db: Session) -> str:
    while True:
        # Generates a string like "123-456-789"
        part1 = "".join(str(random.randint(0, 9)) for _ in range(3))
        part2 = "".join(str(random.randint(0, 9)) for _ in range(3))
        part3 = "".join(str(random.randint(0, 9)) for _ in range(3))
        m_id = f"{part1}-{part2}-{part3}"
        # Check uniqueness
        exists = db.query(models.Meeting).filter(models.Meeting.id == m_id).first()
        if not exists:
            return m_id

def get_meeting(db: Session, meeting_id: str):
    return db.query(models.Meeting).filter(models.Meeting.id == meeting_id).first()

def get_upcoming_meetings(db: Session):
    now = datetime.datetime.utcnow()
    # Upcoming meetings are scheduled meetings with start_time in the future
    return db.query(models.Meeting).filter(
        models.Meeting.meeting_type == "scheduled",
        models.Meeting.start_time >= now,
        models.Meeting.is_active == True
    ).order_by(models.Meeting.start_time.asc()).all()

def get_recent_meetings(db: Session):
    now = datetime.datetime.utcnow()
    # Recent meetings are instant meetings or scheduled meetings that have started in the past
    return db.query(models.Meeting).filter(
        (models.Meeting.meeting_type == "instant") | 
        ((models.Meeting.meeting_type == "scheduled") & (models.Meeting.start_time < now))
    ).order_by(models.Meeting.created_at.desc()).limit(10).all()

def create_meeting(db: Session, meeting: schemas.MeetingCreate, custom_id: str = None):
    db_id = custom_id or generate_meeting_id(db)
    db_meeting = models.Meeting(
        id=db_id,
        title=meeting.title,
        description=meeting.description,
        meeting_type=meeting.meeting_type,
        start_time=meeting.start_time,
        duration=meeting.duration,
        host_name=meeting.host_name,
        is_active=True
    )
    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)
    return db_meeting

def log_participant_join(db: Session, meeting_id: str, display_name: str):
    db_part = models.ParticipantHistory(
        meeting_id=meeting_id,
        display_name=display_name,
        joined_at=datetime.datetime.utcnow()
    )
    db.add(db_part)
    db.commit()
    db.refresh(db_part)
    return db_part

def log_participant_leave(db: Session, meeting_id: str, display_name: str):
    db_part = db.query(models.ParticipantHistory).filter(
        models.ParticipantHistory.meeting_id == meeting_id,
        models.ParticipantHistory.display_name == display_name,
        models.ParticipantHistory.left_at == None
    ).order_by(models.ParticipantHistory.joined_at.desc()).first()
    
    if db_part:
        db_part.left_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(db_part)
    return db_part

def seed_data(db: Session):
    # Check if we already have meetings
    if db.query(models.Meeting).first() is not None:
        return
        
    now = datetime.datetime.utcnow()
    
    # 1. Upcoming meetings
    upcoming = [
        models.Meeting(
            id="482-192-385",
            title="SDE Intern Evaluation Interview",
            description="Discuss assignment progress and ask system design questions.",
            meeting_type="scheduled",
            start_time=now + datetime.timedelta(hours=2),
            duration=45,
            host_name="Scaler Recruiter",
            is_active=True
        ),
        models.Meeting(
            id="928-301-482",
            title="FastAPI WebRTC Architecture Review",
            description="Refining the peer connections for the production platform.",
            meeting_type="scheduled",
            start_time=now + datetime.timedelta(days=1, hours=4),
            duration=60,
            host_name="Lead Architect",
            is_active=True
        ),
        models.Meeting(
            id="294-817-302",
            title="Weekly Frontend Sprint Sync",
            description="Aligning on Next.js UI performance and design aesthetics.",
            meeting_type="scheduled",
            start_time=now + datetime.timedelta(days=2, hours=1),
            duration=30,
            host_name="UI Lead",
            is_active=True
        )
    ]
    
    # 2. Recent meetings
    recent = [
        models.Meeting(
            id="103-948-281",
            title="Zoom Clone Project Kickoff",
            description="Initial planning and requirement analysis.",
            meeting_type="scheduled",
            start_time=now - datetime.timedelta(days=1),
            duration=60,
            created_at=now - datetime.timedelta(days=1, hours=1),
            host_name="Project Manager",
            is_active=False
        ),
        models.Meeting(
            id="738-294-910",
            title="React Context vs Redux Debate",
            description="Technical discussion for state management strategy.",
            meeting_type="instant",
            start_time=None,
            duration=None,
            created_at=now - datetime.timedelta(hours=5),
            host_name="Senior Frontend Engineer",
            is_active=False
        )
    ]
    
    for m in upcoming + recent:
        db.add(m)
    db.commit()
    
    # Add some participant history for recent meetings
    p1 = models.ParticipantHistory(
        meeting_id="103-948-281",
        display_name="Project Manager",
        joined_at=now - datetime.timedelta(days=1),
        left_at=now - datetime.timedelta(days=1) + datetime.timedelta(minutes=58)
    )
    p2 = models.ParticipantHistory(
        meeting_id="103-948-281",
        display_name="SDE Candidate",
        joined_at=now - datetime.timedelta(days=1) + datetime.timedelta(minutes=2),
        left_at=now - datetime.timedelta(days=1) + datetime.timedelta(minutes=55)
    )
    p3 = models.ParticipantHistory(
        meeting_id="738-294-910",
        display_name="Senior Frontend Engineer",
        joined_at=now - datetime.timedelta(hours=5),
        left_at=now - datetime.timedelta(hours=4)
    )
    
    db.add(p1)
    db.add(p2)
    db.add(p3)
    db.commit()
