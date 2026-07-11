import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiRequestError, joinRoom } from "../api/client";
import { saveTicket } from "../api/ticketStore";

export function JoinRoomPage() {
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(routeRoomId ?? "");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [asViewer, setAsViewer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const id = roomId.trim();
      if (asViewer) {
        navigate(`/watch/${id}`);
        return;
      }
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
    <div className="page form-page">
      <Link className="back-link" to="/">
        ← Back
      </Link>
      <form className="form-card" onSubmit={onSubmit}>
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
        {!asViewer && (
          <label>
            Your name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              required={!asViewer}
              maxLength={64}
            />
          </label>
        )}
        {!asViewer && (
          <label>
            Room PIN (if required)
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Optional"
              maxLength={32}
            />
          </label>
        )}
        <label className="checkbox-row">
          <input type="checkbox" checked={asViewer} onChange={(e) => setAsViewer(e.target.checked)} />
          Join as webinar viewer (watch only)
        </label>
        {error && <p className="form-error">{error}</p>}
        <button
          className="btn btn-primary"
          type="submit"
          disabled={loading || !roomId.trim() || (!asViewer && !displayName.trim())}
        >
          {loading ? "Joining…" : asViewer ? "Watch webinar" : "Join room"}
        </button>
      </form>
    </div>
  );
}
