import { useEffect, useId, useRef, useState } from "react";
import {
  copyInviteLink,
  inviteLinkForRoom,
  persistMeetingName,
  readStoredMeetingName,
} from "../api/inviteLink";

interface ShareInvitePopoverProps {
  roomId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Compact share card: plain join URL (no query params) + optional local meeting title.
 */
export function ShareInvitePopover({ roomId, open, onClose }: ShareInvitePopoverProps) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [meetingName, setMeetingName] = useState(() => readStoredMeetingName(roomId));
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const shareLink = inviteLinkForRoom(roomId);

  useEffect(() => {
    if (!open) return;
    setMeetingName(readStoredMeetingName(roomId));
    setCopied(false);
    setError("");
    const t = window.setTimeout(() => nameRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, roomId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".mm-share-pop") || target.closest(".mm-share-backdrop") || target.closest("[data-share-toggle]")) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open, onClose]);

  if (!open) return null;

  function saveMeetingName() {
    persistMeetingName(roomId, meetingName);
  }

  async function copyShare() {
    saveMeetingName();
    const ok = await copyInviteLink(roomId);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setError("Could not copy — select the link and copy manually");
    }
  }

  return (
    <>
      <button
        type="button"
        className="mm-share-backdrop"
        aria-label="Close share dialog"
        onClick={onClose}
      />
      <div
        className="mm-share-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
      <div className="mm-share-pop-head">
        <h2 id={titleId} className="mm-share-pop-title">
          Share meeting
        </h2>
        <button type="button" className="mm-share-pop-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="mm-share-pop-result">
        <label className="mm-share-pop-label" htmlFor="mm-share-link">
          Invite link
        </label>
        <div className="mm-share-pop-row">
          <input
            id="mm-share-link"
            className="mm-share-pop-input mm-share-pop-link"
            type="text"
            readOnly
            value={shareLink}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className="mm-share-pop-copy" onClick={() => void copyShare()}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <label className="mm-share-pop-label" htmlFor="mm-share-meeting-name">
        Meeting name <span className="muted">(optional, shown on join page)</span>
      </label>
      <input
        ref={nameRef}
        id="mm-share-meeting-name"
        className="mm-share-pop-input"
        type="text"
        value={meetingName}
        onChange={(e) => setMeetingName(e.target.value)}
        onBlur={saveMeetingName}
        placeholder="e.g. Team standup"
        maxLength={80}
        autoComplete="off"
      />

      {error && <p className="mm-share-pop-error">{error}</p>}
      </div>
    </>
  );
}
