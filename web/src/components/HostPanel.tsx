import type { Participant } from "../api/types";

interface HostPanelProps {
  participants: Participant[];
  locked: boolean;
  onToggleLock: () => void;
  onEndRoom: () => void;
  onKick: (participantId: string) => void;
  busy?: boolean;
}

export function HostPanel({
  participants,
  locked,
  onToggleLock,
  onEndRoom,
  onKick,
  busy,
}: HostPanelProps) {
  const others = participants.filter((p) => p.role !== "host");

  return (
    <aside className="host-panel">
      <h3>Host controls</h3>
      <div className="host-actions">
        <button type="button" className="btn btn-secondary" onClick={onToggleLock} disabled={busy}>
          {locked ? "Unlock room" : "Lock room"}
        </button>
        <button type="button" className="btn btn-danger" onClick={onEndRoom} disabled={busy}>
          End meeting
        </button>
      </div>
      <h4>Participants ({participants.length})</h4>
      <ul className="participant-list">
        {participants.map((p) => (
          <li key={p.id}>
            <span>
              {p.displayName} <em>({p.role})</em>
            </span>
            {p.role !== "host" && (
              <button type="button" className="link-btn" onClick={() => onKick(p.id)} disabled={busy}>
                Kick
              </button>
            )}
          </li>
        ))}
        {others.length === 0 && participants.length <= 1 && <li className="muted">Only you here.</li>}
      </ul>
    </aside>
  );
}
