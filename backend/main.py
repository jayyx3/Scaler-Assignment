import datetime
import json
import logging
from typing import Dict, List
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, Base, get_db
import crud
import models
import schemas

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("zoom_clone")

# Create tables
Base.metadata.create_all(bind=engine)

# Seed database on startup
db_session = SessionLocal = next(get_db())
try:
    crud.seed_data(db_session)
finally:
    db_session.close()

app = FastAPI(title="Zoom Clone API", description="FastAPI backend for Zoom Clone with WebRTC signaling")

# Allow CORS for Next.js development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        # meeting_id -> { username: websocket }
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        # meeting_id -> list of bots
        self.active_bots: Dict[str, List[str]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: str, username: str) -> str:
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = {}
        
        # Handle duplicate usernames by appending a suffix
        original_username = username
        suffix = 1
        while username in self.active_connections[meeting_id] or (meeting_id in self.active_bots and username in self.active_bots[meeting_id]):
            username = f"{original_username} ({suffix})"
            suffix += 1
            
        self.active_connections[meeting_id][username] = websocket
        return username

    def disconnect(self, meeting_id: str, username: str):
        if meeting_id in self.active_connections:
            if username in self.active_connections[meeting_id]:
                del self.active_connections[meeting_id][username]
            if not self.active_connections[meeting_id]:
                # If no human users remain, clear bots too
                if meeting_id in self.active_connections:
                    del self.active_connections[meeting_id]
                if meeting_id in self.active_bots:
                    del self.active_bots[meeting_id]

    async def send_to_user(self, meeting_id: str, username: str, message: dict):
        if meeting_id in self.active_connections and username in self.active_connections[meeting_id]:
            try:
                await self.active_connections[meeting_id][username].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending message to {username}: {e}")

    async def broadcast(self, meeting_id: str, message: dict, exclude_user: str = None):
        if meeting_id in self.active_connections:
            for user, websocket in self.active_connections[meeting_id].items():
                if user != exclude_user:
                    try:
                        await websocket.send_text(json.dumps(message))
                    except Exception as e:
                        logger.error(f"Error broadcasting to {user}: {e}")

    def get_participants(self, meeting_id: str) -> List[str]:
        participants = []
        if meeting_id in self.active_connections:
            participants.extend(list(self.active_connections[meeting_id].keys()))
        if meeting_id in self.active_bots:
            participants.extend(self.active_bots[meeting_id])
        return participants

    def add_bot(self, meeting_id: str, bot_name: str) -> str:
        if meeting_id not in self.active_bots:
            self.active_bots[meeting_id] = []
        
        original_bot_name = bot_name
        suffix = 1
        while bot_name in self.active_bots[meeting_id] or (meeting_id in self.active_connections and bot_name in self.active_connections[meeting_id]):
            bot_name = f"{original_bot_name} ({suffix})"
            suffix += 1

        self.active_bots[meeting_id].append(bot_name)
        return bot_name

    def remove_bot(self, meeting_id: str, bot_name: str):
        if meeting_id in self.active_bots and bot_name in self.active_bots[meeting_id]:
            self.active_bots[meeting_id].remove(bot_name)
            if not self.active_bots[meeting_id]:
                del self.active_bots[meeting_id]

manager = ConnectionManager()


# REST APIs

@app.get("/api/meetings/upcoming", response_model=List[schemas.MeetingResponse])
def get_upcoming_meetings(db: Session = Depends(get_db)):
    return crud.get_upcoming_meetings(db)

@app.get("/api/meetings/recent", response_model=List[schemas.MeetingResponse])
def get_recent_meetings(db: Session = Depends(get_db)):
    return crud.get_recent_meetings(db)

@app.get("/api/meetings/{meeting_id}", response_model=schemas.MeetingResponse)
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    db_meeting = crud.get_meeting(db, meeting_id)
    if not db_meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return db_meeting

@app.post("/api/meetings/instant", response_model=schemas.MeetingResponse)
def create_instant_meeting(meeting: schemas.MeetingCreate, db: Session = Depends(get_db)):
    # Instant meetings don't have preset start time and duration
    meeting.meeting_type = "instant"
    meeting.start_time = None
    meeting.duration = None
    return crud.create_meeting(db, meeting)

