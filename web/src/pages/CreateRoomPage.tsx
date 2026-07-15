import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiRequestError, createRoom } from "../api/client";
import { saveTicket } from "../api/ticketStore";
import { BrandLogo } from "../components/BrandLogo";

const MAX_ROOM_USERS = 10000;

export function CreateRoomPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
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
    <div className="page form-page">
      <Link className="back-link" to="/">
        ← Back
      </Link>
      <form className="form-card" onSubmit={onSubmit}>
        <BrandLogo size={40} showText={false} />
        <h1>Create meeting</h1>
        <p className="form-hint">
          Video uses LiveKit SFU. Chat uses the app WebSocket backend. Rooms support up to{" "}
          {MAX_ROOM_USERS.toLocaleString()} participants (webinar-scale); interactive mode still
          limits how many can publish camera/mic at once.
        </p>
        <label>
          Your name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Host name"
            required
            maxLength={64}
          />
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
  );
}
