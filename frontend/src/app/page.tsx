"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Meeting {
  id: string;
  title: string;
  description?: string;
  meeting_type: string;
  start_time?: string;
  duration?: number;
  host_name: string;
  created_at: string;
  is_active: boolean;
}

export default function Dashboard() {
  const router = useRouter();

  // User Profile States
  const [profileName, setProfileName] = useState("Jay Joshi");
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("Jay Joshi");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zoom_profile_name");
      if (saved) {
        setProfileName(saved);
        setTempName(saved);
      }
    }
  }, []);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return "JJ";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + (parts[1][0] || "")).toUpperCase();
  };

  const handleSaveName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = tempName.trim();
    if (trimmed) {
      setProfileName(trimmed);
      localStorage.setItem("zoom_profile_name", trimmed);
    } else {
      setTempName(profileName);
    }
    setIsEditingName(false);
  };

  // Time & Date State
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // Modal States
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Sidebar navigation active state
  const [activeNav, setActiveNav] = useState("Meetings");

  // Meetings Lists State
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [recentMeetings, setRecentMeetings] = useState<Meeting[]>([]);

  // Join Form State
  const [joinMeetingId, setJoinMeetingId] = useState("");
  const [joinDisplayName, setJoinDisplayName] = useState("Guest");
  const [joinError, setJoinError] = useState("");

  // Schedule Form State
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleDescription, setScheduleDescription] = useState("");
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [scheduleDuration, setScheduleDuration] = useState("30");
  const [scheduleError, setScheduleError] = useState("");

  // Initialize clock
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Meetings from API
  const fetchMeetings = async () => {
    try {
      const upcomingRes = await fetch(`${backendUrl}/api/meetings/upcoming`);
      if (upcomingRes.ok) {
        const upcomingData = await upcomingRes.json();
        setUpcomingMeetings(upcomingData);
      }

      const recentRes = await fetch(`${backendUrl}/api/meetings/recent`);
      if (recentRes.ok) {
        const recentData = await recentRes.json();
        setRecentMeetings(recentData);
      }
    } catch (error) {
      console.error("Failed to fetch meetings:", error);
    }
  };

  useEffect(() => {
    fetchMeetings();
    const interval = setInterval(fetchMeetings, 10000);
    return () => clearInterval(interval);
  }, []);

  // Actions
  const handleNewMeeting = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/meetings/instant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Instant Meeting`,
          description: "Created from Zoom Dashboard",
          meeting_type: "instant",
          host_name: profileName
        }),
      });

      if (response.ok) {
        const meeting = await response.json();
        router.push(`/meeting/${meeting.id}?username=${encodeURIComponent(profileName)}`);
      } else {
        console.error("Failed to create instant meeting");
      }
    } catch (err) {
      console.error("Error creating instant meeting:", err);
    }
  };

  const handleJoinMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError("");

    if (!joinMeetingId.trim()) {
      setJoinError("Meeting ID is required.");
      return;
    }
    if (!joinDisplayName.trim()) {
      setJoinError("Display Name is required.");
      return;
    }

    const cleanId = joinMeetingId.trim().replace(/\s+/g, "-");

    try {
      const response = await fetch(`${backendUrl}/api/meetings/${cleanId}`);
      if (response.ok) {
        setShowJoinModal(false);
        router.push(`/meeting/${cleanId}?username=${encodeURIComponent(joinDisplayName.trim())}`);
      } else {
        setJoinError("Meeting not found. Please verify the Meeting ID.");
      }
    } catch (err) {
      setJoinError("Unable to connect to the server. Please check if the backend is running.");
      console.error("Join error:", err);
    }
  };

  const handleScheduleMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleError("");

    if (!scheduleTitle.trim()) {
      setScheduleError("Topic is required.");
      return;
    }
    if (!scheduleDateTime) {
      setScheduleError("Date and time are required.");
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/meetings/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: scheduleTitle.trim(),
          description: scheduleDescription.trim() || undefined,
          meeting_type: "scheduled",
          start_time: new Date(scheduleDateTime).toISOString(),
          duration: parseInt(scheduleDuration),
          host_name: profileName
        }),
      });

      if (response.ok) {
        setShowScheduleModal(false);
        setScheduleTitle("");
        setScheduleDescription("");
        setScheduleDateTime("");
        fetchMeetings();
      } else {
        const errData = await response.json();
        setScheduleError(errData.detail || "Failed to schedule meeting.");
      }
    } catch (err) {
      setScheduleError("Unable to connect to the server. Please check if the backend is running.");
      console.error("Schedule error:", err);
    }
  };

  return (
    <div className={styles.container}>
      {/* Top Utility Bar */}
      <div className={styles.topUtilityBar}>
        <div className={styles.utilityLeft}>
          <span className={styles.utilityLink}><span className={styles.searchIcon}>🔍</span> Search</span>
          <span className={styles.utilityLink} onClick={() => alert("Zoom Support Hotline opening...")}>Support</span>
          <span className={styles.utilityLink}>0008000503335</span>
          <span className={styles.utilityLink} onClick={() => alert("Sales: sales@zoom.us")}>Contact Sales</span>
          <span className={styles.utilityLink} onClick={() => alert("Opening demo scheduling request form...")}>Request a Demo</span>
        </div>
      </div>

      {/* Main Header */}
      <header className={styles.mainHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.logoArea} onClick={() => router.push("/")}>
            <span className={styles.zoomTextLogo}>zoom</span>
          </div>
          <nav className={styles.navLinks}>
            <span>Products</span>
            <span>Solutions</span>
            <span>Resources</span>
            <span>Plans & Pricing</span>
          </nav>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.headerActionBtn} onClick={() => setShowScheduleModal(true)}>Schedule</button>
          <button className={styles.headerActionBtn} onClick={() => setShowJoinModal(true)}>Join</button>
          <button className={styles.headerActionBtn} onClick={handleNewMeeting}>Host ▾</button>
          <button className={styles.headerActionBtn}>Web App ▾</button>
          <div className={styles.avatarCircle} title={profileName.toLowerCase()}>
            {getInitials(profileName).toLowerCase()}
          </div>
        </div>
      </header>

      {/* Dashboard Grid Container */}
      <div className={styles.dashboardBody}>
        {/* Left Navigation Sidebar */}
        <aside className={styles.sidebar}>
          <div 
            className={`${styles.sidebarItem} ${activeNav === "Home" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Home")}
          >
            <span>🏠</span> Home
          </div>
          
          <div className={styles.sidebarSectionHeader}>My Products</div>
          
          <div 
            className={`${styles.sidebarItem} ${activeNav === "AI" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("AI")}
          >
            <span>AI</span> <span className={styles.newBadge}>New</span> <span className={styles.popoutIcon}>↗</span>
          </div>
          
          <div 
            className={`${styles.sidebarItem} ${activeNav === "Meetings" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Meetings")}
          >
            <span>Meetings</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Recordings" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Recordings")}
          >
            <span>Recordings</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Summaries" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Summaries")}
          >
            <span>Summaries</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Hub" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Hub")}
          >
            <span>Hub</span> <span className={styles.newBadge}>New</span> <span className={styles.popoutIcon}>↗</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Whiteboards" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Whiteboards")}
          >
            <span>Whiteboards</span> <span className={styles.popoutIcon}>↗</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Notes" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Notes")}
          >
            <span>Notes</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Clips" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Clips")}
          >
            <span>Clips</span> <span className={styles.popoutIcon}>↗</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Canvas" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Canvas")}
          >
            <span>Canvas</span> <span className={styles.popoutIcon}>↗</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Paper" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Paper")}
          >
            <span>Paper</span> <span className={styles.popoutIcon}>↗</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Sheets" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Sheets")}
          >
            <span>Sheets</span> <span className={styles.popoutIcon}>↗</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Slides" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Slides")}
          >
            <span>Slides</span> <span className={styles.popoutIcon}>↗</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Tasks" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Tasks")}
          >
            <span>Tasks</span> <span className={styles.popoutIcon}>↗</span>
          </div>

          <div 
            className={`${styles.sidebarItem} ${activeNav === "Scheduler" ? styles.sidebarActive : ""}`}
            onClick={() => setActiveNav("Scheduler")}
          >
            <span>Scheduler</span> <span className={styles.popoutIcon}>↗</span>
          </div>

          <div className={styles.sidebarDiscoverMore} onClick={() => alert("Checking for more Zoom products...")}>
            Discover More Products ▾
          </div>
          
          <div className={styles.sidebarDivider} />
          
          <div className={styles.sidebarExpandItem} onClick={() => alert("Expanding My Account details...")}>
            My Account ▾
          </div>
          <div className={styles.sidebarExpandItem} onClick={() => alert("Expanding Admin options...")}>
            Admin ▾
          </div>
        </aside>

        {/* Main Dashboard Layout Container */}
        <div className={styles.contentContainer}>
          {/* Feed Column */}
          <div className={styles.centerFeed}>
            {/* Profile Card */}
            <div className={styles.profileCard}>
              <div className={styles.profileInfoArea}>
                <div className={styles.profileAvatarSquare}>
                  {getInitials(profileName)}
                </div>
                <div className={styles.profileDetailsText}>
                  {isEditingName ? (
                    <form onSubmit={handleSaveName} className={styles.nameForm}>
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        className={styles.nameInput}
                        autoFocus
                        onBlur={() => handleSaveName()}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setTempName(profileName);
                            setIsEditingName(false);
                          }
                        }}
                        maxLength={30}
                      />
                      <button type="submit" className={styles.saveNameBtn}>Save</button>
                    </form>
                  ) : (
                    <h2 
                      className={styles.profileNameEditable}
                      onClick={() => {
                        setIsEditingName(true);
                        setTempName(profileName);
                      }}
                      title="Click to edit name"
                    >
                      {profileName} <span className={styles.editIconInline}>✏️</span>
                    </h2>
                  )}
                  <p className={styles.profilePlan}>Plan: <span style={{ fontWeight: 600 }}>Workplace Basic</span></p>
                </div>
              </div>
              <div className={styles.profileActions}>
                <button className={styles.managePlanBtn} onClick={() => alert("Redirecting to billing system...")}>Manage Plan</button>
                <span className={styles.viewPlanLink} onClick={() => alert("Displaying subscription limits: 40 minutes limit per session.")}>View Plan Details</span>
              </div>
            </div>

            {/* Birthday Celebration Banner */}
            <div className={styles.birthdayCard}>
              <div className={styles.birthdayLeft}>
                <div className={styles.proBadgeRow}>
                  <span className={styles.workplaceProLogo}>zoom</span>
                  <span className={styles.workplaceProText}>Workplace Pro</span>
                </div>
                <h3 className={styles.birthdayTitle}>It's our birthday, and we're celebrating you!</h3>
                <p className={styles.birthdayDesc}>
                  Get 15% off when you upgrade to Zoom Workplace Pro annual and enjoy longer meetings, <strong style={{ fontWeight: 700 }}>10GB Cloud Storage</strong>, and more. Offer ends 6/30.
                </p>
                <span className={styles.termsApply}>Terms apply.</span>
                <button className={styles.redeemBtn} onClick={() => alert("Coupon code ZOOM15 applied to your account!")}>Redeem offer</button>
              </div>
              <div className={styles.birthdayRight}>
                <div className={styles.callPreviewBox}>
                  <div className={styles.previewParticipant}>
                    <img 
                      src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200" 
                      alt="Meeting Preview" 
                      className={styles.previewImg} 
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }} 
                    />
                    <div className={styles.previewName}>Sarah Connor</div>
                  </div>
                  <div className={styles.previewRow}>
                    <div className={styles.previewParticipantMini}>
                      <div className={styles.miniAvatar}>JD</div>
                    </div>
                    <div className={styles.previewParticipantMini}>
                      <div className={styles.miniAvatar}>AR</div>
                    </div>
                  </div>
                  <div className={styles.previewControls}>
                    <div className={styles.previewControlDot} />
                    <div className={styles.previewControlDot} />
                    <div className={styles.previewControlDot} />
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity Card */}
            <div className={styles.recentActivityCard}>
              <h3 className={styles.recentActivityTitle}>Recent activity</h3>
              <div className={styles.recentActivityContent}>
                <div className={styles.openBoxIllustration}>
                  <div className={styles.boxLeft} />
                  <div className={styles.boxRight} />
                  <div className={styles.boxTop} />
                </div>
                <p className={styles.noActivityText}>No recent activity</p>
              </div>
            </div>
          </div>

          {/* Right Cards widgets Column */}
          <div className={styles.rightColumn}>
            {/* Quick Actions Panel */}
            <div className={styles.quickActionsCard}>
              <div className={styles.actionCircleRow}>
                <div className={styles.actionCircleWrapper} onClick={() => setShowScheduleModal(true)}>
                  <div className={`${styles.actionCircle} ${styles.circleBlue}`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span className={styles.calendarDayText}>19</span>
                  </div>
                  <span className={styles.circleLabel}>Schedule</span>
                </div>

                <div className={styles.actionCircleWrapper} onClick={() => setShowJoinModal(true)}>
                  <div className={`${styles.actionCircle} ${styles.circleBlue}`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                  <span className={styles.circleLabel}>Join</span>
                </div>

                <div className={styles.actionCircleWrapper} onClick={handleNewMeeting}>
                  <div className={`${styles.actionCircle} ${styles.circleOrange}`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 7l-7 5 7 5V7z" fill="white" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" fill="white" />
                    </svg>
                  </div>
                  <span className={styles.circleLabel}>Host</span>
                </div>
              </div>

              <div className={styles.pmiBox}>
                <div className={styles.pmiLabel}>Personal Meeting ID</div>
                <div className={styles.pmiValueRow}>
                  <span className={styles.pmiNumber}>393 002 8527</span>
                  <button 
                    className={styles.copyPmiBtn}
                    onClick={() => {
                      navigator.clipboard.writeText("393 002 8527");
                      alert("PMI copied to clipboard!");
                    }}
                    title="Copy Meeting ID"
                  >
                    📋
                  </button>
                </div>
              </div>
            </div>

            {/* Meetings Panel */}
            <div className={styles.meetingsWidget}>
              <div className={styles.meetingsWidgetHeader}>
                <span className={styles.widgetTitle}>Meetings</span>
                <span className={styles.visitMeetingsLink} onClick={() => alert("Accessing saved meeting templates...")}>Visit Meetings</span>
              </div>
              
              <div className={styles.widgetSubHeader}>Upcoming</div>
              <div className={styles.widgetMeetingsList} style={{ marginBottom: "16px" }}>
                {upcomingMeetings.length === 0 ? (
                  <div className={styles.noUpcomingGrayBox}>
                    No Upcoming Meetings
                  </div>
                ) : (
                  upcomingMeetings.slice(0, 2).map((meeting) => (
                    <div className={styles.widgetMeetingItem} key={meeting.id}>
                      <div className={styles.widgetMeetingLeft}>
                        <div className={styles.widgetMeetingTime}>
                          {meeting.start_time && new Date(meeting.start_time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </div>
                        <div className={styles.widgetMeetingTitle}>{meeting.title}</div>
                      </div>
                      <button 
                        className={styles.widgetStartBtn}
                        onClick={() => router.push(`/meeting/${meeting.id}?username=Host`)}
                      >
                        Start
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className={styles.widgetSubHeader}>Recent</div>
              <div className={styles.widgetMeetingsList}>
                {recentMeetings.length === 0 ? (
                  <div className={styles.noUpcomingGrayBox} style={{ padding: "12px", fontSize: "0.8rem" }}>
                    No Recent Meetings
                  </div>
                ) : (
                  recentMeetings.slice(0, 2).map((meeting) => (
                    <div className={styles.widgetMeetingItem} key={meeting.id}>
                      <div className={styles.widgetMeetingLeft}>
                        <div className={styles.widgetMeetingTime} style={{ color: "#64748b" }}>
                          {new Date(meeting.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </div>
                        <div className={styles.widgetMeetingTitle}>{meeting.title}</div>
                      </div>
                      <button 
                        className={styles.widgetStartBtn}
                        style={{ backgroundColor: "#cbd5e1", color: "#1e293b" }}
                        onClick={() => router.push(`/meeting/${meeting.id}?username=Guest`)}
                      >
                        Rejoin
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button className={styles.testAudioBtn} onClick={() => alert("Testing local speaker and microphone connections...")}>
                Test Audio and Video
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating live help button */}
      <button className={styles.supportFloatingBtn} onClick={() => alert("Zoom Live Chat Support is opening...")}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* Footer Column Lists */}
      <footer className={styles.footer}>
        <div className={styles.footerColumns}>
          <div className={styles.footerColumn}>
            <h4>About</h4>
            <span>Zoom Blog</span>
            <span>Customers</span>
            <span>Our Team</span>
            <span>Careers</span>
            <span>Integrations</span>
            <span>Partners</span>
            <span>Investors</span>
            <span>Press</span>
            <span>Sustainability & ESG</span>
            <span>Zoom Cares</span>
            <span>Media Kit</span>
            <span>How to Videos</span>
            <span>Developer Platform</span>
            <span>Zoom Ventures</span>
            <span>Zoom Merchandise Store</span>
          </div>

          <div className={styles.footerColumn}>
            <h4>Download</h4>
            <span>Zoom Workplace App</span>
            <span>Zoom Rooms Client</span>
            <span>Browser Extension</span>
            <span>Outlook Plug-In</span>
            <span>Zoom Plugin for HCL Notes</span>
            <span>Zoom Plugin Admin Tool for HCL Notes</span>
            <span>Android App</span>
            <span>Zoom Virtual Backgrounds</span>
          </div>

          <div className={styles.footerColumn}>
            <h4>Sales</h4>
            <span>0008000503335</span>
            <span>Contact Sales</span>
            <span>Plans & Pricing</span>
            <span>Request a Demo</span>
            <span>Webinars and Events</span>
            <span>Zoom Experience Center</span>
          </div>

          <div className={styles.footerColumn}>
            <h4>Support</h4>
            <span>Test Zoom</span>
            <span>Account</span>
            <span>Support Center</span>
            <span>Learning Center</span>
            <span>Zoom Community</span>
            <span>Feedback</span>
            <span>Contact Us</span>
            <span>Accessibility</span>
            <span>Developer support</span>
            <span>Privacy, Security, Legal Policies, and Modern Slavery Act</span>
            <span>Transparency Statement</span>
          </div>

          <div className={styles.footerColumn}>
            <h4>Language</h4>
            <select className={styles.footerSelect} defaultValue="en">
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
            </select>

            <h4 style={{ marginTop: "24px" }}>Currency</h4>
            <select className={styles.footerSelect} defaultValue="inr">
              <option value="inr">Indian Rupee ₹</option>
              <option value="usd">US Dollar $</option>
            </select>

            <div className={styles.socialIconsRow}>
              <span>🌐</span>
              <span>🔗</span>
              <span>𝕏</span>
              <span>📺</span>
              <span>f</span>
              <span>📸</span>
            </div>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <div className={styles.copyrightText}>
            <span className={styles.shieldIcon}>🛡️</span>
            Copyright ©2026 Zoom Communications, Inc. All rights reserved. 
            <span className={styles.footerLegals}>
              Terms | Privacy | Trust Center | Acceptable Use Guidelines | Legal & Compliance | Your Privacy Choices | Cookie Preferences
            </span>
          </div>
        </div>
      </footer>

      {/* Join Meeting Modal */}
      {showJoinModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Join a Meeting</h2>
              <button className={styles.closeBtn} id="close-join" onClick={() => { setShowJoinModal(false); setJoinError(""); }}>&times;</button>
            </div>
            <form onSubmit={handleJoinMeeting} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className={styles.formGroup}>
                <label htmlFor="join-meeting-id">Meeting ID</label>
                <input
                  type="text"
                  id="join-meeting-id"
                  placeholder="Example: 482-192-385"
                  value={joinMeetingId}
                  onChange={(e) => setJoinMeetingId(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="join-display-name">Your Display Name</label>
                <input
                  type="text"
                  id="join-display-name"
                  placeholder="Example: John Doe"
                  value={joinDisplayName}
                  onChange={(e) => setJoinDisplayName(e.target.value)}
                />
              </div>
              {joinError && <div className={styles.errorMsg}>{joinError}</div>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => { setShowJoinModal(false); setJoinError(""); }}>Cancel</button>
                <button type="submit" className={styles.btnPrimary} id="submit-join">Join</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Schedule a Meeting</h2>
              <button className={styles.closeBtn} id="close-schedule" onClick={() => { setShowScheduleModal(false); setScheduleError(""); }}>&times;</button>
            </div>
            <form onSubmit={handleScheduleMeeting} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className={styles.formGroup}>
                <label htmlFor="schedule-title">Topic</label>
                <input
                  type="text"
                  id="schedule-title"
                  placeholder="Example: Weekly Architecture Discussion"
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="schedule-desc">Description (Optional)</label>
                <input
                  type="text"
                  id="schedule-desc"
                  placeholder="Enter a brief agenda"
                  value={scheduleDescription}
                  onChange={(e) => setScheduleDescription(e.target.value)}
                />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="schedule-time">Date & Time</label>
                  <input
                    type="datetime-local"
                    id="schedule-time"
                    value={scheduleDateTime}
                    onChange={(e) => setScheduleDateTime(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="schedule-duration">Duration (Minutes)</label>
                  <select
                    id="schedule-duration"
                    value={scheduleDuration}
                    onChange={(e) => setScheduleDuration(e.target.value)}
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>
              </div>
              {scheduleError && <div className={styles.errorMsg}>{scheduleError}</div>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => { setShowScheduleModal(false); setScheduleError(""); }}>Cancel</button>
                <button type="submit" className={styles.btnPrimary} id="submit-schedule">Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
