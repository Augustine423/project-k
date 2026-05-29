import React, { useState, useRef, useEffect, useCallback } from 'react';

// ── WebSocket URL (same host, /ws path proxied by nginx) ──────────────────────
const wsURL = (roomId, userId) => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws?room_id=${roomId}&user_id=${userId}`;
};

// ── Lobby ─────────────────────────────────────────────────────────────────────
function Lobby({ onJoin }) {
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [msg, setMsg] = useState('');

  const createRoom = () => {
    const id = 'room-' + Math.random().toString(36).slice(2, 8);
    setRoomId(id);
    setMsg(`Room created: ${id} — share this ID with others`);
  };

  const joinRoom = async () => {
    if (!roomId || !userId) { setMsg('Enter room ID and your name'); return; }
    setMsg('Connecting...');
    try {
      const res = await fetch('/api/v1/session/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, user_id: userId, sdp_offer: '' })
      });
      if (!res.ok) throw new Error(await res.text());
      onJoin({ roomId, userId });
    } catch (err) {
      setMsg('Failed: ' + err.message);
    }
  };

  return (
    <div style={S.lobby}>
      <h1 style={{ marginBottom: 24 }}>🎥 KZYS Video Conference</h1>
      <input style={S.input} placeholder="Your name" value={userId} onChange={e => setUserId(e.target.value)} />
      <input style={S.input} placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button style={S.btn} onClick={createRoom}>Create Room</button>
        <button style={{ ...S.btn, background: '#2e7d32' }} onClick={joinRoom}>Join Room</button>
      </div>
      {msg && <p style={{ marginTop: 16, color: '#aaa', fontSize: 13 }}>{msg}</p>}
    </div>
  );
}

// ── Room ──────────────────────────────────────────────────────────────────────
function Room({ session }) {
  const { roomId, userId } = session;
  const [peers, setPeers] = useState({});       // peerId -> { stream, name }
  const [messages, setMessages] = useState([{ from: 'System', text: `You joined ${roomId}` }]);
  const [chatInput, setChatInput] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const localVideoRef = useRef(null);
  const localStream = useRef(null);
  const peerConns = useRef({});
  const ws = useRef(null);
  const chatRef = useRef(null);
  const iceConfig = useRef({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

  const addMsg = useCallback((from, text) =>
    setMessages(m => [...m, { from, text }]), []);

  // ── send via WebSocket ──
  const send = useCallback((obj) => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify(obj));
  }, []);

  // ── create RTCPeerConnection for a peer ──
  const createPC = useCallback((peerId) => {
    const pc = new RTCPeerConnection(iceConfig.current);

    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current));

    pc.onicecandidate = e => {
      if (e.candidate) send({ type: 'ice', to: peerId, candidate: e.candidate });
    };

    pc.ontrack = e => {
      setPeers(prev => ({ ...prev, [peerId]: { ...prev[peerId], stream: e.streams[0] } }));
    };

    peerConns.current[peerId] = pc;
    return pc;
  }, [send]);

  // ── handle incoming WS messages ──
  const handleMsg = useCallback(async (raw) => {
    const msg = JSON.parse(raw);
    const from = msg.from;

    if (msg.type === 'peer_joined' && from !== userId) {
      addMsg('System', `${from} joined`);
      setPeers(prev => ({ ...prev, [from]: { stream: null, name: from } }));
      // initiator creates offer
      const pc = createPC(from);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: 'offer', to: from, sdp: pc.localDescription });
    }

    if (msg.type === 'peer_left') {
      addMsg('System', `${from} left`);
      peerConns.current[from]?.close();
      delete peerConns.current[from];
      setPeers(prev => { const n = { ...prev }; delete n[from]; return n; });
    }

    if (msg.type === 'offer') {
      const pc = createPC(from);
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: 'answer', to: from, sdp: pc.localDescription });
    }

    if (msg.type === 'answer') {
      await peerConns.current[from]?.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    }

    if (msg.type === 'ice') {
      await peerConns.current[from]?.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }

    if (msg.type === 'chat') {
      addMsg(from, msg.text);
    }
  }, [userId, addMsg, createPC, send]);

  // ── init local media + WebSocket ──
  useEffect(() => {
    let active = true;
    (async () => {
      // fetch TURN credentials from backend
      try {
        const r = await fetch('/api/v1/turn/credentials');
        const turn = await r.json();
        iceConfig.current = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: turn.urls, username: turn.username, credential: turn.credential }
          ]
        };
      } catch {
        iceConfig.current = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch {
        addMsg('System', 'Camera/mic unavailable');
      }

      if (!active) return;
      const socket = new WebSocket(wsURL(roomId, userId));
      ws.current = socket;
      socket.onmessage = e => handleMsg(e.data);
      socket.onclose = () => addMsg('System', 'Disconnected');
    })();

    return () => {
      active = false;
      ws.current?.close();
      localStream.current?.getTracks().forEach(t => t.stop());
      Object.values(peerConns.current).forEach(pc => pc.close());
    };
  }, [roomId, userId, addMsg, handleMsg]);

  // scroll chat
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const toggleMic = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(v => !v);
  };
  const toggleCam = () => {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(v => !v);
  };
  const sendChat = () => {
    if (!chatInput.trim()) return;
    send({ type: 'chat', text: chatInput.trim() });
    addMsg(userId, chatInput.trim());
    setChatInput('');
  };

  return (
    <div style={S.room}>
      {/* Header */}
      <div style={S.header}>
        <span>🎥 <b>{roomId}</b></span>
        <span style={{ fontSize: 12, color: '#aaa' }}>You: {userId}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.ctrl} onClick={toggleMic}>{micOn ? '🎤' : '🔇'}</button>
          <button style={S.ctrl} onClick={toggleCam}>{camOn ? '📷' : '🚫'}</button>
        </div>
      </div>

      <div style={S.main}>
        {/* Video grid */}
        <div style={S.grid}>
          {/* Local */}
          <div style={S.tile}>
            <video ref={localVideoRef} autoPlay muted playsInline style={S.video} />
            <div style={S.label}>{userId} (You)</div>
          </div>
          {/* Remote peers */}
          {Object.entries(peers).map(([id, peer]) => (
            <PeerTile key={id} peerId={id} stream={peer.stream} />
          ))}
          {Object.keys(peers).length === 0 && (
            <div style={{ ...S.tile, justifyContent: 'center', alignItems: 'center', color: '#666' }}>
              ⏳ Waiting for others to join...
            </div>
          )}
        </div>

        {/* Chat */}
        <div style={S.chat}>
          <div style={S.chatHeader}>💬 Chat</div>
          <div style={S.messages} ref={chatRef}>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 6, fontSize: 13 }}>
                <b style={{ color: m.from === userId ? '#4af' : m.from === 'System' ? '#fa4' : '#8f8' }}>
                  {m.from}:
                </b>{' '}{m.text}
              </div>
            ))}
          </div>
          <div style={S.chatInput}>
            <input
              style={{ ...S.input, margin: 0, flex: 1, fontSize: 13 }}
              placeholder="Message..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
            />
            <button style={S.btn} onClick={sendChat}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PeerTile({ peerId, stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div style={S.tile}>
      {stream
        ? <video ref={ref} autoPlay playsInline style={S.video} />
        : <div style={{ ...S.video, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>Connecting...</div>
      }
      <div style={S.label}>{peerId}</div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  return session ? <Room session={session} /> : <Lobby onJoin={setSession} />;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  lobby:      { fontFamily: 'sans-serif', maxWidth: 380, margin: '80px auto', textAlign: 'center', color: '#eee', background: '#1a1a2e', padding: 32, borderRadius: 12 },
  room:       { fontFamily: 'sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d1a', color: '#eee' },
  header:     { padding: '10px 20px', background: '#1a1a2e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' },
  main:       { display: 'flex', flex: 1, overflow: 'hidden' },
  grid:       { flex: 1, display: 'flex', flexWrap: 'wrap', gap: 12, padding: 16, alignContent: 'flex-start', overflowY: 'auto' },
  tile:       { position: 'relative', width: 'calc(50% - 6px)', minWidth: 200, borderRadius: 8, overflow: 'hidden', background: '#1a1a2e' },
  video:      { width: '100%', height: 200, objectFit: 'cover', display: 'block' },
  label:      { position: 'absolute', bottom: 6, left: 8, fontSize: 12, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4 },
  chat:       { width: 280, display: 'flex', flexDirection: 'column', background: '#1a1a2e', borderLeft: '1px solid #333' },
  chatHeader: { padding: '10px 16px', fontWeight: 'bold', borderBottom: '1px solid #333' },
  messages:   { flex: 1, overflowY: 'auto', padding: 12 },
  chatInput:  { display: 'flex', padding: 8, gap: 6, borderTop: '1px solid #333' },
  input:      { display: 'block', width: '100%', marginBottom: 10, padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3e', color: '#eee', boxSizing: 'border-box' },
  btn:        { padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1565c0', color: '#fff', cursor: 'pointer' },
  ctrl:       { padding: '4px 10px', borderRadius: 6, border: 'none', background: '#333', color: '#fff', cursor: 'pointer', fontSize: 16 },
};
