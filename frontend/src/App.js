import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import {
  Room as LiveKitRoom,
  RoomEvent,
  Track,
  ConnectionState,
  createLocalTracks,
  createLocalScreenTracks,
} from 'livekit-client';

// ── Helpers ─────────────────────────────────────────────────────────────────

function isLocalDev() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function getApiBase() {
  return isLocalDev() ? 'http://localhost:8080/api' : `${window.location.origin}/api`;
}

function buildJoinUrl(roomId, joinKey) {
  return `${window.location.origin}/join?room=${encodeURIComponent(roomId)}&key=${encodeURIComponent(joinKey)}`;
}

function parseInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  const key = params.get('key');
  if (room && key) return { roomId: room.trim(), joinKey: key.trim() };
  return null;
}

function parseInviteLink(text) {
  try {
    const url = new URL(text.trim());
    const room = url.searchParams.get('room');
    const key = url.searchParams.get('key');
    if (room && key) return { roomId: room.trim(), joinKey: key.trim() };
  } catch { /* not a valid URL */ }
  return null;
}

function isSecureCameraContext() {
  return window.isSecureContext || isLocalDev();
}

function getLiveKitUrl() {
  const isLocal = isLocalDev();
  const proto = isLocal ? 'ws' : (window.location.protocol === 'https:' ? 'wss' : 'ws');
  return process.env.REACT_APP_LIVEKIT_URL || (
    isLocal ? 'ws://localhost:7880' : `${proto}://${window.location.host}`
  );
}

// ── KZYS Meeting Room App ───────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState(null);

  if (session) {
    return (
      <Room
        session={session}
        onLeave={() => {
          window.history.replaceState(null, '', '/');
          setSession(null);
        }}
      />
    );
  }
  return <Lobby onJoin={setSession} />;
}

