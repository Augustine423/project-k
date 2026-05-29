import React, { useState } from 'react';

function App() {
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');

  const joinRoom = async () => {
    if (!roomId || !userId) { setStatus('Enter room ID and your name'); return; }
    setStatus('Connecting...');
    try {
      const res = await fetch('/api/v1/session/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, user_id: userId, sdp_offer: 'offer' })
      });
      const data = await res.json();
      setStatus(`Joined! Endpoint: ${data.media_server_endpoint}`);
    } catch (err) {
      setStatus('Connection failed: ' + err.message);
    }
  };

  const createRoom = () => {
    const id = 'room-' + Math.random().toString(36).slice(2, 8);
    setRoomId(id);
    setStatus(`Room created: ${id} — share this ID with others`);
  };

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 400, margin: '80px auto', textAlign: 'center' }}>
      <h1>KZYS Video Conference</h1>
      <input
        placeholder="Your name"
        value={userId}
        onChange={e => setUserId(e.target.value)}
        style={{ display: 'block', width: '100%', marginBottom: 8, padding: 8 }}
      />
      <input
        placeholder="Room ID"
        value={roomId}
        onChange={e => setRoomId(e.target.value)}
        style={{ display: 'block', width: '100%', marginBottom: 8, padding: 8 }}
      />
      <button onClick={createRoom} style={{ marginRight: 8, padding: '8px 16px' }}>Create Room</button>
      <button onClick={joinRoom} style={{ padding: '8px 16px' }}>Join Room</button>
      {status && <p style={{ marginTop: 16 }}>{status}</p>}
    </div>
  );
}

export default App;
