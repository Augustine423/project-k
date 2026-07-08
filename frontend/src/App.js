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

const FALLBACK_PLANS = [
  { id: 'free', name: 'Free', maxParticipants: 30, isPaid: false, pricePerRoom: 0, monthlyPrice: 0, annualPrice: 0, description: 'Up to 30 participants — free', available: true },
  { id: 'plus100', name: 'Plus 100', maxParticipants: 100, isPaid: true, pricePerRoom: 4.99, monthlyPrice: 15.97, annualPrice: 153.31, description: 'Up to 100 participants', available: false },
  { id: 'plus500', name: 'Plus 500', maxParticipants: 500, isPaid: true, pricePerRoom: 14.99, monthlyPrice: 47.97, annualPrice: 460.51, description: 'Up to 500 participants', available: false },
  { id: 'plus1000', name: 'Plus 1000', maxParticipants: 1000, isPaid: true, pricePerRoom: 24.99, monthlyPrice: 79.97, annualPrice: 767.71, description: 'Up to 1000 participants', available: false },
  { id: 'plus2000', name: 'Plus 2000', maxParticipants: 2000, isPaid: true, pricePerRoom: 39.99, monthlyPrice: 127.97, annualPrice: 1228.51, description: 'Up to 2000 participants', available: false },
];

// ── KZYS Meeting Room App ─────────────────────────────────────────────────────

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

