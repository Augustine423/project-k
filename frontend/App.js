import React, { useState } from 'react';

function App() {
  const [status, setStatus] = useState('Disconnected');

  const startSession = async () => {
    setStatus('Negotiating...');
    try {
      // Pointing to your new Go gRPC-Gateway API
      const response = await fetch('http://localhost:8080/v1/session/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: "room123",
          user_id: "userA",
          sdp_offer: "offer-data-here"
        })
      });
      const data = await response.json();
      console.log('Session Prepared:', data);
      setStatus('Connected to C-Backend');
    } catch (err) {
      console.error(err);
      setStatus('Connection Failed');
    }
  };

  return (
    <div className="App">
      <h1>KZYS Video Conference</h1>
      <p>Status: {status}</p>
      <button onClick={startSession}>Join Room</button>
    </div>
  );
}

export default App;
