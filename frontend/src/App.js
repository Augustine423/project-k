import React, { useState, useRef, useEffect } from 'react';

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
        body: JSON.stringify({ room_id: roomId, user_id: userId, sdp_offer: 'offer' })
      });
      const data = await res.json();
      onJoin({ roomId, userId, endpoint: data.media_server_endpoint });
    } catch (err) {
      setMsg('Connection failed: ' + err.message);
    }
  };

  return (
    <div style={styles.lobby}>
      <h1>KZYS Video Conference</h1>
      <input style={styles.input} placeholder="Your name" value={userId} onChange={e => setUserId(e.target.value)} />
      <input style={styles.input} placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value)} />
      <div>
        <button style={styles.btn} onClick={createRoom}>Create Room</button>
        <button style={styles.btn} onClick={joinRoom}>Join Room</button>
      </div>
      {msg && <p style={{ marginTop: 12, color: '#ccc' }}>{msg}</p>}
    </div>
  );
}

function Room({ session }) {
  const { roomId, userId, endpoint } = session;
  const [messages, setMessages] = useState([
    { from: 'System', text: `${userId} joined ${roomId}` }
  ]);
  const [input, setInput] = useState('');
  const [localOn, setLocalOn] = useState(true);
  const [remoteOn] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const sendMsg = () => {
    if (!input.trim()) return;
    setMessages(m => [...m, { from: userId, text: input.trim() }]);
    setInput('');
  };

  return (
    <div style={styles.room}>
      {/* Header */}
      <div style={styles.header}>
        <span>Room: <b>{roomId}</b></span>
        <span style={{ fontSize: 12, color: '#aaa' }}>Endpoint: {endpoint}</span>
      </div>

      {/* Video grid + chat */}
      <div style={styles.main}>
        {/* Videos */}
        <div style={styles.videos}>
          <div style={styles.videoBox}>
            <div style={styles.videoPlaceholder}>
              {localOn ? '📷 ' + userId + ' (You)' : '🚫 Camera Off'}
            </div>
            <button style={styles.smallBtn} onClick={() => setLocalOn(v => !v)}>
              {localOn ? 'Turn Off Cam' : 'Turn On Cam'}
            </button>
          </div>
          <div style={styles.videoBox}>
            <div style={styles.videoPlaceholder}>
              {remoteOn ? '📷 Remote User' : '⏳ Waiting for others...'}
            </div>
          </div>
        </div>

        {/* Chat */}
        <div style={styles.chat}>
          <div style={styles.chatHeader}>Chat</div>
          <div style={styles.messages} ref={chatRef}>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <b style={{ color: m.from === userId ? '#4af' : '#fa4' }}>{m.from}: </b>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
          <div style={styles.chatInput}>
            <input
              style={{ ...styles.input, margin: 0, flex: 1 }}
              placeholder="Type a message..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMsg()}
            />
            <button style={styles.btn} onClick={sendMsg}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  return session ? <Room session={session} /> : <Lobby onJoin={setSession} />;
}

const styles = {
  lobby: { fontFamily: 'sans-serif', maxWidth: 380, margin: '80px auto', textAlign: 'center', color: '#eee', background: '#1a1a2e', padding: 32, borderRadius: 12 },
  room: { fontFamily: 'sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f0f1a', color: '#eee' },
  header: { padding: '10px 20px', background: '#1a1a2e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  videos: { flex: 1, display: 'flex', flexWrap: 'wrap', gap: 12, padding: 16, alignContent: 'flex-start' },
  videoBox: { width: 'calc(50% - 6px)', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 6 },
  videoPlaceholder: { background: '#2a2a3e', borderRadius: 8, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#aaa' },
  chat: { width: 280, display: 'flex', flexDirection: 'column', background: '#1a1a2e', borderLeft: '1px solid #333' },
  chatHeader: { padding: '10px 16px', fontWeight: 'bold', borderBottom: '1px solid #333' },
  messages: { flex: 1, overflowY: 'auto', padding: 12, fontSize: 13 },
  chatInput: { display: 'flex', padding: 8, gap: 6, borderTop: '1px solid #333' },
  input: { display: 'block', width: '100%', marginBottom: 10, padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3e', color: '#eee', boxSizing: 'border-box' },
  btn: { padding: '8px 16px', marginRight: 6, borderRadius: 6, border: 'none', background: '#4a6fa5', color: '#fff', cursor: 'pointer' },
  smallBtn: { padding: '4px 10px', borderRadius: 4, border: 'none', background: '#555', color: '#fff', cursor: 'pointer', fontSize: 12 },
};