// ── Lobby Component ───────────────────────────────────────────────────────────
function Lobby({ onJoin }) {
  const inviteFromUrl = parseInviteFromUrl();
  const [mode, setMode] = useState(inviteFromUrl ? 'invite' : 'create');
  const [userId, setUserId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdRoom, setCreatedRoom] = useState(null);
  const [invite, setInvite] = useState(inviteFromUrl);
  const [inviteMeta, setInviteMeta] = useState(null);
  const [inviteLinkInput, setInviteLinkInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [autoMockPayments, setAutoMockPayments] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState('free');
  const [billingMode, setBillingMode] = useState('per_room');
  const [subscriptionPeriod, setSubscriptionPeriod] = useState('monthly');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/rooms/plans`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.plans) && data.plans.length) setPlans(data.plans);
        if (typeof data.autoMockPayments === 'boolean') setAutoMockPayments(data.autoMockPayments);
      } catch { /* use fallback */ }
    })();
  }, []);

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
        if (!cancelled) setErrorMsg('Could not verify invite link. Is the backend running?');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [invite]);

  const handleCreateRoom = async () => {
    if (!userId.trim()) {
      setErrorMsg('Enter your display name — it is used as your dev payment identity.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];
    try {
      const res = await fetch(`${getApiBase()}/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostName: userId.trim() || null,
          userId: userId.trim() || null,
          planId: selectedPlanId,
          requestedParticipants: selectedPlan?.maxParticipants ?? 30,
          billingMode,
          subscriptionPeriod: billingMode === 'subscription' ? subscriptionPeriod : null,
          durationHours: 24,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        const amount = data.amountDue != null ? ` Amount due: $${Number(data.amountDue).toFixed(2)}.` : '';
        const link = data.pricingUrl ? ` Pricing: ${window.location.origin}${data.pricingUrl}` : '';
        setErrorMsg((data.error || 'Payment required.') + amount + link);
        return;
      }
      if (!res.ok) throw new Error(data.error || `Create failed: ${res.status}`);
      const joinUrl = buildJoinUrl(data.roomId, data.joinKey);
      setCreatedRoom({
        roomId: data.roomId,
        joinKey: data.joinKey,
        joinUrl,
        planId: data.planId,
        planName: data.planName,
        maxParticipants: data.maxParticipants,
        mockPayment: data.mockPayment,
        amountCharged: data.amountCharged,
        paymentReference: data.paymentReference,
      });
      setMode('created');
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
    setMode('invite');
    window.history.replaceState(null, '', buildJoinUrl(parsed.roomId, parsed.joinKey));
  };

  const handleJoin = () => {
    if (!userId.trim()) { setErrorMsg('Please enter your name.'); return; }

    if (mode === 'created' && createdRoom) {
      onJoin({
        roomId: createdRoom.roomId,
        joinKey: createdRoom.joinKey,
        userId: userId.trim(),
        isHost: true,
        planId: createdRoom.planId,
        planName: createdRoom.planName,
        maxParticipants: createdRoom.maxParticipants,
      });
      return;
    }

    if (mode === 'invite' && invite) {
      onJoin({
        roomId: invite.roomId,
        joinKey: invite.joinKey,
        userId: userId.trim(),
        isHost: false,
        planId: inviteMeta?.planId || 'free',
        planName: inviteMeta?.planName || 'Free',
        maxParticipants: inviteMeta?.maxParticipants || 30,
      });
      return;
    }

    setErrorMsg('Create a room or open an invite link to join.');
  };

  const copyInviteLink = async () => {
    if (!createdRoom?.joinUrl) return;
    try {
      await navigator.clipboard.writeText(createdRoom.joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('Could not copy link. Select and copy manually.');
    }
  };

  const activeRoomId = createdRoom?.roomId || invite?.roomId;

  return (
    <div className="lobby-container">
      <div className="lobby-card glass animate-fade-in">
        <div className="animate-float">
          <span style={{ fontSize: '3.5rem' }}>🎥</span>
        </div>
        <h1 className="lobby-title">KZYS Video Space</h1>
        <p className="lobby-subtitle">Create a room and share the invite link — only guests with the link can join</p>

        {errorMsg && (
          <div style={{ color: 'var(--accent-rose)', marginBottom: '16px', fontSize: '0.9rem', fontWeight: 500 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {mode === 'create' && (
          <div style={{ marginBottom: '24px', textAlign: 'left' }}>
            <div className="form-group">
              <label className="form-label">Display Name (host)</label>
              <input className="form-input" placeholder="e.g. John Doe" value={userId}
                onChange={(e) => setUserId(e.target.value)} />
            </div>
            <label className="form-label" style={{ marginBottom: '12px' }}>Choose room plan</label>
            <div className="plan-grid">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className={`plan-card ${selectedPlanId === plan.id ? 'plan-card-selected' : ''} ${plan.isPaid && !plan.available ? 'plan-card-locked' : ''}`}
                  onClick={() => setSelectedPlanId(plan.id)}
                >
                  <span className="plan-card-name">{plan.name}</span>
                  <span className="plan-card-cap">{plan.maxParticipants} users</span>
                  <span className="plan-card-cap">
                    {plan.isPaid ? `$${Number(plan.pricePerRoom || 0).toFixed(2)}/room` : 'Free'}
                  </span>
                  {plan.isPaid && (
                    <span className="plan-card-cap" style={{ fontSize: '0.72rem' }}>
                      or ${Number(plan.monthlyPrice || 0).toFixed(2)}/mo sub
                    </span>
                  )}
                  <span className="plan-card-badge">{plan.isPaid ? 'Paid' : 'Free'}</span>
                </button>
              ))}
            </div>
            <div className="form-group" style={{ marginTop: '12px', marginBottom: 0 }}>
              <label className="form-label">Billing mode</label>
              <select className="form-input" value={billingMode} onChange={(e) => setBillingMode(e.target.value)}>
                <option value="per_room">Pay per room (24h)</option>
                <option value="subscription">Use subscription</option>
              </select>
            </div>
            {billingMode === 'subscription' && (
              <div className="form-group" style={{ marginTop: '12px', marginBottom: 0 }}>
                <label className="form-label">Subscription period</label>
                <select className="form-input" value={subscriptionPeriod} onChange={(e) => setSubscriptionPeriod(e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual (20% off)</option>
                </select>
              </div>
            )}
            {autoMockPayments && (
              <p style={{ color: 'var(--accent-emerald)', fontSize: '0.8rem', marginTop: '12px' }}>
                Dev mode: payment is auto-created from your display name — no checkout needed.
              </p>
            )}
            <div className="lobby-sticky-actions">
              <button className="btn-primary" onClick={handleCreateRoom} disabled={loading}>
                {loading ? 'Creating…' : 'Create Room'}
              </button>
            </div>

            <div className="lobby-divider">or join with invite link</div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Paste invite link</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="form-input" style={{ flex: 1 }} placeholder="https://…/join?room=…&key=…"
                  value={inviteLinkInput} onChange={(e) => setInviteLinkInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasteInvite()} />
                <button className="btn-secondary" style={{ width: 'auto', margin: 0, padding: '0 16px', borderRadius: '12px' }}
                  onClick={handlePasteInvite}>Join</button>
              </div>
            </div>
          </div>
        )}

        {mode === 'created' && createdRoom && (
          <div className="invite-box glass" style={{ marginBottom: '24px', padding: '16px', borderRadius: '12px' }}>
            <label className="form-label" style={{ marginBottom: '8px' }}>Share this invite link</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input className="form-input" style={{ flex: 1, fontSize: '0.8rem' }} readOnly value={createdRoom.joinUrl} />
              <button className="btn-secondary" style={{ width: 'auto', margin: 0, padding: '0 16px', borderRadius: '12px', whiteSpace: 'nowrap' }}
                onClick={copyInviteLink}>{copied ? '✓ Copied' : 'Copy'}</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '8px' }}>
              Room: <strong>{createdRoom.roomId}</strong> · Plan: <strong>{createdRoom.planName}</strong> ({createdRoom.maxParticipants} max)
              {createdRoom.mockPayment && (
                <> · Mock paid <strong>${Number(createdRoom.amountCharged || 0).toFixed(2)}</strong></>
              )}
            </p>
          </div>
        )}

        {mode === 'invite' && invite && inviteMeta && (
          <div style={{ marginBottom: '24px', padding: '12px 16px', borderRadius: '12px', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Invited to <strong style={{ color: 'var(--accent-purple)' }}>{invite.roomId}</strong>
              {' · '}{inviteMeta.planName} plan · up to {inviteMeta.maxParticipants} participants
            </p>
          </div>
        )}

        {mode === 'invite' && invite && !inviteMeta && !errorMsg && loading && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>Verifying invite…</p>
        )}

        {(mode === 'created' || mode === 'invite') && (
          <>
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input className="form-input" placeholder="e.g. John Doe" value={userId}
                onChange={(e) => setUserId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleJoin()} />
            </div>
            <button className="btn-primary" onClick={handleJoin} disabled={loading || (mode === 'invite' && !!errorMsg)}>
              {mode === 'created' ? 'Start Meeting as Host' : 'Join Meeting'}
            </button>
            {mode === 'invite' && (
              <button className="btn-secondary" style={{ marginTop: '12px' }} onClick={() => { setMode('create'); setInvite(null); setErrorMsg(''); window.history.replaceState(null, '', '/'); }}>
                Back
              </button>
            )}
          </>
        )}

        {activeRoomId && mode === 'created' && (
          <button className="btn-secondary" style={{ marginTop: '12px' }} onClick={() => { setMode('create'); setCreatedRoom(null); setErrorMsg(''); window.history.replaceState(null, '', '/'); }}>
            Cancel
          </button>
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
  const [simulationMode, setSimulationMode] = useState(false);
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
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch {
        // Canvas fallback for preview
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d');
        const id = setInterval(() => {
          ctx.fillStyle = '#111428'; ctx.fillRect(0, 0, 640, 360);
          ctx.font = '24px Outfit'; ctx.fillStyle = '#8b5cf6'; ctx.textAlign = 'center';
          ctx.fillText(userId + ' (You)', 320, 160);
          ctx.fillStyle = '#94a3b8'; ctx.font = '16px Outfit';
          ctx.fillText('Camera unavailable', 320, 200);
          const t = Date.now() * 0.003;
          ctx.beginPath(); ctx.arc(320 + Math.sin(t) * 100, 250 + Math.cos(t * 2) * 20, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#0ea5e9'; ctx.fill();
        }, 33);
        const s = canvas.captureStream(30);
        localStreamRef.current = s;
        if (localVideoRef.current) localVideoRef.current.srcObject = s;
        canvasIntervalsRef.current['local'] = id;
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

    const isLocal = isLocalDev();
    const apiBase = getApiBase();
    const proto = isLocal ? 'ws' : (window.location.protocol === 'https:' ? 'wss' : 'ws');
    // LiveKit client appends /rtc itself — do not add /rtc here (avoids /rtc/rtc 404).
    const livekitUrl = process.env.REACT_APP_LIVEKIT_URL || (
      isLocal ? 'ws://localhost:7880' : `${proto}://${window.location.host}`
    );

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
        // Fetch token from our C# backend
        const res = await fetch(
          `${apiBase}/livekit/token?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(userId)}&joinKey=${encodeURIComponent(joinKey)}`
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 403 && data.requiresUpgrade) {
            throw new Error(`Room full (${data.participantCount}/${data.maxParticipants}). Host must upgrade the ${data.planName} plan.`);
          }
          throw new Error(data.error || `Token request failed: ${res.status}`);
        }
        const { token } = await res.json();

        let connectOptions = {};
        try {
          const turnRes = await fetch(`${apiBase}/v1/turn/credentials`);
          if (turnRes.ok) {
            const turn = await turnRes.json();
            const urls = turn.Urls || turn.urls;
            if (Array.isArray(urls) && urls.length) {
              connectOptions = {
                rtcConfig: {
                  iceServers: [{
                    urls,
                    username: turn.Username || turn.username,
                    credential: turn.Credential || turn.credential,
                  }],
                },
              };
            }
          }
        } catch {
          /* TURN optional — LiveKit may still supply ICE servers */
        }

        await room.connect(livekitUrl, token, connectOptions);

        // Publish local tracks via LiveKit (proper wrappers)
        const tracks = await createLocalTracks({ audio: true, video: { facingMode: 'user' } });
        localTracksRef.current = tracks;
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track);
          // Mirror video to local preview
          if (track.kind === Track.Kind.Video && localVideoRef.current) {
            localVideoRef.current.srcObject = new MediaStream([track.mediaStreamTrack]);
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

  // ── Simulation Mode ───────────────────────────────────────────────────────
  const toggleSimulation = () => {
    if (!simulationMode) {
      const mockUsers = [{ id: 'sim-1', name: 'Alex' }, { id: 'sim-2', name: 'Jordan' }, { id: 'sim-3', name: 'Sam' }];
      mockUsers.forEach((user) => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d');
        const colors = ['#8b5cf6', '#0ea5e9', '#ec4899'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const id = setInterval(() => {
          ctx.fillStyle = '#0f1122'; ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = color + '33'; ctx.beginPath();
          const p = Math.sin(Date.now() * 0.002) * 20;
          ctx.arc(320, 150, 70 + p, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(320, 150, 60, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 36px Outfit'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(user.name.split(' ').map((n) => n[0]).join(''), 320, 150);
          ctx.font = '20px Outfit'; ctx.fillText(user.name, 320, 260);
        }, 100);
        canvasIntervalsRef.current[user.id] = id;
        setPeers((prev) => [...prev, { connectionId: user.id, userId: user.name, stream: canvas.captureStream(30) }]);
        addMessage('System', `${user.name} joined the preview.`);
      });
      setTimeout(() => setMessages((prev) => [...prev, { from: 'Alex', text: 'Looks great! The room layout is working well.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]), 3000);
      setSimulationMode(true);
    } else {
      setPeers((prev) => prev.filter((p) => !p.connectionId.startsWith('sim-')));
      Object.keys(canvasIntervalsRef.current).forEach((k) => { if (k.startsWith('sim-')) { clearInterval(canvasIntervalsRef.current[k]); delete canvasIntervalsRef.current[k]; } });
      setSimulationMode(false);
      addMessage('System', 'Preview participants removed.');
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
            }}
            title="Copy invite link for new participants">
            🔗 {linkCopied ? 'Copied!' : 'Invite'}
          </button>
          <button className={`btn-secondary ${simulationMode ? 'active' : ''}`} onClick={toggleSimulation}
            style={{ margin: 0, padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
