import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiRequestError, joinRoom } from "../api/client";
import { saveTicket } from "../api/ticketStore";
import { BrandLogo } from "../components/BrandLogo";

export function JoinRoomPage() {
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(routeRoomId ?? "");
  const [displayName, setDisplayName] = useState("");
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
    <div className="page form-page">
      <Link className="back-link" to="/">
        ← Back
      </Link>
      <form className="form-card" onSubmit={onSubmit}>
        <BrandLogo size={40} showText={false} />
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
            placeholder="Display name"
            required
            maxLength={64}
          />
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
  );
}