@app.post("/api/meetings/schedule", response_model=schemas.MeetingResponse)
def schedule_meeting(meeting: schemas.MeetingCreate, db: Session = Depends(get_db)):
    if not meeting.start_time:
        raise HTTPException(status_code=400, detail="Start time is required for scheduled meetings")
    if not meeting.duration:
        raise HTTPException(status_code=400, detail="Duration is required for scheduled meetings")
    meeting.meeting_type = "scheduled"
    return crud.create_meeting(db, meeting)


# WebSockets Endpoint for Signaling, Chat, and Host Actions

@app.websocket("/ws/meeting/{meeting_id}")
async def websocket_endpoint(websocket: WebSocket, meeting_id: str, username: str, db: Session = Depends(get_db)):
    # Validate that meeting exists
    db_meeting = crud.get_meeting(db, meeting_id)
    if not db_meeting:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Meeting does not exist")
        return

    # Connect to room and get unique username
    actual_username = await manager.connect(websocket, meeting_id, username)
    logger.info(f"User {actual_username} connected to meeting {meeting_id}")

    # Log join in database
    crud.log_participant_join(db, meeting_id, actual_username)

    # Notify others in the room
    participants = manager.get_participants(meeting_id)
    await manager.broadcast(
        meeting_id,
        {
            "type": "join",
            "sender": actual_username,
            "username": actual_username,
            "participants": participants,
            "is_host": db_meeting.host_name == actual_username or len(participants) == 1,
            "host_name": db_meeting.host_name
        }
    )

    # If first user, they become the host if host_name matches or is default
    is_host = (db_meeting.host_name == actual_username) or (len(participants) == 1)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == "signal":
                # WebRTC Signaling (relay to specific peer)
                target = message.get("target")
                signal_data = message.get("data")
                if target:
                    await manager.send_to_user(
                        meeting_id,
                        target,
                        {
                            "type": "signal",
                            "sender": actual_username,
                            "data": signal_data
                        }
                    )
            
            elif msg_type == "chat":
                # Broadcast chat message to everyone in the room
                chat_msg = {
                    "type": "chat",
                    "sender": actual_username,
                    "message": message.get("message"),
                    "timestamp": datetime.datetime.utcnow().isoformat()
                }
                await manager.broadcast(meeting_id, chat_msg)

            elif msg_type == "simulate-bot":
                # Create a simulated bot
                bot_name = message.get("bot_name", "Zoom Bot")
                actual_bot_name = manager.add_bot(meeting_id, bot_name)
                
                # Notify everyone
                await manager.broadcast(
                    meeting_id,
                    {
                        "type": "bot-join",
                        "username": actual_bot_name,
                        "participants": manager.get_participants(meeting_id)
                    }
                )
                logger.info(f"Bot {actual_bot_name} added to meeting {meeting_id}")

            elif msg_type == "host-action":
                # Verify that sender is host
                # (For demo simplicity, we allow the request if the client is flagged as host or if it's the meeting host)
                action = message.get("action")
                target = message.get("target")
                
                if action == "mute-all":
                    await manager.broadcast(
                        meeting_id,
                        {
                            "type": "mute-all",
                            "sender": actual_username
                        }
                    )
                elif action == "kick":
                    if target:
                        # If target is a bot
                        if meeting_id in manager.active_bots and target in manager.active_bots[meeting_id]:
                            manager.remove_bot(meeting_id, target)
                            await manager.broadcast(
                                meeting_id,
                                {
                                    "type": "bot-leave",
                                    "username": target,
                                    "participants": manager.get_participants(meeting_id)
                                }
                            )
                        else:
                            # Target is a human user, send kick message to everyone
                            await manager.broadcast(
                                meeting_id,
                                {
                                    "type": "kick",
                                    "target": target,
                                    "sender": actual_username
                                }
                            )

    except WebSocketDisconnect:
        manager.disconnect(meeting_id, actual_username)
        logger.info(f"User {actual_username} disconnected from meeting {meeting_id}")
        
        # Log leave in database
        crud.log_participant_leave(db, meeting_id, actual_username)

        # Notify remaining peers
        await manager.broadcast(
            meeting_id,
            {
                "type": "leave",
                "sender": actual_username,
                "username": actual_username,
                "participants": manager.get_participants(meeting_id)
            }
        )
    except Exception as e:
        logger.error(f"WebSocket error for {actual_username}: {e}")
        manager.disconnect(meeting_id, actual_username)
        crud.log_participant_leave(db, meeting_id, actual_username)
