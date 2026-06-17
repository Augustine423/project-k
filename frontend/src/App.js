import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import {
  Room as LiveKitRoom,
  RoomEvent,
  ConnectionState,
  Track,
  createLocalTracks
} from 'livekit-client';

// ── KZYS Meeting Room App ─────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState(null); // { roomId, userId, livekitUrl, livekitToken }

  if (session) {
    return <Room session={session} onLeave={() => setSession(null)} />;
  }
  return <Lobby onJoin={setSession} />;
}

// ── Lobby Component ───────────────────────────────────────────────────────────
function Lobby({ onJoin }) {
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const generateRoomId = () => {
    const id = 'room-' + Math.random().toString(36).substring(2, 8);
    setRoomId(id);
    setErrorMsg('');
  };

  const handleJoin = () => {
    if (!userId.trim()) {
      setErrorMsg('Please enter your name.');
      return;
    }
    if (!roomId.trim()) {
      setErrorMsg('Please enter or generate a Room ID.');
      return;
    }
    onJoin({ roomId: roomId.trim(), userId: userId.trim() });
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card glass animate-fade-in">
        <div className="animate-float">
          <span style={{ fontSize: '3.5rem' }}>🎥</span>
        </div>
        <h1 className="lobby-title">KZYS Video Space</h1>
        <p className="lobby-subtitle">Next-gen low latency video conferencing</p>

        {errorMsg && (
          <div style={{ color: 'var(--accent-rose)', marginBottom: '16px', fontSize: '0.9rem', fontWeight: 500 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Display Name</label>
          <input
            className="form-input"
            placeholder="e.g. John Doe"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '32px' }}>
          <label className="form-label">Room ID</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              placeholder="e.g. room-xyz"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              className="btn-secondary"
              style={{ width: 'auto', margin: 0, padding: '0 16px', borderRadius: '12px' }}
              onClick={generateRoomId}
              title="Generate random room ID"
            >
              🎲
            </button>
          </div>
        </div>

        <button className="btn-primary" onClick={handleJoin}>
          Enter Conference
        </button>
      </div>
    </div>
  );
}

// ── Room Component ────────────────────────────────────────────────────────────
function Room({ session, onLeave }) {
  const { roomId, userId } = session;

  // UI States — identical to original
  const [activeTab, setActiveTab] = useState('chat');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [peers, setPeers] = useState([]); // { connectionId, userId, stream, isMuted, isCamOff }
  const [messages, setMessages] = useState([
    { from: 'System', text: `Welcome to room ${roomId}! Invite others to join.` }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [simulationMode, setSimulationMode] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  // References
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const hubConnectionRef = useRef(null);   // SignalR — chat only
  const livekitRoomRef = useRef(null);     // LiveKit — all media
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

  // ── Local media setup (same as original) ─────────────────────────────────
  useEffect(() => {
    async function startMedia() {
      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        addMessage('System', 'Camera and microphone need HTTPS on phones and tablets.');
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setMediaReady(true);
      } catch (err) {
        console.warn('Camera/mic unavailable, using canvas fallback', err);
        addMessage('System', 'Camera or microphone unavailable. Preview mode is active without live audio.');
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d');
        const intervalId = setInterval(() => {
          ctx.fillStyle = '#111428'; ctx.fillRect(0, 0, 640, 360);
          ctx.font = '24px Outfit'; ctx.fillStyle = '#8b5cf6'; ctx.textAlign = 'center';
          ctx.fillText(userId + ' (You)', 320, 160);
          ctx.fillStyle = '#94a3b8'; ctx.font = '16px Outfit';
          ctx.fillText('Camera preview simulation active', 320, 200);
          const time = Date.now() * 0.003;
          ctx.beginPath(); ctx.arc(320 + Math.sin(time) * 100, 250 + Math.cos(time * 2) * 20, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#0ea5e9'; ctx.fill();
        }, 33);
        const canvasStream = canvas.captureStream(30);
        localStreamRef.current = canvasStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = canvasStream;
        canvasIntervalsRef.current['local'] = intervalId;
        setMediaReady(true);
      }
    }
    startMedia();
    return () => {
      setMediaReady(false);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
      Object.values(canvasIntervalsRef.current).forEach(clearInterval);
    };
  }, [userId, addMessage]);

  // ── LiveKit SFU connection ────────────────────────────────────────────────
  useEffect(() => {
    if (!mediaReady) return;

    const livekitUrl = process.env.REACT_APP_LIVEKIT_URL || 'ws://localhost:7880';
    const tokenEndpoint = process.env.REACT_APP_LIVEKIT_TOKEN_ENDPOINT || 'http://localhost:8080/api/livekit/token';

    const room = new LiveKitRoom({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { dtx: true }
    });
    livekitRoomRef.current = room;

    // Helper: attach already-published tracks from a participant who was in the room before we joined
    const attachExistingTracks = (participant) => {
      participant.trackPublications.forEach((pub) => {
        if (pub.track && pub.kind === Track.Kind.Video) {
          const videoStream = new MediaStream([pub.track.mediaStreamTrack]);
          setPeers((prev) => prev.map((p) =>
            p.connectionId === participant.identity ? { ...p, videoStream } : p
          ));
        } else if (pub.track && pub.kind === Track.Kind.Audio) {
          const audioStream = new MediaStream([pub.track.mediaStreamTrack]);
          setPeers((prev) => prev.map((p) =>
            p.connectionId === participant.identity ? { ...p, audioStream } : p
          ));
        }
      });
    };

    room.on(RoomEvent.ParticipantConnected, (participant) => {
      addMessage('System', `${participant.name || participant.identity} joined the conference.`);
      setPeers((prev) => {
        if (prev.some((p) => p.connectionId === participant.identity)) return prev;
        return [...prev, { connectionId: participant.identity, userId: participant.name || participant.identity, stream: null, isMuted: true, isCamOff: true }];
      });
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      addMessage('System', `${participant.name || participant.identity} left the conference.`);
      cleanUpPeer(participant.identity);
    });

    // Fix Bug 3: ensure peer exists before attaching stream
    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      const stream = new MediaStream([track.mediaStreamTrack]);
      setPeers((prev) => {
        // Ensure peer entry exists first
        const exists = prev.some((p) => p.connectionId === participant.identity);
        const base = exists ? prev : [...prev, { connectionId: participant.identity, userId: participant.name || participant.identity, stream: null, isMuted: true, isCamOff: true }];
        return base.map((p) =>
          p.connectionId === participant.identity
            ? { ...p, ...(track.kind === Track.Kind.Video ? { videoStream: stream } : { audioStream: stream }) }
            : p
        );
      });
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      setPeers((prev) => prev.map((p) =>
        p.connectionId === participant.identity
          ? { ...p, ...(track.kind === Track.Kind.Video ? { videoStream: null } : { audioStream: null }) }
          : p
      ));
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setActiveSpeaker(speakers.length > 0 ? speakers[0].identity : null);
    });

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Connected) setConnectionStatus('connected');
      else if (state === ConnectionState.Disconnected) setConnectionStatus('offline');
    });

    const connect = async () => {
      try {
        // Fix Bug 1: fetch a per-user token from the backend
        const res = await fetch(`${tokenEndpoint}?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(userId)}`);
        if (!res.ok) throw new Error(`Token endpoint returned ${res.status}`);
        const { token } = await res.json();

        await room.connect(livekitUrl, token);

        // Fix Bug 2: use createLocalTracks so LiveKit wraps them correctly
        const tracks = await createLocalTracks({ audio: true, video: { facingMode: 'user' } });
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track);
        }

        // Fix Bug 4: attach already-published tracks from participants already in the room
        room.remoteParticipants.forEach((p) => {
          setPeers((prev) => {
            if (prev.some((x) => x.connectionId === p.identity)) return prev;
            return [...prev, { connectionId: p.identity, userId: p.name || p.identity, stream: null, isMuted: true, isCamOff: true }];
          });
          attachExistingTracks(p);
        });
      } catch (err) {
        console.error('LiveKit connect failed:', err);
        setConnectionStatus('offline');
        addMessage('System', `SFU connection failed: ${err.message}. Running in local preview mode.`);
      }
    };
    connect();

    return () => { room.disconnect(); };
  }, [mediaReady, roomId, userId, addMessage, cleanUpPeer]);

  // ── SignalR — chat only (same as original) ────────────────────────────────
  useEffect(() => {
    if (!mediaReady) return;

    const isLocalDev = window.location.hostname === 'localhost' && window.location.port === '3000';
    const hubUrl = isLocalDev ? 'http://localhost:8080/meetinghub' : `${window.location.origin}/api/meetinghub`;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .build();

    hubConnectionRef.current = connection;

    connection.on('RoomJoined', (_joinedRoomId, _existingPeers) => {
      addMessage('System', `Successfully connected as user: ${userId}`);
    });

    connection.on('ReceiveChat', (senderUserId, text, timestamp) => {
      setMessages((prev) => [...prev, {
        from: senderUserId,
        text,
        time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    });

    connection.on('PeerJoined', (joinedUserId) => {
      // Presence info only — media handled by LiveKit
      addMessage('System', `${joinedUserId} joined.`);
    });

    connection.on('PeerLeft', (leftUserId) => {
      addMessage('System', `${leftUserId} left the conference.`);
    });

    connection.start()
      .then(() => connection.invoke('JoinRoom', roomId, userId))
      .catch((err) => {
        console.error('SignalR failed:', err);
        addMessage('System', 'Could not connect to chat server.');
      });

    return () => { connection.stop(); };
  }, [mediaReady, roomId, userId, addMessage]);

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mic/cam toggle — client-side track enable/disable, no backend call
  const toggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
      setMicOn(!micOn);
    }
  };

  const toggleCam = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
      setCamOn(!camOn);
    }
  };

  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenSharing(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getVideoTracks()[0].onended = stopScreenSharing;
        // Replace video track in LiveKit if connected
        if (livekitRoomRef.current) {
          await livekitRoomRef.current.localParticipant.publishTrack(stream.getVideoTracks()[0]);
        }
      } catch (err) {
        console.warn('Screen share canceled', err);
      }
    } else {
      stopScreenSharing();
    }
  };

  const stopScreenSharing = () => {
    setScreenSharing(false);
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  };

  // ── Simulation Mode — untouched from original ─────────────────────────────
  const toggleSimulation = () => {
    if (!simulationMode) {
      const mockUsers = [
        { id: 'sim-1', name: 'Alex' },
        { id: 'sim-2', name: 'Jordan' },
        { id: 'sim-3', name: 'Sam' }
      ];
      mockUsers.forEach((user) => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d');
        const colors = ['#8b5cf6', '#0ea5e9', '#ec4899'];
        const userColor = colors[Math.floor(Math.random() * colors.length)];
        const intervalId = setInterval(() => {
          ctx.fillStyle = '#0f1122'; ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = userColor + '33'; ctx.beginPath();
          const pulse = Math.sin(Date.now() * 0.002) * 20;
          ctx.arc(320, 150, 70 + pulse, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = userColor; ctx.beginPath();
          ctx.arc(320, 150, 60, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px Outfit';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(user.name.split(' ').map((n) => n[0]).join(''), 320, 150);
          ctx.fillStyle = '#ffffff'; ctx.font = '20px Outfit';
          ctx.fillText(user.name, 320, 260);
        }, 100);
        const simulatedStream = canvas.captureStream(30);
        canvasIntervalsRef.current[user.id] = intervalId;
        setPeers((prev) => [...prev, { connectionId: user.id, userId: user.name, stream: simulatedStream }]);
        addMessage('System', `${user.name} joined the preview.`);
      });
      setTimeout(() => {
        setMessages((prev) => [...prev, {
          from: 'Alex',
          text: 'Looks great! The room layout is working well.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      }, 3000);
      setSimulationMode(true);
    } else {
      setPeers((prev) => prev.filter((p) => !p.connectionId.startsWith('sim-')));
      Object.keys(canvasIntervalsRef.current).forEach((key) => {
        if (key.startsWith('sim-')) { clearInterval(canvasIntervalsRef.current[key]); delete canvasIntervalsRef.current[key]; }
      });
      setSimulationMode(false);
      addMessage('System', 'Preview participants removed.');
    }
  };

  const statusLabel =
    connectionStatus === 'connected' ? 'Connected'
    : connectionStatus === 'offline' ? 'Offline'
    : mediaReady ? 'Connecting' : 'Starting camera';

  // ── JSX — identical to original ───────────────────────────────────────────
  return (
    <div className="room-container">
      <header className="room-header glass">
        <div className="room-info">
          <span style={{ fontSize: '1.5rem' }}>⚡</span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.25rem' }}>KZYS Live Portal</h2>
          <div className="room-badge">{roomId}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn-secondary ${simulationMode ? 'active' : ''}`}
            onClick={toggleSimulation}
            style={{ margin: 0, padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            👾 {simulationMode ? 'Stop Preview' : 'Preview Layout'}
          </button>
        </div>
      </header>

      <div className="room-main">
        <div className="video-area">
          <div className="grid-layout">
            <div className={`video-tile ${activeSpeaker === 'local' ? 'active-speaker' : ''}`}>
              <video ref={localVideoRef} autoPlay muted playsInline className="video-feed"
                style={{ opacity: camOn ? 1 : 0, transition: 'opacity 0.3s' }} />
              {!camOn && (
                <div style={{ position: 'absolute' }} className="avatar-placeholder">
                  {userId.substring(0, 2).toUpperCase()}
                </div>
              )}
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
              <h3 className="drawer-title">
                {activeTab === 'chat' ? '💬 Live Discussion' : `👥 Participants (${peers.length + 1})`}
              </h3>
              <button className="drawer-close" onClick={() => setActiveTab(null)}>✕</button>
            </div>

            <div className="drawer-content">
              {activeTab === 'chat' ? (
                <div className="message-list">
                  {messages.map((m, idx) => {
                    const isMe = m.from === userId;
                    const isSystem = m.from === 'System';
                    if (isSystem) return <div key={idx} className="system-message">{m.text}</div>;
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
                      <div className="participant-avatar" style={{ background: 'var(--accent-purple)' }}>
                        {userId[0].toUpperCase()}
                      </div>
                      <span className="participant-name">{userId} (You)</span>
                    </div>
                    <div className="participant-controls">
                      <span>{micOn ? '🎤' : '🔇'}</span>
                      <span>{camOn ? '📷' : '🚫'}</span>
                    </div>
                  </div>
                  {peers.map((peer) => (
                    <div key={peer.connectionId} className="participant-item animate-fade-in">
                      <div className="participant-name-avatar">
                        <div className="participant-avatar">{peer.userId[0].toUpperCase()}</div>
                        <span className="participant-name">{peer.userId}</span>
                      </div>
                      <div className="participant-controls">
                        <span>🎤</span><span>📷</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {activeTab === 'chat' && (
              <div className="chat-input-container">
                <input
                  className="chat-input"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                />
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
            <span style={{
              color: connectionStatus === 'connected' ? 'var(--accent-emerald)'
                : connectionStatus === 'offline' ? 'var(--accent-rose)' : 'var(--accent-sky)',
              fontWeight: 600
            }}>
              {statusLabel}
            </span>
          </span>
        </div>

        <div className="ctrl-group">
          <button className={`ctrl-btn ${!micOn ? 'danger' : 'active'}`} onClick={toggleMic} title={micOn ? 'Mute Mic' : 'Unmute Mic'}>
            {micOn ? '🎤' : '🔇'}
          </button>
          <button className={`ctrl-btn ${!camOn ? 'danger' : 'active'}`} onClick={toggleCam} title={camOn ? 'Turn Camera Off' : 'Turn Camera On'}>
            {camOn ? '📷' : '🚫'}
          </button>
          <button className={`ctrl-btn ${screenSharing ? 'active' : ''}`} onClick={toggleScreenShare} title={screenSharing ? 'Stop Presenting' : 'Share Screen'}>
            🖥️
          </button>
          <button className="ctrl-btn danger" onClick={onLeave} title="Leave Meeting">🛑</button>
        </div>

        <div className="ctrl-group">
          <button className={`ctrl-btn ${activeTab === 'participants' ? 'active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'participants' ? null : 'participants')} title="Show Participants">
            👥
          </button>
          <button className={`ctrl-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')} title="Show Chat">
            💬
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Remote Video Tile — unchanged from original ───────────────────────────────
function RemoteVideoTile({ peer, isActiveSpeaker }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && peer.videoStream) {
      videoRef.current.srcObject = peer.videoStream;
      videoRef.current.play().catch((err) => console.warn('Video playback blocked', err));
    }
  }, [peer.videoStream]);

  useEffect(() => {
    if (audioRef.current && peer.audioStream) {
      audioRef.current.srcObject = peer.audioStream;
      audioRef.current.play().catch((err) => console.warn('Audio playback blocked', err));
    }
  }, [peer.audioStream]);

  // simulation mode still uses peer.stream (canvas stream)
  useEffect(() => {
    if (videoRef.current && peer.stream && !peer.videoStream) {
      videoRef.current.srcObject = peer.stream;
      videoRef.current.play().catch((err) => console.warn('Sim playback blocked', err));
    }
  }, [peer.stream, peer.videoStream]);

  const initials = peer.userId.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const hasVideo = peer.videoStream || peer.stream;

  return (
    <div className={`video-tile animate-fade-in ${isActiveSpeaker ? 'active-speaker' : ''}`}>
      <video ref={videoRef} autoPlay playsInline className="video-feed"
        style={{ opacity: hasVideo ? 1 : 0 }} />
      <audio ref={audioRef} autoPlay />
      {!hasVideo && <div className="avatar-placeholder">{initials}</div>}
      <div className="video-overlay-info">
        <span className="audio-indicator" />
        <span>{peer.userId}</span>
      </div>
    </div>
  );
}
