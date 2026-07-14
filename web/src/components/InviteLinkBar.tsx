import { useCallback, useState } from "react";
import { copyInviteLink, inviteLinkForRoom } from "../api/inviteLink";

interface InviteLinkBarProps {
  roomId: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function InviteLinkBar({ roomId, collapsed = false, onToggleCollapse }: InviteLinkBarProps) {
  const link = inviteLinkForRoom(roomId);
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    const ok = await copyInviteLink(roomId);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [roomId]);

  return (
    <section className={`side-panel invite-panel ${collapsed ? "collapsed" : ""}`}>
      <button
        type="button"
        className="side-panel-header"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
      >
        <span className="side-panel-title">Invite link</span>
        <span className="side-panel-chevron" aria-hidden="true">
          {collapsed ? "▾" : "▴"}
        </span>
      </button>
      {!collapsed && (
        <div className="side-panel-body invite-panel-body">
          <div className="invite-link-row">
            <input
              id="invite-link-input"
              className="invite-link-input"
              type="text"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              aria-label="Meeting invitation link"
            />
            <button type="button" className="btn btn-secondary btn-sm invite-copy-btn" onClick={() => void onCopy()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
