import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiRequestError, joinRoom } from "../api/client";
import { getTicket, saveTicket } from "../api/ticketStore";
import { BrandLogo } from "../components/BrandLogo";
import { DashboardLayout } from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";

const GUEST_NAME_KEY = "meetingmax.guestDisplayName";

function suggestGuestName(): string {
  try {
    const saved = localStorage.getItem(GUEST_NAME_KEY)?.trim();
    if (saved) return saved.slice(0, 64);
  } catch {
    /* ignore */
  }

  const ua = navigator.userAgent;
  let device = "Guest";
  if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua)) device = "iPad";
  else if (/Android/i.test(ua)) device = "Android";
  else if (/Mac OS|Macintosh/i.test(ua)) device = "Mac";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/CrOS/i.test(ua)) device = "Chromebook";
  else if (/Linux/i.test(ua)) device = "Linux";

  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${device}-${suffix}`;
}

function rememberGuestName(name: string) {
  try {
    localStorage.setItem(GUEST_NAME_KEY, name.slice(0, 64));
  } catch {
    /* ignore */
  }
}

export function JoinRoomPage() {
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user, ready } = useAuth();
  const [roomId, setRoomId] = useState(routeRoomId ?? "");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nameReady, setNameReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const accountName = user?.username ?? user?.displayName ?? "";
    setDisplayName(accountName || suggestGuestName());
    setNameReady(true);
  }, [ready, user?.username, user?.displayName]);

  // Same tab already has a ticket — re-enter the room instead of minting another seat.
  useEffect(() => {
    const id = (routeRoomId ?? roomId).trim();
    if (!id) return;
    const existing = getTicket(id);
    if (existing?.room?.id === id && existing.participantToken) {
      navigate(`/room/${id}`, { replace: true });
    }
  }, [routeRoomId, roomId, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const id = roomId.trim();
      const name = displayName.trim();
      const ticket = await joinRoom(id, {
        displayName: name,
        pin: pin.trim() || undefined,
      });
      if (!isAuthenticated) rememberGuestName(name);
      saveTicket(ticket);
      navigate(`/room/${ticket.room.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to join room");
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <form className="form-card dashboard-form-card" onSubmit={onSubmit}>
      <h1>{routeRoomId ? "Join meeting" : "Join with room ID"}</h1>
      {!isAuthenticated && (
        <p className="muted form-lead">
          No account needed. Enter a name to join — we suggested one from this device.
        </p>
      )}
      <label>
        Room ID
        <input
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Paste room ID"
          required
          readOnly={Boolean(routeRoomId)}
        />
      </label>
      <label>
        Your name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Name shown in the meeting"
          required
          maxLength={64}
          disabled={!nameReady}
        />
        <span className="form-field-note muted">
          {isAuthenticated
            ? "Uses your MeetingMax username by default."
            : "Shown to others in the room. You can edit it before joining."}
        </span>
      </label>
      <label>
        Room PIN (if required)
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Optional"
          maxLength={32}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button
        className="btn btn-primary"
        type="submit"
        disabled={loading || !roomId.trim() || !displayName.trim()}
      >
        {loading ? "Joining…" : "Join room"}
      </button>
      {!isAuthenticated && (
        <p className="muted form-field-note" style={{ marginTop: "0.85rem", marginBottom: 0 }}>
          Hosting a meeting?{" "}
          <Link to="/login" state={{ from: `/join/${roomId.trim() || routeRoomId || ""}` }}>
            Sign in
          </Link>
        </p>
      )}
    </form>
  );

  if (!ready) return null;

  if (isAuthenticated) {
    return (
      <DashboardLayout>
        <div className="dashboard-form-wrap">
          <Link className="back-link" to="/dashboard">
            ← Back to dashboard
          </Link>
          {form}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <div className="guest-join-shell">
      <div className="guest-join-panel">
        <Link to="/login" className="guest-join-brand" aria-label="MeetingMax">
          <BrandLogo size={40} variant="light" />
        </Link>
        {form}
      </div>
    </div>
  );
}
