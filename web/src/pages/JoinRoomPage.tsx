import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiRequestError, joinRoom } from "../api/client";
import { saveTicket } from "../api/ticketStore";
import { DashboardLayout } from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";

export function JoinRoomPage() {
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [roomId, setRoomId] = useState(routeRoomId ?? "");
  const [displayName, setDisplayName] = useState(user?.username ?? user?.displayName ?? "");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const id = roomId.trim();
      const ticket = await joinRoom(id, {
        displayName: displayName.trim(),
        pin: pin.trim() || undefined,
      });
      saveTicket(ticket);
      navigate(`/room/${ticket.room.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to join room");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="dashboard-form-wrap">
        <Link className="back-link" to="/dashboard">
          ← Back to dashboard
        </Link>
        <form className="form-card dashboard-form-card" onSubmit={onSubmit}>
          <h1>Join meeting</h1>
          <label>
            Room ID
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Paste room ID"
              required
            />
          </label>
          <label>
            Your name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Meeting display name"
              required
              maxLength={64}
            />
            <span className="form-field-note muted">Uses your MeetingMax username by default.</span>
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
        </form>
      </div>
    </DashboardLayout>
  );
}
