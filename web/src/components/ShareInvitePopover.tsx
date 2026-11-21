import { useEffect, useState } from "react";
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

export function ShareInvitePopover({ roomId, open, onClose }: ShareInvitePopoverProps) {
  const [meetingName, setMeetingName] = useState(() => readStoredMeetingName(roomId));
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const shareLink = inviteLinkForRoom(roomId);

  useEffect(() => {
    if (!open) return;
    setMeetingName(readStoredMeetingName(roomId));
    setCopied(false);
    setError("");
  }, [open, roomId]);

  if (!open) return null;

  function saveMeetingName() {
    persistMeetingName(roomId, meetingName);
  }

  async function copyShare() {
    saveMeetingName();
    const ok = await copyInviteLink(roomId);
    if (ok) {
      setError("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setError("Could not copy — select the link and copy manually");
    }
  }

  return (
    <section id="meeting-invite" className="meeting-invite" aria-label="Meeting invitation">
      <label className="meeting-invite-label" htmlFor="mm-share-link">Invite link</label>
      <input
        id="mm-share-link"
        className="meeting-invite-link"
        type="text"
        readOnly
        value={shareLink}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" className="meeting-invite-copy" onClick={() => void copyShare()}>
        {copied ? "Copied" : "Copy"}
      </button>
      <label className="sr-only" htmlFor="mm-share-meeting-name">Meeting name (optional)</label>
      <input
        id="mm-share-meeting-name"
        className="meeting-invite-name"
        type="text"
        value={meetingName}
        onChange={(e) => setMeetingName(e.target.value)}
        onBlur={saveMeetingName}
        placeholder="Meeting name (optional)"
        maxLength={80}
        autoComplete="off"
      />

      <button type="button" className="meeting-invite-close" onClick={onClose} aria-label="Hide invite link">×</button>
      {error && <span className="meeting-invite-error" role="status">{error}</span>}
    </section>
  );
}
