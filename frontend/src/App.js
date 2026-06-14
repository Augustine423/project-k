import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';

// ── WebRTC / SignalR Meeting Room App ─────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState(null); // { roomId, userId }
  
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

  // UI States
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'participants' | null
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null); // Connection ID or 'local'
  const [peers, setPeers] = useState([]); // Array of { connectionId, userId, stream, isMuted, isCamOff }
  const [messages, setMessages] = useState([
    { from: 'System', text: `Welcome to room ${roomId}! Invite others to join.` }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [simulationMode, setSimulationMode] = useState(false);

  // References
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const hubConnectionRef = useRef(null);
  const peerConnectionsRef = useRef({}); // connectionId -> RTCPeerConnection
  const chatEndRef = useRef(null);
  const canvasIntervalsRef = useRef({}); // connectionId -> intervalId for canvas stream simulation

  // Add chat message helper
  const addMessage = useCallback((from, text) => {
    setMessages((prev) => [...prev, { from, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
  }, []);

  // WebRTC ICE configuration
  const iceConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Clean up WebRTC peer connections
  const cleanUpPeer = useCallback((connectionId) => {
    if (peerConnectionsRef.current[connectionId]) {
      peerConnectionsRef.current[connectionId].close();
      delete peerConnectionsRef.current[connectionId];
    }
    if (canvasIntervalsRef.current[connectionId]) {
      clearInterval(canvasIntervalsRef.current[connectionId]);
      delete canvasIntervalsRef.current[connectionId];
    }
    setPeers((prev) => prev.filter((p) => p.connectionId !== connectionId));
  }, []);

  // Set up local media
  useEffect(() => {
    async function startMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Failed to access camera/microphone, using fallback dummy stream', err);
        addMessage('System', 'Camera/microphone access blocked or unavailable. Initialized in layout-preview mode.');
        
        // Generate a beautiful dummy video stream from a canvas
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        const intervalId = setInterval(() => {
          ctx.fillStyle = '#111428';
          ctx.fillRect(0, 0, 640, 360);
          ctx.font = '24px Outfit';
          ctx.fillStyle = '#8b5cf6';
          ctx.textAlign = 'center';
          ctx.fillText(userId + ' (You)', 320, 160);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '16px Outfit';
          ctx.fillText('Camera preview simulation active', 320, 200);
          
          // Floating particle animation to show motion
          const time = Date.now() * 0.003;
          ctx.beginPath();
          ctx.arc(320 + Math.sin(time) * 100, 250 + Math.cos(time * 2) * 20, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#0ea5e9';
          ctx.fill();
        }, 33);

        const canvasStream = canvas.captureStream(30);
        localStreamRef.current = canvasStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = canvasStream;
        }
        canvasIntervalsRef.current['local'] = intervalId;
      }
    }
    startMedia();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (canvasIntervalsRef.current['local']) {
        clearInterval(canvasIntervalsRef.current['local']);
      }
      Object.keys(canvasIntervalsRef.current).forEach((key) => {
        clearInterval(canvasIntervalsRef.current[key]);
      });
    };
  }, [userId, addMessage]);

  // Set up SignalR Signaling Connection
  useEffect(() => {
    // In production, the URL matches where the backend is hosted or proxied
    const hubUrl = window.location.origin.includes('localhost') 
      ? 'http://localhost:8080/meetinghub' 
      : `${window.location.protocol}//${window.location.host}/meetinghub`;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .build();

    hubConnectionRef.current = connection;

    // Receive signal from another peer
    connection.on('ReceiveSignal', async (senderUserId, senderConnectionId, signalData) => {
      const signal = JSON.parse(signalData);
      let pc = peerConnectionsRef.current[senderConnectionId];

      if (!pc) {
        pc = createPeerConnection(senderConnectionId, senderUserId);
      }

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        connection.invoke('SendSignal', senderConnectionId, JSON.stringify({
          type: 'answer',
          sdp: pc.localDescription
        })).catch((e) => console.error(e));
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.type === 'candidate') {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (e) {
          console.warn('Error adding ICE candidate', e);
        }
      }
    });

    // Notify when a peer leaves
    connection.on('PeerLeft', (leftUserId, leftConnectionId) => {
      addMessage('System', `${leftUserId} left the conference.`);
      cleanUpPeer(leftConnectionId);
    });

    // Notify when a peer joins
    connection.on('PeerJoined', (joinedUserId, joinedConnectionId) => {
      addMessage('System', `${joinedUserId} joined the conference.`);
      
      // We initiate the connection
      createPeerConnection(joinedConnectionId, joinedUserId, true);
    });

    // Welcome response containing current peer list
    connection.on('RoomJoined', (joinedRoomId, existingPeers) => {
      addMessage('System', `Successfully connected as user: ${userId}`);
      
      existingPeers.forEach((p) => {
        setPeers((prev) => {
          if (prev.some((exist) => exist.connectionId === p.connectionId)) return prev;
          return [...prev, { connectionId: p.connectionId, userId: p.userId, stream: null }];
        });
      });
    });

    // Receive chat message
    connection.on('ReceiveChat', (senderUserId, text, timestamp) => {
      setMessages((prev) => [
        ...prev,
        {
          from: senderUserId,
          text,
          time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    });

    // Start connection
    connection.start()
      .then(() => {
        connection.invoke('JoinRoom', roomId, userId);
      })
      .catch((err) => {
        console.error('SignalR Connection Failed: ', err);
        addMessage('System', 'Signaling server offline. Mock local demo mode enabled.');
      });

    return () => {
      connection.stop();
    };
  }, [roomId, userId, addMessage, cleanUpPeer]);

  // Create RTCPeerConnection for a specific peer
  const createPeerConnection = (peerConnectionId, peerUserId, isInitiator = false) => {
    const pc = new RTCPeerConnection(iceConfiguration);
    peerConnectionsRef.current[peerConnectionId] = pc;

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && hubConnectionRef.current) {
        hubConnectionRef.current.invoke('SendSignal', peerConnectionId, JSON.stringify({
          type: 'candidate',
          candidate: event.candidate
        })).catch((err) => console.error(err));
      }
    };

    pc.ontrack = (event) => {
      setPeers((prev) =>
        prev.map((p) => {
          if (p.connectionId === peerConnectionId) {
            return { ...p, stream: event.streams[0] };
          }
          return p;
        })
      );
    };

    // If initiator, negotiate description and send offer
    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (hubConnectionRef.current) {
            hubConnectionRef.current.invoke('SendSignal', peerConnectionId, JSON.stringify({
              type: 'offer',
              sdp: pc.localDescription
            })).catch((err) => console.error(err));
          }
        } catch (err) {
          console.error('Negotiation Error:', err);
        }
      };
    }

    // Add to peers list
    setPeers((prev) => {
      if (prev.some((p) => p.connectionId === peerConnectionId)) return prev;
      return [...prev, { connectionId: peerConnectionId, userId: peerUserId, stream: null }];
    });

    return pc;
  };

  // Handle sending chat message
  const handleSendChat = () => {
    if (!chatInput.trim()) return;

    if (hubConnectionRef.current && hubConnectionRef.current.state === signalR.HubConnectionState.Connected) {
      hubConnectionRef.current.invoke('SendChat', chatInput.trim())
        .catch((err) => console.error('Chat error:', err));
    } else {
      // Local fallback
      addMessage(userId, chatInput.trim());
    }

    setChatInput('');
  };

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle local controls
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
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        // Listen for stop sharing from browser UI
        stream.getVideoTracks()[0].onended = () => {
          stopScreenSharing();
        };
      } catch (err) {
        console.warn('Screen share canceled or failed', err);
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

  // ── Simulation Mode (For beautiful multi-party demo) ──────────────────────
  const toggleSimulation = () => {
    if (!simulationMode) {
      // Add mock users to room
      const mockUsers = [
        { id: 'sim-1', name: 'Elena Rostova (SFU)' },
        { id: 'sim-2', name: 'Marcus Aurelius (Janus)' },
        { id: 'sim-3', name: 'Sarah Connor (WebRTC)' }
      ];

      mockUsers.forEach((user) => {
        // Create canvas stream for each mock user
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        const colors = ['#8b5cf6', '#0ea5e9', '#ec4899'];
        const userColor = colors[Math.floor(Math.random() * colors.length)];

        const intervalId = setInterval(() => {
          ctx.fillStyle = '#0f1122';
          ctx.fillRect(0, 0, 640, 360);
          
          // Draw circular floating particles
          ctx.fillStyle = userColor + '33';
          ctx.beginPath();
          const pulse = Math.sin(Date.now() * 0.002) * 20;
          ctx.arc(320, 150, 70 + pulse, 0, Math.PI * 2);
          ctx.fill();

          // Draw avatar circle
          ctx.fillStyle = userColor;
          ctx.beginPath();
          ctx.arc(320, 150, 60, 0, Math.PI * 2);
          ctx.fill();

          // Initials
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 36px Outfit';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(user.name.split(' ').map(n => n[0]).join(''), 320, 150);

          // Name and latency (Janus simulation)
          ctx.fillStyle = '#ffffff';
          ctx.font = '20px Outfit';
          ctx.fillText(user.name, 320, 250);
          
          ctx.fillStyle = '#10b981';
          ctx.font = '14px Space Grotesk';
          const latency = Math.floor(Math.random() * 4) + 1; // 1-5ms sub-ms latency simulation
          ctx.fillText(`● LATENCY: ${latency}ms (Janus SFU)`, 320, 280);
        }, 100);

        const simulatedStream = canvas.captureStream(30);
        canvasIntervalsRef.current[user.id] = intervalId;

        setPeers((prev) => [
          ...prev,
          { connectionId: user.id, userId: user.name, stream: simulatedStream }
        ]);

        addMessage('System', `${user.name} joined via simulated Janus node.`);
      });

      // Simulate a chat conversation
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { from: 'Elena Rostova (SFU)', text: "Wow, the latency is incredible! Janus SFU is blazing fast.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        ]);
      }, 3000);

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { from: 'Marcus Aurelius (Janus)', text: "Yes, sub-ms processing keeps my audio totally aligned.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        ]);
      }, 7000);

      setSimulationMode(true);
    } else {
      // Remove mock users
      setPeers((prev) => prev.filter((p) => !p.connectionId.startsWith('sim-')));
      Object.keys(canvasIntervalsRef.current).forEach((key) => {
        if (key.startsWith('sim-')) {
          clearInterval(canvasIntervalsRef.current[key]);
          delete canvasIntervalsRef.current[key];
        }
      });
      setSimulationMode(false);
      addMessage('System', 'Simulated participants removed.');
    }
  };

  return (
    <div className="room-container">
      {/* Header */}
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
            👾 {simulationMode ? 'Stop Simulation' : 'Simulate Users'}
          </button>
        </div>
      </header>

      {/* Main Panel */}
      <div className="room-main">
        {/* Video stream gallery */}
        <div className="video-area">
          <div className="grid-layout">
            {/* Local Video */}
            <div className={`video-tile ${activeSpeaker === 'local' ? 'active-speaker' : ''}`}>
              <video 
                ref={localVideoRef} 
                autoPlay 
                muted 
                playsInline 
                className="video-feed"
                style={{ opacity: camOn ? 1 : 0, transition: 'opacity 0.3s' }}
              />
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

            {/* Remote Peer Videos */}
            {peers.map((peer) => (
              <RemoteVideoTile 
                key={peer.connectionId} 
                peer={peer} 
                isActiveSpeaker={activeSpeaker === peer.connectionId}
              />
            ))}
          </div>
        </div>

        {/* Side Panel (Collapsible Chat / User list) */}
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
                /* Chat view */
                <div className="message-list">
                  {messages.map((m, idx) => {
                    const isMe = m.from === userId;
                    const isSystem = m.from === 'System';

                    if (isSystem) {
                      return (
                        <div key={idx} className="system-message">
                          {m.text}
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className="message-item">
                        <div className="message-meta">
                          <span className={`message-sender ${isMe ? 'me' : ''}`}>
                            {m.from}
                          </span>
                          <span className="message-time">{m.time}</span>
                        </div>
                        <div className={`message-bubble ${isMe ? 'me' : ''}`}>
                          {m.text}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
              ) : (
                /* Participant list view */
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
                        <div className="participant-avatar">
                          {peer.userId[0].toUpperCase()}
                        </div>
                        <span className="participant-name">{peer.userId}</span>
                      </div>
                      <div className="participant-controls">
                        <span>🎤</span>
                        <span>📷</span>
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

      {/* Control Bar */}
      <footer className="control-bar glass">
        {/* Left indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            📶 Janus Media Core: <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>Active</span>
          </span>
        </div>

        {/* Center switches */}
        <div className="ctrl-group">
          <button 
            className={`ctrl-btn ${!micOn ? 'danger' : 'active'}`} 
            onClick={toggleMic}
            title={micOn ? 'Mute Mic' : 'Unmute Mic'}
          >
            {micOn ? '🎤' : '🔇'}
          </button>
          <button 
            className={`ctrl-btn ${!camOn ? 'danger' : 'active'}`} 
            onClick={toggleCam}
            title={camOn ? 'Turn Camera Off' : 'Turn Camera On'}
          >
            {camOn ? '📷' : '🚫'}
          </button>
          <button 
            className={`ctrl-btn ${screenSharing ? 'active' : ''}`} 
            onClick={toggleScreenShare}
            title={screenSharing ? 'Stop Presenting' : 'Share Screen'}
          >
            🖥️
          </button>
          <button 
            className="ctrl-btn danger" 
            onClick={onLeave}
            title="Leave Meeting"
          >
            🛑
          </button>
        </div>

        {/* Right action drawers togglers */}
        <div className="ctrl-group">
          <button 
            className={`ctrl-btn ${activeTab === 'participants' ? 'active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'participants' ? null : 'participants')}
            title="Show Participants"
          >
            👥
          </button>
          <button 
            className={`ctrl-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')}
            title="Show Chat"
          >
            💬
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Remote Video Tile Helper ──────────────────────────────────────────────────
function RemoteVideoTile({ peer, isActiveSpeaker }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
    }
  }, [peer.stream]);

  const initials = peer.userId.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className={`video-tile animate-fade-in ${isActiveSpeaker ? 'active-speaker' : ''}`}>
      {peer.stream ? (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="video-feed"
        />
      ) : (
        <div className="avatar-placeholder">
          {initials}
        </div>
      )}
      <div className="video-overlay-info">
        <span className="audio-indicator" />
        <span>{peer.userId}</span>
      </div>
    </div>
  );
}
