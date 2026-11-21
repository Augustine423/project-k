import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ControlBar } from "./ControlBar";
import { RoomSidePanel, type DmPeer } from "./RoomSidePanel";

describe("meeting panels", () => {
  it("renders reference-style room messages and keeps direct messaging available", () => {
    const markup = renderToStaticMarkup(
      <RoomSidePanel
        roomId="room"
        participantCount={2}
        selfId="self"
        messages={[
          { id: "1", participantId: "other", displayName: "Aiko", message: "Hello", at: "2026-01-01T00:00:00Z" },
          { id: "2", participantId: "self", displayName: "Me", message: "Hi", at: "2026-01-01T00:00:00Z" },
        ]}
        onSend={() => true}
        activeTab="chat"
        onClose={() => {}}
        dmPeer={null}
        onDmPeerChange={() => {}}
        dmThreads={{}}
        openDmPeers={[]}
        onOpenDm={(_peer: DmPeer) => {}}
      />,
    );
    expect(markup).toContain('aria-label="Close panel"');
    expect(markup).toContain('title="Message Aiko');
    expect(markup).toContain('class="rsp-msg is-self"');
    expect(markup).toContain('aria-label="Send message"');
    expect(markup).not.toContain('class="rsp-tabs"');
    expect(markup).not.toContain('class="rsp-face');
  });

  it("reports chat and invite as independently open", () => {
    const markup = renderToStaticMarkup(
      <ControlBar
        audioEnabled videoEnabled onToggleAudio={() => {}} onToggleVideo={() => {}}
        onShareScreen={() => {}} onLeave={() => {}} onFocusChat={() => {}}
        onFocusInvite={() => {}} activePanel="chat" inviteOpen
      />,
    );
    expect(markup).toMatch(/aria-pressed="true" aria-label="Hide chat"/);
    expect(markup).toMatch(/aria-pressed="true" aria-label="Hide share"/);
  });
});