// ── Lobby ───────────────────────────────────────────────────────────────────
function Lobby({ onJoin }) {
  const inviteFromUrl = parseInviteFromUrl();
  const [step, setStep] = useState(inviteFromUrl ? 'join' : 'home');
  const [userId, setUserId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdRoom, setCreatedRoom] = useState(null);
  const [invite, setInvite] = useState(inviteFromUrl);
  const [inviteMeta, setInviteMeta] = useState(null);
  const [inviteLinkInput, setInviteLinkInput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!invite) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${getApiBase()}/rooms/validate?roomId=${encodeURIComponent(invite.roomId)}&joinKey=${encodeURIComponent(invite.joinKey)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setErrorMsg(data.error || 'Invalid or expired invite link.');
        } else if (!cancelled) {
          setInviteMeta(data);
        }
      } catch {
        if (!cancelled) setErrorMsg('Backend unavailable. Check kubectl get pods.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [invite]);

  const handleCreateRoom = async () => {
    if (!userId.trim()) {
      setErrorMsg('Enter your display name.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: userId.trim(), userId: userId.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Create failed: ${res.status}`);
      const joinUrl = buildJoinUrl(data.roomId, data.joinKey);
      setCreatedRoom({
        roomId: data.roomId,
        joinKey: data.joinKey,
        joinUrl,
        planName: data.planName,
        maxParticipants: data.maxParticipants,
      });
      setStep('ready');
      window.history.replaceState(null, '', joinUrl);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create room.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasteInvite = () => {
    const parsed = parseInviteLink(inviteLinkInput);
    if (!parsed) {
      setErrorMsg('Paste a full invite link (must include room and key).');
      return;
    }
    setErrorMsg('');
    setInvite(parsed);
    setStep('join');
    window.history.replaceState(null, '', buildJoinUrl(parsed.roomId, parsed.joinKey));
  };

  const handleJoin = () => {
    if (!userId.trim()) { setErrorMsg('Enter your display name.'); return; }

    if (step === 'ready' && createdRoom) {
      onJoin({
        roomId: createdRoom.roomId,
        joinKey: createdRoom.joinKey,
        userId: userId.trim(),
        planName: createdRoom.planName,
        maxParticipants: createdRoom.maxParticipants,
      });
      return;
    }

    if (step === 'join' && invite && inviteMeta) {
      onJoin({
        roomId: invite.roomId,
        joinKey: invite.joinKey,
        userId: userId.trim(),
        planName: inviteMeta.planName || 'Free',
        maxParticipants: inviteMeta.maxParticipants || 30,
      });
    }
  };

  const copyInviteLink = async () => {
    if (!createdRoom?.joinUrl) return;
    try {
      await navigator.clipboard.writeText(createdRoom.joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('Could not copy link.');
    }
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card glass animate-fade-in">
        <div className="animate-float"><span style={{ fontSize: '3.5rem' }}>🎥</span></div>
        <h1 className="lobby-title">KZYS Video Space</h1>
        <p className="lobby-subtitle">Create a room, share the link, join with video</p>

        {errorMsg && (
          <div style={{ color: 'var(--accent-rose)', marginBottom: '16px', fontSize: '0.9rem' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {!isSecureCameraContext() && (
          <div style={{
            marginBottom: '16px', padding: '12px', borderRadius: '10px', fontSize: '0.85rem',
            background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber, #f59e0b)', textAlign: 'left',
          }}>
            Camera needs HTTPS or localhost. On this HTTP IP, use port-forward for testing:
            <code style={{ display: 'block', marginTop: '8px', fontSize: '0.75rem', wordBreak: 'break-all' }}>
              kubectl port-forward svc/kzys-frontend 8080:80
            </code>
            Then open <strong>http://localhost:8080</strong>
          </div>
        )}

        {step === 'home' && (
          <div style={{ textAlign: 'left' }}>
            <div className="form-group">
              <label className="form-label">Your name</label>
              <input className="form-input" placeholder="e.g. Alex" value={userId}
                onChange={(e) => setUserId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()} />
            </div>
            <div className="lobby-sticky-actions">
              <button className="btn-primary" onClick={handleCreateRoom} disabled={loading}>
                {loading ? 'Creating…' : 'Create Room'}
              </button>
            </div>
            <div className="lobby-divider">or join with invite link</div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="form-input" style={{ flex: 1 }} placeholder="Paste invite URL"
                  value={inviteLinkInput} onChange={(e) => setInviteLinkInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasteInvite()} />
                <button className="btn-secondary" style={{ width: 'auto', margin: 0, padding: '0 16px' }}
                  onClick={handlePasteInvite}>Join</button>
              </div>
            </div>
          </div>
        )}

        {step === 'ready' && createdRoom && (
          <>
            <div className="invite-box glass" style={{ marginBottom: '20px', padding: '16px', borderRadius: '12px', textAlign: 'left' }}>
              <label className="form-label">Share invite link</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="form-input" style={{ flex: 1, fontSize: '0.8rem' }} readOnly value={createdRoom.joinUrl} />
                <button className="btn-secondary" style={{ width: 'auto', margin: 0, padding: '0 16px' }}
                  onClick={copyInviteLink}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '8px' }}>
                Room <strong>{createdRoom.roomId}</strong> · up to {createdRoom.maxParticipants} people
              </p>
            </div>
            <button className="btn-primary" onClick={handleJoin}>Start Meeting</button>
            <button className="btn-secondary" style={{ marginTop: '12px' }}
              onClick={() => { setStep('home'); setCreatedRoom(null); setErrorMsg(''); window.history.replaceState(null, '', '/'); }}>
              Back
            </button>
          </>
        )}

        {step === 'join' && (
          <>
            {inviteMeta && (
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Joining <strong style={{ color: 'var(--accent-purple)' }}>{invite.roomId}</strong>
                {' '}({inviteMeta.maxParticipants} max)
              </p>
            )}
            {!inviteMeta && !errorMsg && loading && (
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Checking invite…</p>
            )}
            <div className="form-group">
              <label className="form-label">Your name</label>
              <input className="form-input" placeholder="e.g. Alex" value={userId}
                onChange={(e) => setUserId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()} />
            </div>
            <button className="btn-primary" onClick={handleJoin} disabled={loading || !inviteMeta}>
              Join Meeting
            </button>
            <button className="btn-secondary" style={{ marginTop: '12px' }}
              onClick={() => { setStep('home'); setInvite(null); setErrorMsg(''); window.history.replaceState(null, '', '/'); }}>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Room Component ────────────────────────────────────────────────────────────
function Room({ session, onLeave }) {
  const { roomId, userId, joinKey, planName, maxParticipants } = session;
  const [linkCopied, setLinkCopied] = useState(false);
  const [roomStatus, setRoomStatus] = useState({ participantCount: 1, seatsRemaining: maxParticipants - 1, isFull: false });
  const inviteUrl = buildJoinUrl(roomId, joinKey);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `${getApiBase()}/rooms/status?roomId=${encodeURIComponent(roomId)}&joinKey=${encodeURIComponent(joinKey)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setRoomStatus(data);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [roomId, joinKey]);

  const [activeTab, setActiveTab] = useState('chat');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [peers, setPeers] = useState([]);
  const [messages, setMessages] = useState([
    { from: 'System', text: `Welcome to room ${roomId}! Invite others to join.` }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [mediaReady, setMediaReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const hubConnectionRef = useRef(null);
  const livekitRoomRef = useRef(null);
  const localTracksRef = useRef([]);
  const screenTracksRef = useRef([]);
  const chatEndRef = useRef(null);
  const canvasIntervalsRef = useRef({});

  const addMessage = useCallback((from, text) => {
    setMessages((prev) => [...prev, { from, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
  }, []);

  const cleanUpPeer = useCallback((identity) => {
    if (canvasIntervalsRef.current[identity]) {
      clearInterval(canvasIntervalsRef.current[identity]);
      delete canvasIntervalsRef.current[identity];
    }
    setPeers((prev) => prev.filter((p) => p.connectionId !== identity));
  }, []);

  // ── Local camera preview (before LiveKit connects) ────────────────────────
  useEffect(() => {
    async function startPreview() {
      const showCanvasFallback = (reason) => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d');
        const id = setInterval(() => {
          ctx.fillStyle = '#111428'; ctx.fillRect(0, 0, 640, 360);
          ctx.font = '24px Outfit'; ctx.fillStyle = '#8b5cf6'; ctx.textAlign = 'center';
          ctx.fillText(userId + ' (You)', 320, 160);
          ctx.fillStyle = '#94a3b8'; ctx.font = '16px Outfit';
          ctx.fillText(reason, 320, 200);
          const t = Date.now() * 0.003;
          ctx.beginPath(); ctx.arc(320 + Math.sin(t) * 100, 250 + Math.cos(t * 2) * 20, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#0ea5e9'; ctx.fill();
        }, 33);
        const s = canvas.captureStream(30);
        localStreamRef.current = s;
        if (localVideoRef.current) localVideoRef.current.srcObject = s;
        canvasIntervalsRef.current['local'] = id;
      };

      if (!isSecureCameraContext()) {
        showCanvasFallback('Use localhost for camera');
        addMessage('System', 'Camera blocked on HTTP public IP. Port-forward frontend to localhost for camera access.');
        setMediaReady(true);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch {
        showCanvasFallback('Camera unavailable');
        addMessage('System', 'Camera unavailable. Preview mode active.');
      }
      setMediaReady(true);
    }
    startPreview();
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      Object.values(canvasIntervalsRef.current).forEach(clearInterval);
    };
  }, [userId, addMessage]);

  // ── LiveKit SFU ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mediaReady) return;

    const apiBase = getApiBase();
    const livekitUrl = getLiveKitUrl();

    const room = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
    livekitRoomRef.current = room;

    // Participant connected
    room.on(RoomEvent.ParticipantConnected, (p) => {
      addMessage('System', `${p.name || p.identity} joined.`);
      setPeers((prev) => prev.some((x) => x.connectionId === p.identity) ? prev
        : [...prev, { connectionId: p.identity, userId: p.name || p.identity, stream: null }]);
    });

    // Participant disconnected
    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      addMessage('System', `${p.name || p.identity} left.`);
      cleanUpPeer(p.identity);
    });

    // Remote track received — attach to peer
    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;
      const stream = new MediaStream([track.mediaStreamTrack]);
      const key = track.kind === Track.Kind.Video ? 'videoStream' : 'audioStream';
      setPeers((prev) => {
        const exists = prev.some((p) => p.connectionId === participant.identity);
        const base = exists ? prev : [...prev, { connectionId: participant.identity, userId: participant.name || participant.identity, stream: null }];
        return base.map((p) => p.connectionId === participant.identity ? { ...p, [key]: stream } : p);
      });
    });

    // Remote track removed
    room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      const key = track.kind === Track.Kind.Video ? 'videoStream' : 'audioStream';
      setPeers((prev) => prev.map((p) => p.connectionId === participant.identity ? { ...p, [key]: null } : p));
    });

    // Active speaker
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setActiveSpeaker(speakers.length > 0 ? speakers[0].identity : null);
    });

    // Connection state
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Connected) setConnectionStatus('connected');
      else if (state === ConnectionState.Disconnected) setConnectionStatus('offline');
      else if (state === ConnectionState.Reconnecting) setConnectionStatus('reconnecting');
    });

    const connect = async () => {
      try {
        const [tokenRes, turnRes] = await Promise.all([
          fetch(
            `${apiBase}/livekit/token?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(userId)}&joinKey=${encodeURIComponent(joinKey)}`
          ),
          fetch(`${apiBase}/v1/turn/credentials`).catch(() => null),
        ]);

        if (!tokenRes.ok) {
          const data = await tokenRes.json().catch(() => ({}));
          if (tokenRes.status === 403 && data.requiresUpgrade) {
            throw new Error(`Room full (${data.participantCount}/${data.maxParticipants}). Host must upgrade the ${data.planName} plan.`);
          }
          throw new Error(data.error || `Token request failed: ${tokenRes.status}`);
        }
        const { token } = await tokenRes.json();

        let connectOptions;
        if (turnRes?.ok) {
          const turn = await turnRes.json();
          connectOptions = {
            rtcConfig: {
              iceServers: [{ urls: turn.urls, username: turn.username, credential: turn.credential }],
            },
          };
        } else {
          addMessage('System', 'TURN not configured — WebRTC may fail behind NAT. Run kzys-endpoint-setup job.');
        }

        await room.connect(livekitUrl, token, connectOptions);

        if (isSecureCameraContext()) {
          const tracks = await createLocalTracks({ audio: true, video: { facingMode: 'user' } });
          localTracksRef.current = tracks;
          for (const track of tracks) {
            await room.localParticipant.publishTrack(track);
            if (track.kind === Track.Kind.Video && localVideoRef.current) {
              localVideoRef.current.srcObject = new MediaStream([track.mediaStreamTrack]);
            }
          }
        }

        // Load participants already in the room
        room.remoteParticipants.forEach((p) => {
          setPeers((prev) => prev.some((x) => x.connectionId === p.identity) ? prev
            : [...prev, { connectionId: p.identity, userId: p.name || p.identity, stream: null }]);
          // Attach existing tracks
          p.trackPublications.forEach((pub) => {
            if (!pub.track) return;
            const stream = new MediaStream([pub.track.mediaStreamTrack]);
            const key = pub.kind === Track.Kind.Video ? 'videoStream' : 'audioStream';
            setPeers((prev) => prev.map((x) => x.connectionId === p.identity ? { ...x, [key]: stream } : x));
          });
        });

      } catch (err) {
        console.error('LiveKit connect error:', err);
        setConnectionStatus('offline');
        addMessage('System', `SFU connection failed: ${err.message}`);
      }
    };
    connect();

    return () => {
      localTracksRef.current.forEach((t) => t.stop());
      room.disconnect();
    };
  }, [mediaReady, roomId, userId, joinKey, addMessage, cleanUpPeer]);

  // ── SignalR — chat only ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mediaReady) return;
    const isLocal = isLocalDev();
    const hubUrl = isLocal ? 'http://localhost:8080/meetinghub' : `${window.location.origin}/api/meetinghub`;

    const connection = new signalR.HubConnectionBuilder().withUrl(hubUrl).withAutomaticReconnect().build();
    hubConnectionRef.current = connection;

    connection.on('ReceiveChat', (from, text, timestamp) => {
      setMessages((prev) => [...prev, { from, text, time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    });
    connection.on('PeerJoined', (name) => addMessage('System', `${name} joined.`));
    connection.on('PeerLeft', (name) => addMessage('System', `${name} left.`));
    connection.on('RoomJoined', () => addMessage('System', `Connected as ${userId}`));

    connection.start()
      .then(() => connection.invoke('JoinRoom', roomId, userId, joinKey))
      .catch(() => addMessage('System', 'Chat server unavailable.'));

    return () => connection.stop();
  }, [mediaReady, roomId, userId, joinKey, addMessage]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    if (hubConnectionRef.current?.state === signalR.HubConnectionState.Connected) {
      hubConnectionRef.current.invoke('SendChat', chatInput.trim()).catch(console.error);
    } else {
      addMessage(userId, chatInput.trim());
    }
    setChatInput('');
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const toggleMic = () => {
    localTracksRef.current.filter((t) => t.kind === Track.Kind.Audio).forEach((t) => micOn ? t.mute() : t.unmute());
    if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn(!micOn);
  };

  const toggleCam = () => {
    localTracksRef.current.filter((t) => t.kind === Track.Kind.Video).forEach((t) => camOn ? t.mute() : t.unmute());
    if (localStreamRef.current) localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn(!camOn);
  };

  const stopScreenSharing = useCallback(async () => {
    const room = livekitRoomRef.current;
    for (const track of screenTracksRef.current) {
      if (room) await room.localParticipant.unpublishTrack(track).catch(() => {});
      track.stop();
    }
    screenTracksRef.current = [];
    setScreenSharing(false);
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, []);

  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        const tracks = await createLocalScreenTracks({ audio: false });
        screenTracksRef.current = tracks;
        const room = livekitRoomRef.current;
        for (const track of tracks) {
          if (room) await room.localParticipant.publishTrack(track);
          if (track.kind === Track.Kind.Video && localVideoRef.current) {
            localVideoRef.current.srcObject = new MediaStream([track.mediaStreamTrack]);
          }
          track.mediaStreamTrack.onended = stopScreenSharing;
        }
        setScreenSharing(true);
      } catch {}
    } else {
      stopScreenSharing();
    }
  };

  const statusLabel = connectionStatus === 'connected' ? 'Connected'
    : connectionStatus === 'offline' ? 'Offline'
    : connectionStatus === 'reconnecting' ? 'Reconnecting...'
    : mediaReady ? 'Connecting' : 'Starting camera';

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="room-container">
      <header className="room-header glass">
        <div className="room-info">
          <span style={{ fontSize: '1.5rem' }}>⚡</span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.25rem' }}>KZYS Live Portal</h2>
          <div className="room-badge">{roomId}</div>
          <div className="room-badge" style={{ background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)' }}>
            {planName} · {roomStatus.participantCount ?? peers.length + 1}/{maxParticipants}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary" style={{ margin: 0, padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              } catch { /* ignore */ }
            }}>
            🔗 {linkCopied ? 'Copied!' : 'Copy invite'}
          </button>
        </div>
      </header>

      <div className="room-main">
        <div className="video-area">
          <div className="grid-layout">
            <div className={`video-tile ${activeSpeaker === 'local' ? 'active-speaker' : ''}`}>
              <video ref={localVideoRef} autoPlay muted playsInline className="video-feed"
                style={{ opacity: camOn ? 1 : 0, transition: 'opacity 0.3s' }} />
              {!camOn && <div style={{ position: 'absolute' }} className="avatar-placeholder">{userId.substring(0, 2).toUpperCase()}</div>}
              <div className="video-overlay-info">
                <span className={`audio-indicator ${!micOn ? 'muted' : ''}`} />
                <span>{userId} (You)</span>
              </div>
            </div>
            {peers.map((peer) => (
              <RemoteVideoTile key={peer.connectionId} peer={peer} isActiveSpeaker={activeSpeaker === peer.connectionId} />
            ))}
          </div>
        </div>

        {activeTab && (
          <aside className="side-drawer glass">
            <div className="drawer-header">
              <h3 className="drawer-title">{activeTab === 'chat' ? '💬 Live Discussion' : `👥 Participants (${peers.length + 1})`}</h3>
              <button className="drawer-close" onClick={() => setActiveTab(null)}>✕</button>
            </div>
            <div className="drawer-content">
              {activeTab === 'chat' ? (
                <div className="message-list">
                  {messages.map((m, idx) => {
                    if (m.from === 'System') return <div key={idx} className="system-message">{m.text}</div>;
                    const isMe = m.from === userId;
                    return (
                      <div key={idx} className="message-item">
                        <div className="message-meta">
                          <span className={`message-sender ${isMe ? 'me' : ''}`}>{m.from}</span>
                          <span className="message-time">{m.time}</span>
                        </div>
                        <div className={`message-bubble ${isMe ? 'me' : ''}`}>{m.text}</div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
              ) : (
                <div className="participant-list">
                  <div className="participant-item">
                    <div className="participant-name-avatar">
                      <div className="participant-avatar" style={{ background: 'var(--accent-purple)' }}>{userId[0].toUpperCase()}</div>
                      <span className="participant-name">{userId} (You)</span>
                    </div>
                    <div className="participant-controls"><span>{micOn ? '🎤' : '🔇'}</span><span>{camOn ? '📷' : '🚫'}</span></div>
                  </div>
                  {peers.map((peer) => (
                    <div key={peer.connectionId} className="participant-item animate-fade-in">
                      <div className="participant-name-avatar">
                        <div className="participant-avatar">{peer.userId[0].toUpperCase()}</div>
                        <span className="participant-name">{peer.userId}</span>
                      </div>
                      <div className="participant-controls"><span>🎤</span><span>📷</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {activeTab === 'chat' && (
              <div className="chat-input-container">
                <input className="chat-input" placeholder="Type a message..." value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendChat()} />
                <button className="chat-send-btn" onClick={handleSendChat}>Send</button>
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="control-bar glass">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Live Session:{' '}
            <span style={{ color: connectionStatus === 'connected' ? 'var(--accent-emerald)' : connectionStatus === 'offline' ? 'var(--accent-rose)' : connectionStatus === 'reconnecting' ? 'var(--accent-blue)' : 'var(--text-secondary)', fontWeight: 600 }}>
              {statusLabel}
            </span>
          </span>
        </div>
        <div className="ctrl-group">
          <button className={`ctrl-btn ${!micOn ? 'danger' : 'active'}`} onClick={toggleMic} title={micOn ? 'Mute Mic' : 'Unmute Mic'}>{micOn ? '🎤' : '🔇'}</button>
          <button className={`ctrl-btn ${!camOn ? 'danger' : 'active'}`} onClick={toggleCam} title={camOn ? 'Turn Camera Off' : 'Turn Camera On'}>{camOn ? '📷' : '🚫'}</button>
          <button className={`ctrl-btn ${screenSharing ? 'active' : ''}`} onClick={toggleScreenShare} title={screenSharing ? 'Stop Presenting' : 'Share Screen'}>🖥️</button>
          <button className="ctrl-btn danger" onClick={onLeave} title="Leave Meeting">🛑</button>
        </div>
        <div className="ctrl-group">
          <button className={`ctrl-btn ${activeTab === 'participants' ? 'active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'participants' ? null : 'participants')} title="Show Participants">👥</button>
          <button className={`ctrl-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')} title="Show Chat">💬</button>
        </div>
      </footer>
    </div>
  );
}

// ── Remote Video Tile ─────────────────────────────────────────────────────────
function RemoteVideoTile({ peer, isActiveSpeaker }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && (peer.videoStream || peer.stream)) {
      videoRef.current.srcObject = peer.videoStream || peer.stream;
      videoRef.current.play().catch(() => {});
    }
  }, [peer.videoStream, peer.stream]);

  useEffect(() => {
    if (audioRef.current && peer.audioStream) {
      audioRef.current.srcObject = peer.audioStream;
      audioRef.current.play().catch(() => {});
    }
  }, [peer.audioStream]);

  const hasVideo = peer.videoStream || peer.stream;
  const initials = peer.userId.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className={`video-tile animate-fade-in ${isActiveSpeaker ? 'active-speaker' : ''}`}>
      <video ref={videoRef} autoPlay playsInline className="video-feed" style={{ opacity: hasVideo ? 1 : 0 }} />
      <audio ref={audioRef} autoPlay />
      {!hasVideo && <div className="avatar-placeholder">{initials}</div>}
      <div className="video-overlay-info">
        <span className="audio-indicator" />
        <span>{peer.userId}</span>
      </div>
    </div>
  );
}
