import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiRequestError, createRoom } from "../api/client";
import { saveTicket } from "../api/ticketStore";
import { DashboardLayout } from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";

const MAX_ROOM_USERS = 10000;

export function CreateRoomPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.username ?? user?.displayName ?? "");
  const [pin, setPin] = useState("");
  const [maxUsers, setMaxUsers] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ticket = await createRoom({
        displayName: displayName.trim(),
        pin: pin.trim() || undefined,
        maxUsers,
      });
      saveTicket(ticket);
      navigate(`/room/${ticket.room.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to create room");
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
          <h1>Create meeting</h1>
          <p className="form-hint muted">
            Video uses LiveKit SFU. Chat uses the app WebSocket backend. Rooms support up to{" "}
            {MAX_ROOM_USERS.toLocaleString()} participants.
          </p>
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
            Max participants
            <input
              type="number"
              min={2}
              max={MAX_ROOM_USERS}
              value={maxUsers}
              onChange={(e) => setMaxUsers(Number(e.target.value))}
            />
          </label>
          <label>
            Room PIN (optional)
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Leave empty for open room"
              maxLength={32}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading || !displayName.trim()}>
            {loading ? "Creating…" : "Create & join"}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
