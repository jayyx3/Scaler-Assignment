"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import styles from "../meeting.module.css";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Automatically derive the WebSocket URL from the backend URL if not explicitly provided
const getWsUrl = () => {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  return backendUrl.replace(/^http/, "ws");
};
const wsUrl = getWsUrl();

interface ChatMessage {
  sender: string;
  message: string;
  timestamp: string;
}

interface PeerInfo {
  username: string;
  stream: MediaStream;
  isMuted: boolean;
  connection: RTCPeerConnection;
}

interface BotInfo {
  username: string;
  isMuted: boolean;
  color: string;
}

export default function MeetingRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const meetingId = params.id as string;
  const initialUsername = searchParams.get("username") || "";

  // Page States
  const [username, setUsername] = useState(initialUsername);
  const [hasJoined, setHasJoined] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("Zoom Meeting");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // Video & Stream State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // WebRTC & Signaling State
  const [participants, setParticipants] = useState<string[]>([]);
  const [peers, setPeers] = useState<Dict<PeerInfo>>({});
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [isHost, setIsHost] = useState(false);

  // UI Panels
  const [activeSidebar, setActiveSidebar] = useState<"participants" | "chat" | "zoom-ai" | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Interactive Zoom feature states
  const [showSecurityDropdown, setShowSecurityDropdown] = useState(false);
  const [showReactionsPopup, setShowReactionsPopup] = useState(false);
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [meetingLocked, setMeetingLocked] = useState(false);
  const [muteOnEntry, setMuteOnEntry] = useState(false);
  const [activeReactions, setActiveReactions] = useState<Array<{ id: number; username: string; emoji: string }>>([]);
  const [zoomAiMessages, setZoomAiMessages] = useState<Array<{ sender: string; text: string }>>([
    { sender: "AI", text: "Hello! I am your Zoom AI Companion. How can I help you today?" }
  ]);
  const [zoomAiInput, setZoomAiInput] = useState("");


  // Visual feature simulation states
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [currentCaption, setCurrentCaption] = useState("");
  const [stopIncomingVideo, setStopIncomingVideo] = useState(false);
  const [showBreakoutModal, setShowBreakoutModal] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  // Refs for tracking mutable connections in event listeners
  const wsRef = useRef<WebSocket | null>(null);
  const peersRef = useRef<{ [key: string]: PeerInfo }>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const whiteboardCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Bot list color pool
  const botColors = ["#f26d21", "#12b76a", "#7a5af8", "#ee46bc", "#f04438"];

  // Helper type interface for dictionaries
  type Dict<T> = { [key: string]: T };

  // Simulated Captions logic
  const simulatedCaptions = [
    "Welcome to the team sync, let's review the active items.",
    "The new UI elements match the design specifications perfectly.",
    "Let's make sure the AI Companion is enabled for summary reports.",
    "Could someone share the whiteboard layout?",
    "We should verify the responsiveness of the video grid.",
    "Let's proceed with the verification plan next."
  ];

  useEffect(() => {
    if (!captionsEnabled) return;
    let idx = 0;
    setCurrentCaption(simulatedCaptions[0]);
    const timer = setInterval(() => {
      idx = (idx + 1) % simulatedCaptions.length;
      setCurrentCaption(simulatedCaptions[idx]);
    }, 4000);
    return () => clearInterval(timer);
  }, [captionsEnabled]);

  // Whiteboard Canvas initialization
  useEffect(() => {
    if (showWhiteboard && whiteboardCanvasRef.current) {
      const canvas = whiteboardCanvasRef.current;
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 500;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#0b5cff";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
      }
    }
  }, [showWhiteboard]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = whiteboardCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = whiteboardCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // 1. Check meeting existence on mount
  useEffect(() => {
    const activeRef = { current: true };
    let socketInstance: WebSocket | null = null;
    let streamInstance: MediaStream | null = null;

    const verifyMeeting = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/meetings/${meetingId}`);
        if (!activeRef.current) return;
        if (res.ok) {
          const data = await res.json();
          setMeetingTitle(data.title);
          if (initialUsername) {
            // Auto join if username query parameter exists
            const result = await joinMeeting(initialUsername, activeRef);
            if (result) {
              socketInstance = result.socket;
              streamInstance = result.stream;
            }
          } else {
            setLoading(false);
          }
        } else {
          setErrorMsg("Meeting ID not found. Return to dashboard.");
          setLoading(false);
        }
      } catch (err) {
        if (activeRef.current) {
          setErrorMsg("Failed to reach database server.");
          setLoading(false);
        }
      }
    };
    verifyMeeting();

    return () => {
      activeRef.current = false;
      
      // Close the specific socket and stream created in this effect run
      if (socketInstance) {
        socketInstance.close();
      } else if (wsRef.current) {
        wsRef.current.close();
      }
      
      if (streamInstance) {
        streamInstance.getTracks().forEach((track) => track.stop());
      } else if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      
      // Close all peer connections
      Object.keys(peersRef.current).forEach((name) => {
        const peer = peersRef.current[name];
        if (peer) {
          peer.connection.close();
          delete peersRef.current[name];
        }
      });
      setPeers({});
    };
  }, [meetingId, initialUsername]);


  // 2. Setup Local Media Stream
  const initLocalStream = async (): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.warn("Camera/microphone permission denied or hardware unavailable. Using canvas animated stream...", err);
      
      // Fallback: Create dynamic animated canvas stream so the app always functions
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      
      let angle = 0;
      const intervalId = setInterval(() => {
        if (ctx) {
          ctx.fillStyle = "#1c1e22";
          ctx.fillRect(0, 0, 640, 480);
          // Drawing active placeholder
          ctx.fillStyle = "#0b5cff";
          ctx.beginPath();
          ctx.arc(320 + Math.cos(angle) * 120, 240 + Math.sin(angle) * 80, 50, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 24px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("Simulated Video Stream", 320, 240);
          angle += 0.05;
        }
      }, 50);

      // Stop canvas loop on stream destroy
      const canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : new MediaStream();
      
      // Monkey patch cleanup
      const originalGetTracks = canvasStream.getTracks;
      canvasStream.getTracks = function() {
        const tracks = originalGetTracks.call(canvasStream);
        tracks.forEach((t: any) => {
          const originalStop = t.stop;
          t.stop = function() {
            clearInterval(intervalId);
            if (originalStop) originalStop.call(t);
          };
        });
        return tracks;
      };

      setLocalStream(canvasStream);
      localStreamRef.current = canvasStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = canvasStream;
      }
      return canvasStream;
    }
  };

  // Bind local stream to local video element once joined
  useEffect(() => {
    if (hasJoined && localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [hasJoined, localStream]);

  // 3. Initiate Connection & WebSocket
  const joinMeeting = async (selectedName: string, activeRef?: { current: boolean }) => {
    if (!selectedName.trim()) return null;
    setLoading(true);
    setUsername(selectedName);

    // Get webcam tracks
    const stream = await initLocalStream();

    if (activeRef && !activeRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }

    // Connect to WebSocket signaling server
    const socket = new WebSocket(`${wsUrl}/ws/meeting/${meetingId}?username=${encodeURIComponent(selectedName)}`);
    wsRef.current = socket;

    socket.onopen = () => {
      if (activeRef && !activeRef.current) {
        socket.close();
        return;
      }
      setHasJoined(true);
      setLoading(false);
    };

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      const { type, sender, data, participants: roomParts, is_host, host_name, is_bot, username: botName, target, action } = message;

      if (type === "join") {
        setParticipants(roomParts);
        
        // Check if I am the host
        if (sender === selectedName) {
          setIsHost(is_host);
        }

        // Create WebRTC connections with existing participants (initiator pattern)
        if (sender !== selectedName && !is_bot) {
          await initiatePeerConnection(sender, stream, socket);
        }
      } 
      
      else if (type === "leave") {
        setParticipants(roomParts);
        closePeerConnection(sender);
      } 
      
      else if (type === "signal") {
        await handleSignalingMessage(sender, data, socket);
      } 
      
      else if (type === "chat") {
        const msgText = message.message;
        if (msgText.startsWith("__REACTION__")) {
          const emoji = msgText.replace("__REACTION__", "");
          showFloatingEmoji(sender, emoji);
        } else if (msgText === "__CHAT_DISABLE__") {
          setChatEnabled(false);
          setChatMessages((prev) => [
            ...prev,
            { sender: "System", message: "Chat disabled by host", timestamp: new Date().toISOString() }
          ]);
        } else if (msgText === "__CHAT_ENABLE__") {
          setChatEnabled(true);
          setChatMessages((prev) => [
            ...prev,
            { sender: "System", message: "Chat enabled by host", timestamp: new Date().toISOString() }
          ]);
        } else {
          setChatMessages((prev) => [...prev, message]);
        }
      } 
      
      else if (type === "bot-join") {
        setParticipants(roomParts);
        const randomColor = botColors[Math.floor(Math.random() * botColors.length)];
        setBots((prev) => [...prev, { username: botName, isMuted: false, color: randomColor }]);
      } 
      
      else if (type === "bot-leave") {
        setParticipants(roomParts);
        setBots((prev) => prev.filter((b) => b.username !== botName));
      } 
      
      else if (type === "mute-all") {
        // Toggle local mic mute
        muteLocal(true);
      } 
      
      else if (type === "kick") {
        if (target === selectedName) {
          alert("You have been removed from the meeting by the host.");
          leaveMeeting();
          router.push("/");
        }
      }
    };

    socket.onerror = (err) => {
      console.error("WebSocket Error:", err);
      setErrorMsg("Connection to signalling server lost.");
      setLoading(false);
    };

    socket.onclose = () => {
      setHasJoined(false);
    };

    return { socket, stream };
  };

  // 4. WebRTC Peer Connection Handlers
  const initiatePeerConnection = async (targetUser: string, stream: MediaStream, socket: WebSocket) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    // Add local tracks to peer
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Handle remote tracks
    pc.ontrack = (event) => {
      setPeers((prev) => ({
        ...prev,
        [targetUser]: {
          username: targetUser,
          stream: event.streams[0],
          isMuted: false,
          connection: pc
        }
      }));
    };

    // Send ICE candidate
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "signal",
            target: targetUser,
            data: {
              type: "ice-candidate",
              candidate: event.candidate
            }
          })
        );
      }
    };

    // Create SDP Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "signal",
          target: targetUser,
          data: {
            type: "offer",
            sdp: offer.sdp
          }
        })
      );
    }

    // Cache peer
    peersRef.current[targetUser] = {
      username: targetUser,
      stream: new MediaStream(),
      isMuted: false,
      connection: pc
    };
  };

  const handleSignalingMessage = async (senderUser: string, data: any, socket: WebSocket) => {
    let peer = peersRef.current[senderUser];

    // If peer connection doesn't exist yet, create it (recipient pattern)
    if (!peer) {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.ontrack = (event) => {
        setPeers((prev) => ({
          ...prev,
          [senderUser]: {
            username: senderUser,
            stream: event.streams[0],
            isMuted: false,
            connection: pc
          }
        }));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "signal",
              target: senderUser,
              data: {
                type: "ice-candidate",
                candidate: event.candidate
              }
            })
          );
        }
      };

      peer = {
        username: senderUser,
        stream: new MediaStream(),
        isMuted: false,
        connection: pc
      };
      peersRef.current[senderUser] = peer;
    }

    // Process Signal Offer/Answer/ICE
    const pc = peer.connection;

    if (data.type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "signal",
            target: senderUser,
            data: {
              type: "answer",
              sdp: answer.sdp
            }
          })
        );
      }
    } 
    
    else if (data.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
    } 
    
    else if (data.type === "ice-candidate") {
      if (data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    }
  };

  const closePeerConnection = (targetUser: string) => {
    const peer = peersRef.current[targetUser];
    if (peer) {
      peer.connection.close();
      delete peersRef.current[targetUser];
      setPeers((prev) => {
        const copy = { ...prev };
        delete copy[targetUser];
        return copy;
      });
    }
  };

  // 5. Controls Actions
  const muteLocal = (forceMute?: boolean) => {
    const nextMute = forceMute !== undefined ? forceMute : !isMuted;
    setIsMuted(nextMute);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMute;
      });
    }
  };

  const toggleVideo = () => {
    const nextVideoOff = !isVideoOff;
    setIsVideoOff(nextVideoOff);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !nextVideoOff;
      });
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setIsScreenSharing(true);

        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace track in peer connections
        Object.values(peersRef.current).forEach((p) => {
          const senders = p.connection.getSenders();
          const videoSender = senders.find((s) => s.track && s.track.kind === "video");
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          }
        });

        // Update local video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // Listen for screen sharing stop
        screenTrack.onended = () => {
          stopScreenSharing();
        };
      } catch (err) {
        console.error("Screen sharing failed:", err);
      }
    } else {
      stopScreenSharing();
    }
  };

  const stopScreenSharing = () => {
    setIsScreenSharing(false);
    if (localStreamRef.current) {
      const webcamTrack = localStreamRef.current.getVideoTracks()[0];
      
      Object.values(peersRef.current).forEach((p) => {
        const senders = p.connection.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === "video");
        if (videoSender && webcamTrack) {
          videoSender.replaceTrack(webcamTrack);
        }
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
  };

  // 6. Sidebar Interactions
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !wsRef.current) return;

    wsRef.current.send(
      JSON.stringify({
        type: "chat",
        message: chatInput.trim()
      })
    );
    setChatInput("");
  };

  const handleSimulateBot = () => {
    if (!wsRef.current) return;
    const names = ["Alex Rivera", "Sophia Patel", "Marcus Chen", "Emily Watson"];
    const randomName = names[Math.floor(Math.random() * names.length)];
    
    wsRef.current.send(
      JSON.stringify({
        type: "simulate-bot",
        bot_name: randomName
      })
    );
  };

  const handleMuteAll = () => {
    if (!wsRef.current || !isHost) return;
    wsRef.current.send(
      JSON.stringify({
        type: "host-action",
        action: "mute-all"
      })
    );
  };

  const handleKickParticipant = (targetName: string) => {
    if (!wsRef.current || !isHost) return;
    wsRef.current.send(
      JSON.stringify({
        type: "host-action",
        action: "kick",
        target: targetName
      })
    );
  };

  // Reactions & Recording functional controllers
  const showFloatingEmoji = (username: string, emoji: string) => {
    const id = Date.now() + Math.random();
    setActiveReactions((prev) => [...prev, { id, username, emoji }]);
    setTimeout(() => {
      setActiveReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2500);
  };

  const handleSendReaction = (emoji: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: "chat",
        message: `__REACTION__${emoji}`
      })
    );
    setShowReactionsPopup(false);
  };


  const handleToggleChatPermission = (allowChat: boolean) => {
    if (!wsRef.current || !isHost) return;
    wsRef.current.send(
      JSON.stringify({
        type: "chat",
        message: allowChat ? "__CHAT_ENABLE__" : "__CHAT_DISABLE__"
      })
    );
  };

  const leaveMeeting = () => {
    // Stop local camera/microphone
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close peer connections
    Object.keys(peersRef.current).forEach(closePeerConnection);

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
    }

    router.push("/");
  };

  // 7. Calculate Grid Layout Class
  const totalHumanPeers = Object.keys(peers).length;
  const totalBotPeers = bots.length;
  const totalGridItems = 1 + totalHumanPeers + totalBotPeers; // self + peers + bots

  const getGridClass = () => {
    if (totalGridItems === 1) return styles.grid1;
    if (totalGridItems === 2) return styles.grid2;
    if (totalGridItems <= 4) return styles.grid3Or4;
    return styles.grid5OrMore;
  };

  // Render Pre-join screen or loading
  if (loading) {
    return (
      <div className={styles.joinPromptContainer}>
        <div style={{ textAlign: "center" }}>
          <h2>Loading Meeting Space...</h2>
          <p style={{ marginTop: "12px", color: "var(--zoom-text-muted)" }}>Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className={styles.joinPromptContainer}>
        <div className={styles.joinPromptCard}>
          <h2 className={styles.joinPromptTitle} style={{ color: "var(--zoom-danger)" }}>Error</h2>
          <p style={{ textAlign: "center", color: "var(--zoom-text-muted)" }}>{errorMsg}</p>
          <button className={styles.btnPrimary} onClick={() => router.push("/")}>Go to Dashboard</button>
        </div>
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <div className={styles.joinPromptContainer}>
        <div className={styles.joinPromptCard}>
          <h2 className={styles.joinPromptTitle}>Join meeting: {meetingTitle}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              joinMeeting(username);
            }}
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label htmlFor="join-name-input" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Your Display Name</label>
              <input
                id="join-name-input"
                type="text"
                placeholder="Example: Sarah Connor"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button type="button" className={styles.btnSecondary} onClick={() => router.push("/")}>Cancel</button>
              <button type="submit" className={styles.btnPrimary} id="enter-meeting-btn">Join Meeting</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Render main meeting layout
  return (
    <div className={styles.container}>
      {/* Top Header */}
      <header className={styles.meetingHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.zoomBrand}>
            <span className={styles.zoomLogoText}>zoom</span>
            <span className={styles.zoomWorkplaceText}>Workplace</span>
          </div>
          {/* Info Check Shield with dropdown tooltip capability */}
          <div 
            className={styles.securityStatusShield} 
            title="Meeting details (Click to copy ID)"
            onClick={() => {
              navigator.clipboard.writeText(meetingId);
              alert(`Meeting ID: ${meetingId} copied to clipboard!`);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="#0f9d58" stroke="#0f9d58" strokeWidth="2"/>
              <path d="M9 11l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.viewLayoutBtn} onClick={() => alert(`Layout Grid: ${totalGridItems} participants connected`)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" />
              <rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" />
              <rect x="3" y="16" width="7" height="5" />
            </svg>
            <span>View</span>
          </button>
          <div className={styles.headerProfilePic} title={username}>
            {username.slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Video feeds grid and Side panel */}
      <div className={styles.mainLayout}>
        {/* Videos Area */}
        <main className={styles.videoArea} style={{ position: "relative" }}>
          {isScreenSharing && (
            <div className={styles.screenShareBanner}>
              <div className={styles.screenShareBannerLeft}>
                <span>You're screen sharing</span>
                <button className={styles.bannerMoreBtn}>•••</button>
              </div>
              <div className={styles.bannerDivider} />
              <button className={styles.bannerPauseBtn} title="Pause Share">
                <span className={styles.bannerPauseIcon}>||</span>
              </button>
              <button className={styles.bannerStopBtn} onClick={stopScreenSharing}>
                <span className={styles.bannerStopSquare}>■</span>
                Stop Share
              </button>
            </div>
          )}

          {isScreenSharing && (
            <button className={styles.annotateFloatingBtn} title="Annotate / Whiteboard tools">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          )}

          {showWhiteboard && (
            <div className={styles.whiteboardContainer}>
              <div className={styles.whiteboardHeader}>
                <span className={styles.whiteboardTitle}>Zoom Whiteboard - Shared Board</span>
                <button 
                  className={styles.whiteboardCloseBtn}
                  onClick={() => setShowWhiteboard(false)}
                >
                  Close Whiteboard
                </button>
              </div>
              <div className={styles.whiteboardCanvasArea}>
                <canvas 
                  ref={whiteboardCanvasRef}
                  className={styles.whiteboardCanvas}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                />
              </div>
              <div className={styles.whiteboardFooter}>
                <span>Draw on the whiteboard with your mouse. All participants can see this.</span>
              </div>
            </div>
          )}

          {captionsEnabled && (
            <div className={styles.captionsContainer}>
              <div className={styles.captionSpeechBubble}>
                <span className={styles.captionSpeaker}>Sarah Connor:</span>
                <span className={styles.captionText}>{currentCaption || "We are discussing the Zoom Workplace design integrations."}</span>
              </div>
            </div>
          )}

          <div className={`${styles.videoGrid} ${getGridClass()}`} id="video-grid">
            {/* Local Video wrapper */}
            <div className={`${styles.videoWrapper} ${!isMuted && !isVideoOff ? styles.videoWrapperActive : ""}`} id="local-video-container">
              {/* Floating Reactions */}
              <div className={styles.reactionContainer}>
                {activeReactions.filter(r => r.username === username).map(r => (
                  <div key={r.id} className={styles.reactionItem}>
                    <span>{r.emoji}</span>
                  </div>
                ))}
              </div>
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className={styles.videoElement}
                style={{ display: isVideoOff ? "none" : "block" }}
              />
              {isVideoOff && (
                <div className={styles.videoPlaceholder}>
                  <div className={styles.placeholderAvatar}>
                    {username.slice(0, 2).toUpperCase()}
                  </div>
                </div>
              )}
              
              {/* Overlay Pill with Name & Mic Status */}
              <div className={styles.participantOverlayPill}>
                {isMuted ? (
                  <svg className={styles.pillMicIconMuted} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  </svg>
                ) : (
                  <svg className={styles.pillMicIconActive} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  </svg>
                )}
                <span>{username}</span>
              </div>
            </div>

            {/* Remote Peer Video wrapper */}
            {Object.values(peers).map((peer) => (
              <div 
                className={`${styles.videoWrapper} ${styles.videoWrapperActive}`} 
                key={peer.username}
                id={`peer-container-${peer.username}`}
              >
                {/* Floating Reactions */}
                <div className={styles.reactionContainer}>
                  {activeReactions.filter(r => r.username === peer.username).map(r => (
                    <div key={r.id} className={styles.reactionItem}>
                      <span>{r.emoji}</span>
                    </div>
                  ))}
                </div>
                {!stopIncomingVideo ? (
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el) el.srcObject = peer.stream;
                    }}
                    className={`${styles.videoElement} ${styles.remoteVideo}`}
                  />
                ) : (
                  <div className={styles.videoPlaceholder}>
                    <div className={styles.placeholderAvatar}>
                      {peer.username.slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                )}
                
                {/* Overlay Pill with Name & Mic Status */}
                <div className={styles.participantOverlayPill}>
                  {peer.isMuted ? (
                    <svg className={styles.pillMicIconMuted} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    </svg>
                  ) : (
                    <svg className={styles.pillMicIconActive} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    </svg>
                  )}
                  <span>{peer.username}</span>
                </div>
              </div>
            ))}

            {/* Simulated Bots video wrappers */}
            {bots.map((bot) => (
              <div className={styles.videoWrapper} key={bot.username} id={`bot-container-${bot.username}`}>
                {/* Floating Reactions */}
                <div className={styles.reactionContainer}>
                  {activeReactions.filter(r => r.username === bot.username).map(r => (
                    <div key={r.id} className={styles.reactionItem}>
                      <span>{r.emoji}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.videoPlaceholder}>
                  <div 
                    className={styles.placeholderAvatar} 
                    style={{ backgroundColor: bot.color, animation: "pulse 2s infinite" }}
                  >
                    {bot.username.slice(0, 2).toUpperCase()}
                  </div>
                </div>
                
                {/* Overlay Pill with Name & Mic Status */}
                <div className={styles.participantOverlayPill}>
                  {bot.isMuted ? (
                    <svg className={styles.pillMicIconMuted} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    </svg>
                  ) : (
                    <svg className={styles.pillMicIconActive} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    </svg>
                  )}
                  <span>{bot.username}</span>
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* Side Panel (Participants or Chat) */}
        {activeSidebar && (
          <aside className={styles.sidePanel} id="side-panel">
            {activeSidebar === "participants" ? (
              // Participants Panel
              <>
                <div className={styles.sidePanelHeader}>
                  <div style={{ width: "24px" }} />
                  <h2 className={styles.sidePanelTitle}>
                    Participants ({1 + participants.filter(name => name !== username).length + bots.length})
                  </h2>
                  <div className={styles.sideHeaderRightActions}>
                    <button className={styles.sideHeaderBtn} title="Pop out">↗</button>
                    <button className={styles.sideHeaderBtn} onClick={() => setActiveSidebar(null)}>&times;</button>
                  </div>
                </div>
                
                <div className={styles.sidePanelContent}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} id="participants-list">
                    {/* Local User */}
                    <div className={styles.participantItem}>
                      <div className={styles.participantNameWrapper}>
                        <div className={styles.avatarMiniSquare}>{username.slice(0, 2).toUpperCase()}</div>
                        <span className={styles.participantListName}>{username} (Host, me)</span>
                      </div>
                      <div className={styles.sideParticipantStatus}>
                        {isMuted ? (
                          <svg className={styles.statusMicMuted} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="1" y1="1" x2="23" y2="23" />
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                          </svg>
                        ) : (
                          <svg className={styles.statusMicActive} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                          </svg>
                        )}
                        {isVideoOff ? (
                          <svg className={styles.statusVideoMuted} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg className={styles.statusVideoActive} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M23 7l-7 5 7 5V7z" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Remote Human Users */}
                    {participants.filter(name => name !== username && !bots.some(b => b.username === name)).map((name) => (
                      <div className={styles.participantItem} key={name}>
                        <div className={styles.participantNameWrapper}>
                          <div className={styles.avatarMiniSquare}>{name.slice(0, 2).toUpperCase()}</div>
                          <span className={styles.participantListName}>{name}</span>
                        </div>
                        <div className={styles.sideParticipantStatus}>
                          <svg className={styles.statusMicMuted} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="1" y1="1" x2="23" y2="23" />
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                          </svg>
                          <svg className={styles.statusVideoMuted} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                          {isHost && (
                            <button 
                              className={styles.kickBtnMini}
                              onClick={() => handleKickParticipant(name)}
                              title="Kick participant"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Simulated Bots */}
                    {bots.map((bot) => (
                      <div className={styles.participantItem} key={bot.username}>
                        <div className={styles.participantNameWrapper}>
                          <div className={styles.avatarMiniSquare} style={{ backgroundColor: bot.color }}>
                            {bot.username.slice(0, 2).toUpperCase()}
                          </div>
                          <span className={styles.participantListName}>{bot.username} (Bot)</span>
                        </div>
                        <div className={styles.sideParticipantStatus}>
                          <svg className={styles.statusMicMuted} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="1" y1="1" x2="23" y2="23" />
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                          </svg>
                          <svg className={styles.statusVideoMuted} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                          {isHost && (
                            <button 
                              className={styles.kickBtnMini}
                              onClick={() => handleKickParticipant(bot.username)}
                              title="Remove bot"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.participantsPanelFooter}>
                  <button 
                    className={styles.pillBtnSecondary}
                    onClick={() => {
                      const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
                      navigator.clipboard.writeText(`${baseUrl}/meeting/${meetingId}`);
                      alert("Invite link copied!");
                    }}
                  >
                    Invite
                  </button>
                  {isHost && (
                    <button className={styles.pillBtnSecondary} onClick={handleMuteAll}>
                      Mute All
                    </button>
                  )}
                  <button className={styles.pillBtnSecondary} onClick={() => alert("More participant options can be set via Host Tools.")}>
                    More
                  </button>
                </div>
              </>
            ) : activeSidebar === "chat" ? (
              // Chat Panel
              <>
                <div className={styles.sidePanelHeader}>
                  <span className={styles.chatHeaderIcon}>💬</span>
                  <h2 className={styles.sidePanelTitle} style={{ flex: 1, textAlign: "center", marginLeft: "-24px" }}>
                    {username}'s Zoom Meeting
                  </h2>
                  <div className={styles.sideHeaderRightActions}>
                    <button className={styles.sideHeaderBtn} title="Pop out">↗</button>
                    <button className={styles.sideHeaderBtn} onClick={() => setActiveSidebar(null)}>&times;</button>
                  </div>
                </div>

                {/* Sub-text disclaimer notice */}
                <div className={styles.chatNoticeText}>
                  Messages addressed to "Meeting Group Chat" will also appear in the meeting group chat in Team Chat
                </div>

                <div className={styles.sidePanelContent} style={{ justifyContent: "space-between", paddingTop: "0" }}>
                  <div className={styles.chatMessages} id="chat-messages-container">
                    {chatMessages.map((msg, index) => {
                      const isSelf = msg.sender === username;
                      return (
                        <div 
                          className={`${styles.chatMessage} ${isSelf ? styles.chatMessageSelf : ""}`} 
                          key={index}
                        >
                          <div className={styles.msgHeader}>
                            <span>{msg.sender}</span>
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </span>
                          </div>
                          <p className={styles.msgText}>{msg.message}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Input Container */}
                  <div className={styles.chatInputContainer}>
                    <div className={styles.chatVisibilityPrompt}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "4px" }}>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                      Who can see your messages?
                    </div>
                    <div className={styles.chatRecipientRow}>
                      <span>to:</span>
                      <span className={styles.chatRecipientBadge}>Meeting Group Chat</span>
                    </div>

                    <form onSubmit={handleSendMessage} className={styles.chatInputForm}>
                      <textarea
                        className={styles.chatTextarea}
                        placeholder="Type message here ..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        id="chat-text-input"
                        disabled={!chatEnabled && !isHost}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage(e);
                          }
                        }}
                      />
                      <div className={styles.chatInputToolbar}>
                        <div className={styles.toolbarLeftIcons}>
                          <button type="button" className={styles.toolbarIconBtn} title="Format text">✎</button>
                          <button type="button" className={styles.toolbarIconBtn} title="Add file">📎</button>
                          <button type="button" className={styles.toolbarIconBtn} title="Add emoji">☺</button>
                          <button type="button" className={styles.toolbarIconBtn} title="More options">•••</button>
                        </div>
                        <button 
                          type="submit" 
                          className={`${styles.chatSendBtn} ${chatInput.trim() ? styles.chatSendBtnActive : ""}`}
                          disabled={!chatInput.trim() || (!chatEnabled && !isHost)}
                          id="send-chat-btn"
                          title="Send message"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </>
            ) : (
              // Zoom AI Companion Panel
              <div className={styles.zoomAiPanel}>
                {/* Header */}
                <div className={styles.zoomAiHeader}>
                  <div className={styles.zoomAiHeaderLeft}>
                    <button className={styles.zoomAiUtilityIcon} title="AI settings">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                      </svg>
                    </button>
                    <button className={styles.zoomAiUtilityIcon} title="AI notifications">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                    </button>
                  </div>
                  <div className={styles.zoomAiHeaderRight}>
                    <button className={styles.sideHeaderBtn} title="Pop out">↗</button>
                    <button className={styles.sideHeaderBtn} onClick={() => setActiveSidebar(null)}>&times;</button>
                  </div>
                </div>

                {/* Stop Button */}
                <div className={styles.zoomAiStopRow}>
                  <button className={styles.stopZoomAiBtn} onClick={() => setActiveSidebar(null)}>
                    Stop Zoom AI
                  </button>
                </div>

                {/* Main Content */}
                <div className={styles.zoomAiContent}>
                  {zoomAiMessages.length <= 1 ? (
                    <div className={styles.zoomAiWelcome}>
                      {/* Logo star sparkles */}
                      <div className={styles.zoomAiLogoStar}>
                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2L15.3 8.7L22 12L15.3 15.3L12 22L8.7 15.3L2 12L8.7 8.7L12 2Z" fill="url(#sparkleGrad)" />
                          <path d="M19 3L19.7 4.8L21.5 5.5L19.7 6.2L19 8L18.3 6.2L16.5 5.5L18.3 4.8L19 3Z" fill="url(#sparkleGrad)" opacity="0.8" />
                          <defs>
                            <linearGradient id="sparkleGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                              <stop stopColor="#6366f1" />
                              <stop offset="0.5" stopColor="#3b82f6" />
                              <stop offset="1" stopColor="#60a5fa" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>
                      
                      {/* Grid helper buttons */}
                      <div className={styles.zoomAiGrid}>
                        <button 
                          className={styles.zoomAiGridBtn} 
                          onClick={() => {
                            setZoomAiMessages(prev => [
                              ...prev,
                              { sender: "User", text: "Catch me up" },
                              { sender: "AI", text: "So far in this meeting: Jay Joshi has joined and we are testing the new Zoom Workplace design including sidebars, More options, and reactions feedback circular triggers. No other participants have spoken yet." }
                            ]);
                          }}
                        >
                          Catch me up
                        </button>
                        <button 
                          className={styles.zoomAiGridBtn}
                          onClick={() => {
                            setZoomAiMessages(prev => [
                              ...prev,
                              { sender: "User", text: "Was my name mentioned" },
                              { sender: "AI", text: "No, your name has not been mentioned in active conversation yet." }
                            ]);
                          }}
                        >
                          Was my name mentioned
                        </button>
                        <button 
                          className={styles.zoomAiGridBtn}
                          onClick={() => {
                            setZoomAiMessages(prev => [
                              ...prev,
                              { sender: "User", text: "Are there any action items" },
                              { sender: "AI", text: "No action items have been decided so far. The meeting is running smoothly." }
                            ]);
                          }}
                        >
                          Are there any action items
                        </button>
                        <button 
                          className={styles.zoomAiGridBtn}
                          onClick={() => {
                            setZoomAiMessages(prev => [
                              ...prev,
                              { sender: "User", text: "What topics have been discussed" },
                              { sender: "AI", text: "Topics discussed include: Removing dashboard share screen card, redesigning the top bar Workplace logo layout, updating the bottom toolbar controls, and matching sidebar screens." }
                            ]);
                          }}
                        >
                          What topics have been discussed
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.zoomAiMessageHistory}>
                      {zoomAiMessages.map((msg, idx) => (
                        <div key={idx} className={msg.sender === "User" ? styles.aiMsgUser : styles.aiMsgCompanion}>
                          <div className={styles.aiMsgSenderName}>{msg.sender === "User" ? username : "Zoom AI Companion"}</div>
                          <div className={styles.aiMsgTextBubble}>{msg.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Input */}
                <div className={styles.zoomAiFooter}>
                  <form 
                    className={styles.zoomAiInputRow}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!zoomAiInput.trim()) return;
                      const text = zoomAiInput.trim();
                      setZoomAiMessages(prev => [...prev, { sender: "User", text }]);
                      setZoomAiInput("");
                      setTimeout(() => {
                        setZoomAiMessages(prev => [
                          ...prev,
                          { sender: "AI", text: `I've received your query about "${text}". As your Zoom AI Companion, I am summarizing these topics. Feel free to ask more!` }
                        ]);
                      }, 1000);
                    }}
                  >
                    <input 
                      type="text" 
                      placeholder="Write a message" 
                      value={zoomAiInput}
                      onChange={(e) => setZoomAiInput(e.target.value)}
                      className={styles.zoomAiInputField}
                    />
                    <button type="submit" className={styles.zoomAiSendBtn} disabled={!zoomAiInput.trim()}>
                      ↑
                    </button>
                  </form>
                  <div className={styles.zoomAiNotice}>
                    No other participants can see this conversation
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Bottom control bar */}
      <footer className={styles.toolbar} style={{ position: "relative" }}>
        {/* Host Tools Dropdown (Replaces Security Settings Dropdown) */}
        {showSecurityDropdown && (
          <div className={styles.securityDropdown} id="security-dropdown-panel">
            <label className={styles.securityItem}>
              <input 
                type="checkbox" 
                checked={meetingLocked} 
                onChange={(e) => {
                  setMeetingLocked(e.target.checked);
                  alert(e.target.checked ? "Meeting locked. No new users can join." : "Meeting unlocked.");
                }} 
              />
              Lock Meeting
            </label>
            <label className={styles.securityItem}>
              <input type="checkbox" defaultChecked />
              Enable waiting room
            </label>
            <label className={styles.securityItem}>
              <input type="checkbox" />
              Hide profile pictures
            </label>
            <div className={styles.securityDivider} />
            
            <div className={styles.securitySectionHeader}>Allow participants to:</div>
            
            <label className={styles.securityItemChecked}>
              <span>✓</span> Share Screen
            </label>
            <label className={styles.securityItemChecked} onClick={() => {
              setChatEnabled(!chatEnabled);
              handleToggleChatPermission(!chatEnabled);
            }}>
              <span style={{ color: chatEnabled ? "#22c55e" : "transparent" }}>✓</span> Chat
            </label>
            <label className={styles.securityItemChecked}>
              <span>✓</span> Rename Themselves
            </label>
            <label className={styles.securityItemChecked}>
              <span>✓</span> Unmute Themselves
            </label>
            <label className={styles.securityItemChecked}>
              <span>✓</span> Start Video
            </label>
            <label className={styles.securityItemChecked}>
              <span>✓</span> Share Whiteboards
            </label>
            <label className={styles.securityItemChecked}>
              <span>✓</span> Transcribe in My Notes
            </label>
            
            <div className={styles.securityDivider} />
            <button 
              className={styles.suspendBtn} 
              onClick={() => {
                alert("All participant activities suspended.");
                handleMuteAll();
              }}
            >
              Suspend Participant Activities
            </button>
          </div>
        )}

        {/* Reactions Popup */}
        {showReactionsPopup && (
          <div className={styles.reactionsPopup} id="reactions-dropdown-panel">
            {/* Emojis row */}
            <div className={styles.popupEmojisRow}>
              {['👏', '👍', '😂', '😮', '❤️', '🎉'].map((emoji) => (
                <button 
                  key={emoji} 
                  className={styles.emojiBtn} 
                  onClick={() => handleSendReaction(emoji)}
                  aria-label={`Send ${emoji} reaction`}
                >
                  {emoji}
                </button>
              ))}
              <button className={styles.emojiBtnMore} onClick={() => alert("More reactions coming soon!")}>•••</button>
            </div>
            {/* Circular Feedback Row */}
            <div className={styles.popupFeedbackRow}>
              <button className={styles.feedbackCircleBtn} style={{ backgroundColor: "#12b76a" }} onClick={() => handleSendReaction('✅')} title="Yes">
                <span className={styles.feedbackBtnText}>Yes</span>
                <span style={{ fontSize: "0.8rem", fontWeight: "bold" }}>✓</span>
              </button>
              <button className={styles.feedbackCircleBtn} style={{ backgroundColor: "#f04438" }} onClick={() => handleSendReaction('❌')} title="No">
                <span className={styles.feedbackBtnText}>No</span>
                <span style={{ fontSize: "0.8rem", fontWeight: "bold" }}>✕</span>
              </button>
              <button className={styles.feedbackCircleBtn} style={{ backgroundColor: "#2d3139" }} onClick={() => handleSendReaction('⏪')} title="Go Slower">
                <span>«</span>
              </button>
              <button className={styles.feedbackCircleBtn} style={{ backgroundColor: "#0b5cff" }} onClick={() => handleSendReaction('⏩')} title="Go Faster">
                <span>»</span>
              </button>
              <button className={styles.feedbackCircleBtn} style={{ backgroundColor: "#2d3139" }} onClick={() => handleSendReaction('☕')} title="I'm away">
                <span>☕</span>
              </button>
            </div>
            {/* Standard long pill options */}
            <button className={styles.raiseHandBtn} onClick={() => handleSendReaction('✋')}>
              ✋ Raise Hand
            </button>
            <button className={styles.raiseHandBtn} onClick={() => handleSendReaction('⏳')}>
              ⏳ Be right back
            </button>
          </div>
        )}

        {/* More Options Dropdown */}
        {showMoreDropdown && (
          <div className={styles.moreDropdown} id="more-dropdown-panel">
            <div 
              className={styles.moreDropdownItem}
              onClick={() => {
                setCaptionsEnabled(!captionsEnabled);
                setShowMoreDropdown(false);
              }}
            >
              <div className={styles.moreDropdownIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="2" ry="2"/>
                  <path d="M7 10h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H7"/>
                  <path d="M13 10h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2"/>
                </svg>
              </div>
              <span>{captionsEnabled ? "Hide Captions" : "Show Captions"}</span>
            </div>

            <div 
              className={styles.moreDropdownItem}
              onClick={() => {
                setShowBreakoutModal(true);
                setShowMoreDropdown(false);
              }}
            >
              <div className={styles.moreDropdownIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/>
                  <rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/>
                </svg>
              </div>
              <span>Breakout Rooms</span>
            </div>

            {/* Whiteboards with Hover Submenu */}
            <div className={`${styles.moreDropdownItem} ${styles.hasSubmenu}`}>
              <div className={styles.moreDropdownIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="14" rx="2" ry="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </div>
              <span>Whiteboards</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: "auto" }}>
                <path d="M9 5l7 7-7 7"/>
              </svg>
              
              {/* Submenu */}
              <div className={styles.submenu}>
                <div 
                  className={styles.moreDropdownItem}
                  onClick={() => {
                    alert("Opening existing whiteboards...");
                    setShowMoreDropdown(false);
                  }}
                >
                  <span>Existing whiteboards</span>
                </div>
                <div 
                  className={styles.moreDropdownItem}
                  onClick={() => {
                    setShowWhiteboard(true);
                    setShowMoreDropdown(false);
                  }}
                >
                  <span>New whiteboard</span>
                </div>
                <div 
                  className={styles.moreDropdownItem}
                  onClick={() => {
                    alert("Opening share whiteboard settings...");
                    setShowMoreDropdown(false);
                  }}
                >
                  <span>Share Whiteboards Options</span>
                </div>
              </div>
            </div>

            <div 
              className={styles.moreDropdownItem}
              onClick={() => {
                setShowSettingsModal(true);
                setShowMoreDropdown(false);
              }}
            >
              <div className={styles.moreDropdownIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </div>
              <span>Settings</span>
            </div>

            <div 
              className={styles.moreDropdownItem}
              onClick={() => {
                setStopIncomingVideo(!stopIncomingVideo);
                setShowMoreDropdown(false);
              }}
            >
              <div className={styles.moreDropdownIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10l-2.5-1.88"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </div>
              <span>{stopIncomingVideo ? "Resume Incoming Video" : "Stop Incoming Video"}</span>
            </div>

            <div 
              className={styles.moreDropdownItem}
              onClick={() => {
                handleSimulateBot();
                setShowMoreDropdown(false);
              }}
            >
              <div className={styles.moreDropdownIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <span>Simulate Participant Bot</span>
            </div>

            <div className={styles.moreDropdownDivider} />

            <div 
              className={styles.moreDropdownItem}
              onClick={() => {
                setCaptionsEnabled(false);
                setStopIncomingVideo(false);
                setMeetingLocked(false);
                setChatEnabled(true);
                setShowMoreDropdown(false);
                alert("Visual feeds and permissions reset to default.");
              }}
            >
              <div className={styles.moreDropdownIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </div>
              <span>Reset to default</span>
            </div>
          </div>
        )}

        {/* Breakout Rooms Modal */}
        {showBreakoutModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <h3>Create Breakout Rooms</h3>
                <button className={styles.closeModalBtn} onClick={() => setShowBreakoutModal(false)}>&times;</button>
              </div>
              <div className={styles.modalBody}>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: "#1f2937" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Create</span>
                    <input type="number" defaultValue="2" min="1" max="10" className={styles.modalInput} />
                    <span>breakout rooms</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer" }}>
                      <input type="radio" name="assign" defaultChecked /> Assign automatically
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer" }}>
                      <input type="radio" name="assign" /> Assign manually
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer" }}>
                      <input type="radio" name="assign" /> Let participants choose room
                    </label>
                  </div>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button className={styles.btnSecondary} onClick={() => setShowBreakoutModal(false)}>Cancel</button>
                <button className={styles.btnPrimary} onClick={() => {
                  alert("Breakout Rooms created! Simulating room session...");
                  setShowBreakoutModal(false);
                }}>Create</button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettingsModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard} style={{ width: "500px" }}>
              <div className={styles.modalHeader}>
                <h3>Settings</h3>
                <button className={styles.closeModalBtn} onClick={() => setShowSettingsModal(false)}>&times;</button>
              </div>
              <div className={styles.modalBody} style={{ padding: 0, display: "flex", height: "300px", color: "#1f2937" }}>
                <div style={{ width: "150px", borderRight: "1px solid #e5e7eb", padding: "12px 0", backgroundColor: "#f9fafb" }}>
                  <div style={{ padding: "8px 16px", backgroundColor: "#e0f2fe", color: "#0369a1", fontWeight: 600, fontSize: "0.85rem" }}>General</div>
                  <div style={{ padding: "8px 16px", color: "#374151", fontSize: "0.85rem", cursor: "pointer" }} onClick={() => alert("Video settings are configured automatically.")}>Video</div>
                  <div style={{ padding: "8px 16px", color: "#374151", fontSize: "0.85rem", cursor: "pointer" }} onClick={() => alert("Audio settings are configured automatically.")}>Audio</div>
                  <div style={{ padding: "8px 16px", color: "#374151", fontSize: "0.85rem", cursor: "pointer" }} onClick={() => alert("Share Screen options can be configured by the host.")}>Share Screen</div>
                </div>
                <div style={{ flex: 1, padding: "16px", overflowY: "auto", fontSize: "0.85rem" }}>
                  <h4 style={{ marginBottom: "12px", color: "#111827" }}>General Settings</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input type="checkbox" defaultChecked /> Dual monitors
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input type="checkbox" defaultChecked /> Enter full screen automatically when joining a meeting
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input type="checkbox" /> Always show meeting controls
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input type="checkbox" defaultChecked /> Ask me to confirm when I leave a meeting
                    </label>
                  </div>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button className={styles.btnPrimary} onClick={() => setShowSettingsModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Left Toolbar Group */}
        <div className={styles.toolbarLeft}>
          {/* Mute/Unmute button */}
          <div className={styles.splitBtnContainer}>
            <button 
              className={`${styles.controlBtn} ${isMuted ? styles.controlBtnMuted : ""}`}
              onClick={() => muteLocal()}
              id="mic-toggle"
            >
              <div className={styles.controlIcon}>
                {isMuted ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                  </svg>
                )}
              </div>
              <span className={styles.controlLabel}>{isMuted ? "Unmute" : "Mute"}</span>
            </button>
            <button className={styles.caratBtn}>^</button>
          </div>

          {/* Video Toggle */}
          <div className={styles.splitBtnContainer}>
            <button 
              className={`${styles.controlBtn} ${isVideoOff ? styles.controlBtnMuted : ""}`}
              onClick={toggleVideo}
              id="camera-toggle"
            >
              <div className={styles.controlIcon}>
                {isVideoOff ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2">
                    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10l-2.5-1.88"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 7l-7 5 7 5V7z" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                )}
              </div>
              <span className={styles.controlLabel}>Video</span>
            </button>
            <button className={styles.caratBtn}>^</button>
          </div>
        </div>

        {/* Center Toolbar Group */}
        <div className={styles.toolbarCenter}>
          {/* Participants toggler */}
          <div className={styles.splitBtnContainer}>
            <button 
              className={`${styles.controlBtn} ${activeSidebar === "participants" ? styles.controlBtnActive : ""}`}
              onClick={() => {
                setActiveSidebar(activeSidebar === "participants" ? null : "participants");
                setShowMoreDropdown(false);
              }}
              id="participants-toggle"
            >
              <div className={styles.controlIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className={styles.inlineBadge}>{participants.length}</span>
              </div>
              <span className={styles.controlLabel}>Participants</span>
            </button>
            <button className={styles.caratBtn} onClick={handleSimulateBot} title="Simulate Participant Bot">^</button>
          </div>

          {/* Chat toggler */}
          <div className={styles.splitBtnContainer}>
            <button 
              className={`${styles.controlBtn} ${activeSidebar === "chat" ? styles.controlBtnActive : ""}`}
              onClick={() => {
                setActiveSidebar(activeSidebar === "chat" ? null : "chat");
                setShowMoreDropdown(false);
              }}
              id="chat-toggle"
            >
              <div className={styles.controlIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {chatMessages.length > 0 && <span className={styles.inlineBadge}>{chatMessages.length}</span>}
              </div>
              <span className={styles.controlLabel}>Chat</span>
            </button>
            <button className={styles.caratBtn}>^</button>
          </div>

          {/* React button */}
          <button 
            className={`${styles.controlBtn} ${showReactionsPopup ? styles.controlBtnActive : ""}`} 
            id="reactions-btn"
            onClick={() => {
              setShowReactionsPopup(!showReactionsPopup);
              setShowSecurityDropdown(false);
              setShowMoreDropdown(false);
            }}
          >
            <div className={styles.controlIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <span className={styles.controlLabel}>React</span>
          </button>

          {/* Share button (Zoom Style: green background) */}
          <button 
            className={`${styles.controlBtn} ${styles.shareBtnGreen} ${isScreenSharing ? styles.controlBtnActive : ""}`}
            onClick={toggleScreenShare}
            id="screenshare-toggle"
          >
            <div className={styles.controlIconGreen}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="4" fill="#00c853" />
                <path d="M12 17V7" stroke="black" strokeWidth="3" strokeLinecap="round" />
                <path d="M8 11L12 7L16 11" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className={styles.controlLabel}>Share</span>
          </button>

          {/* Host Tools / Security */}
          <button 
            className={`${styles.controlBtn} ${showSecurityDropdown ? styles.controlBtnActive : ""}`} 
            id="security-btn"
            onClick={() => {
              setShowSecurityDropdown(!showSecurityDropdown);
              setShowReactionsPopup(false);
              setShowMoreDropdown(false);
            }}
          >
            <div className={styles.controlIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <span className={styles.controlLabel}>Host tools</span>
          </button>

          {/* Zoom AI button (star/sparkle) */}
          <button 
            className={`${styles.controlBtn} ${activeSidebar === "zoom-ai" ? styles.controlBtnActive : ""}`}
            id="zoom-ai-btn"
            onClick={() => {
              setActiveSidebar(activeSidebar === "zoom-ai" ? null : "zoom-ai");
              setShowReactionsPopup(false);
              setShowSecurityDropdown(false);
              setShowMoreDropdown(false);
            }}
          >
            <div className={styles.controlIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
              </svg>
            </div>
            <span className={styles.controlLabel}>Zoom AI</span>
          </button>

          {/* More button (three dots) */}
          <button 
            className={`${styles.controlBtn} ${showMoreDropdown ? styles.controlBtnActive : ""}`}
            id="more-btn"
            onClick={() => {
              setShowMoreDropdown(!showMoreDropdown);
              setShowReactionsPopup(false);
              setShowSecurityDropdown(false);
            }}
          >
            <div className={styles.controlIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
                <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
              </svg>
            </div>
            <span className={styles.controlLabel}>More</span>
          </button>
        </div>

        {/* Right Toolbar Group */}
        <div className={styles.toolbarRight}>
          {/* End Button */}
          <button 
            className={styles.endBtnContainer} 
            onClick={leaveMeeting}
            id="leave-meeting-btn"
          >
            <div className={styles.endBtnIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </svg>
            </div>
            <span className={styles.endLabel}>End</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
