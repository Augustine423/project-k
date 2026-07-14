import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiRequestError, createRoom } from "../api/client";
import { saveTicket } from "../api/ticketStore";
import { BrandLogo } from "../components/BrandLogo";

const MAX_TEST_USERS = 10;

export function CreateRoomPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [maxUsers, setMaxUsers] = useState(MAX_TEST_USERS);
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
          Symmetrical multiparty video — direct WebRTC via Janus VideoRoom SFU.
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
          Max participants (testing)
          <input
            type="number"
            min={2}
            max={MAX_TEST_USERS}
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
