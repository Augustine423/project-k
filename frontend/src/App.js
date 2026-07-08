import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import { useJanusVideoRoom } from './useJanusVideoRoom';

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

function getJanusServerUrl() {
  const isLocal = isLocalDev();
  const proto = isLocal ? 'ws' : (window.location.protocol === 'https:' ? 'wss' : 'ws');
  return process.env.REACT_APP_JANUS_URL || (
    isLocal ? 'ws://localhost:8188' : `${proto}://${window.location.host}/janus-ws`
  );
}

// â”€â”€ KZYS Meeting Room App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Lobby â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        <div className="animate-float"><span style={{ fontSize: '3.5rem' }}>ðŸŽ¥</span></div>
        <h1 className="lobby-title">KZYS Video Space</h1>
        <p className="lobby-subtitle">Create a room, share the link, join with video</p>

        {errorMsg && (
          <div style={{ color: 'var(--accent-rose)', marginBottom: '16px', fontSize: '0.9rem' }}>
            âš ï¸ {errorMsg}
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
                {loading ? 'Creatingâ€¦' : 'Create Room'}
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
                Room <strong>{createdRoom.roomId}</strong> Â· up to {createdRoom.maxParticipants} people
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
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Checking inviteâ€¦</p>
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

// â”€â”€ Room Component (Janus VideoRoom SFU) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Room({ session, onLeave }) {
  const { roomId, userId, joinKey, planName, maxParticipants } = session;
  const [linkCopied, setLinkCopied] = useState(false);
  const [roomStatus, setRoomStatus] = useState({ participantCount: 1, seatsRemaining: maxParticipants - 1, isFull: false });
  const [janusConfig, setJanusConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const inviteUrl = buildJoinUrl(roomId, joinKey);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${getApiBase()}/janus/config?roomId=${encodeURIComponent(roomId)}&joinKey=${encodeURIComponent(joinKey)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Janus config failed: ${res.status}`);
        if (!cancelled) setJanusConfig(data);
      } catch (err) {
        if (!cancelled) setConfigError(err.message || 'Failed to load Janus config.');
      }
    })();
    return () => { cancelled = true; };
  }, [roomId, joinKey]);

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

  const {
    localVideoRef,
    peers,
    connectionStatus,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    error: janusError,
  } = useJanusVideoRoom({
    janusRoomId: janusConfig?.janusRoomId,
    userId,
    server: janusConfig?.server || getJanusServerUrl(),
    iceServers: janusConfig?.iceServers,
    enabled: Boolean(janusConfig),
  });

  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([
    { from: 'System', text: `Welcome to room ${roomId}! Invite others to join.` },
  ]);
  const [chatInput, setChatInput] = useState('');
  const hubConnectionRef = useRef(null);
  const chatEndRef = useRef(null);

  const addMessage = useCallback((from, text) => {
    setMessages((prev) => [...prev, {
      from, text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
  }, []);

  useEffect(() => {
    if (janusError) addMessage('System', `Video error: ${janusError}`);
  }, [janusError, addMessage]);

  useEffect(() => {
    if (configError) addMessage('System', configError);
  }, [configError, addMessage]);

  useEffect(() => {
    if (!janusConfig) return;
    const isLocal = isLocalDev();
    const hubUrl = isLocal ? 'http://localhost:8080/meetinghub' : `${window.location.origin}/api/meetinghub`;
    const connection = new signalR.HubConnectionBuilder().withUrl(hubUrl).withAutomaticReconnect().build();
    hubConnectionRef.current = connection;

    connection.on('ReceiveChat', (from, text, timestamp) => {
      setMessages((prev) => [...prev, {
        from, text,
        time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    });
    connection.on('PeerJoined', (name) => addMessage('System', `${name} joined chat.`));
    connection.on('PeerLeft', (name) => addMessage('System', `${name} left chat.`));
    connection.on('RoomJoined', () => addMessage('System', `Connected as ${userId}`));

    connection.start()
      .then(() => connection.invoke('JoinRoom', roomId, userId, joinKey))
      .catch(() => addMessage('System', 'Chat server unavailable.'));

    return () => connection.stop();
  }, [janusConfig, roomId, userId, joinKey, addMessage]);

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

  const statusLabel = connectionStatus === 'connected' ? 'Connected'
    : connectionStatus === 'offline' ? 'Offline'
    : janusConfig ? 'Connecting' : 'Loading Janusâ€¦';

  return (
    <div className="room-container">
      <header className="room-header glass">
        <div className="room-info">
          <span style={{ fontSize: '1.5rem' }}>âš¡</span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.25rem' }}>KZYS Live Portal</h2>
          <div className="room-badge">{roomId}</div>
          <div className="room-badge" style={{ background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)' }}>
            {planName} Â· {roomStatus.participantCount ?? peers.length + 1}/{maxParticipants}
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
            ðŸ”— {linkCopied ? 'Copied!' : 'Copy invite'}
          </button>
        </div>
      </header>

      <div className="room-main">
        <div className="video-area">
          <div className="grid-layout">
            <div className="video-tile">
              <video ref={localVideoRef} autoPlay muted playsInline className="video-feed"
                style={{ opacity: camOn ? 1 : 0, transition: 'opacity 0.3s' }} />
              {!camOn && <div style={{ position: 'absolute' }} className="avatar-placeholder">{userId.substring(0, 2).toUpperCase()}</div>}
              <div className="video-overlay-info">
                <span className={`audio-indicator ${!micOn ? 'muted' : ''}`} />
                <span>{userId} (You)</span>
              </div>
            </div>
            {peers.map((peer) => (
              <RemoteVideoTile key={peer.id} peer={peer} />
            ))}
          </div>
        </div>

        {activeTab && (
          <aside className="side-drawer glass">
            <div className="drawer-header">
              <h3 className="drawer-title">{activeTab === 'chat' ? 'ðŸ’¬ Live Discussion' : `ðŸ‘¥ Participants (${peers.length + 1})`}</h3>
              <button className="drawer-close" onClick={() => setActiveTab(null)}>âœ•</button>
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
                      <div className="participant-avatar">{userId[0].toUpperCase()}</div>
                      <span className="participant-name">{userId} (You)</span>
                    </div>
                    <div className="participant-controls"><span>{micOn ? 'ðŸŽ¤' : 'ðŸ”‡'}</span><span>{camOn ? 'ðŸ“·' : 'ðŸš«'}</span></div>
                  </div>
                  {peers.map((peer) => (
                    <div key={peer.id} className="participant-item animate-fade-in">
                      <div className="participant-name-avatar">
                        <div className="participant-avatar">{peer.userId[0].toUpperCase()}</div>
                        <span className="participant-name">{peer.userId}</span>
                      </div>
                      <div className="participant-controls"><span>ðŸŽ¤</span><span>ðŸ“·</span></div>
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
            Janus VideoRoom:{' '}
            <span style={{
              color: connectionStatus === 'connected' ? 'var(--accent-emerald)' : connectionStatus === 'offline' ? 'var(--accent-rose)' : 'var(--accent-blue)',
              fontWeight: 600,
            }}>{statusLabel}</span>
          </span>
        </div>
        <div className="ctrl-group">
          <button className={`ctrl-btn ${!micOn ? 'danger' : 'active'}`} onClick={toggleMic}>{micOn ? 'ðŸŽ¤' : 'ðŸ”‡'}</button>
          <button className={`ctrl-btn ${!camOn ? 'danger' : 'active'}`} onClick={toggleCam}>{camOn ? 'ðŸ“·' : 'ðŸš«'}</button>
          <button className="ctrl-btn danger" onClick={onLeave} title="Leave Meeting">ðŸ›‘</button>
        </div>
        <div className="ctrl-group">
          <button className={`ctrl-btn ${activeTab === 'participants' ? 'active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'participants' ? null : 'participants')}>ðŸ‘¥</button>
          <button className={`ctrl-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')}>ðŸ’¬</button>
        </div>
      </footer>
    </div>
  );
}

// ── Remote Video Tile ─────────────────────────────────────────────────────────
function RemoteVideoTile({ peer }) {
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
    <div className="video-tile animate-fade-in">
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
