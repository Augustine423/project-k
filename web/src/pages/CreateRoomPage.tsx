import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiRequestError, createRoom } from "../api/client";
import { saveTicket } from "../api/ticketStore";
import type { RoomMode } from "../api/types";

export function CreateRoomPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<RoomMode>("interactive");
  const [pin, setPin] = useState("");
  const [maxPublishers, setMaxPublishers] = useState(16);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ticket = await createRoom({
        mode,
        displayName: displayName.trim(),
        pin: pin.trim() || undefined,
        maxPublishers: mode === "interactive" ? maxPublishers : undefined,
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
        <h1>Create meeting</h1>
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
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as RoomMode)}>
            <option value="interactive">Interactive (VideoRoom)</option>
            <option value="webinar">Webinar (stage + viewers)</option>
          </select>
        </label>
        {mode === "interactive" && (
          <label>
            Max publishers
            <input
              type="number"
              min={2}
              max={64}
              value={maxPublishers}
              onChange={(e) => setMaxPublishers(Number(e.target.value))}
            />
          </label>
        )}
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
