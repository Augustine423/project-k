import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * React hook — Janus VideoRoom logic from janus-gateway/html/demos/videoroom.js
 * Publisher joins room, publishes camera/mic, subscribes to other publishers.
 */
export function useJanusVideoRoom({ janusRoomId, userId, server, iceServers, enabled }) {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [peers, setPeers] = useState([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState(null);

  const janusRef = useRef(null);
  const publisherRef = useRef(null);
  const privateIdRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const feedsRef = useRef({});
  const feedStreamsRef = useRef({});

  const addPeer = useCallback((id, display, videoStream, audioStream) => {
    setPeers((prev) => {
      const exists = prev.find((p) => p.id === id);
      if (exists) {
        return prev.map((p) => (p.id === id ? { ...p, videoStream, audioStream } : p));
      }
      return [...prev, { id, userId: display, videoStream, audioStream }];
    });
  }, []);

  const removePeer = useCallback((id) => {
    setPeers((prev) => prev.filter((p) => p.id !== id));
    const feed = feedsRef.current[id];
    if (feed) {
      try { feed.detach(); } catch { /* ignore */ }
      delete feedsRef.current[id];
    }
    delete feedStreamsRef.current[id];
  }, []);

  const publishOwnFeed = useCallback((handle, withAudio = true) => {
    const tracks = [];
    if (withAudio) tracks.push({ type: 'audio', capture: true, recv: false });
    tracks.push({ type: 'video', capture: true, recv: false });

    handle.createOffer({
      tracks,
      success(jsep) {
        handle.send({
          message: { request: 'configure', audio: withAudio, video: true },
          jsep,
        });
      },
      error(err) {
        if (withAudio) {
          publishOwnFeed(handle, false);
        } else {
          setError(err?.message || 'WebRTC publish failed');
        }
      },
    });
  }, []);

  const subscribeToFeed = useCallback((janus, id, display, streams, mypvtid) => {
    if (feedsRef.current[id]) return;

    janus.attach({
      plugin: 'janus.plugin.videoroom',
      success(pluginHandle) {
        const remoteFeed = pluginHandle;
        remoteFeed.rfid = id;
        remoteFeed.rfdisplay = display;
        remoteFeed.remoteTracks = {};

        const subscription = (streams || []).map((stream) => ({
          feed: stream.id ?? id,
          mid: stream.mid,
        }));

        remoteFeed.send({
          message: {
            request: 'join',
            room: janusRoomId,
            ptype: 'subscriber',
            streams: subscription,
            private_id: mypvtid,
          },
        });

        feedsRef.current[id] = remoteFeed;
      },
      error(err) {
        console.error('Subscriber attach error', err);
      },
      onmessage(msg, jsep) {
        const event = msg.videoroom;
        if (event === 'attached') {
          /* ready */
        } else if (jsep) {
          feedsRef.current[id]?.handleRemoteJsep({ jsep });
        }
      },
      onremotetrack(track, mid, on) {
        const feed = feedsRef.current[id];
        if (!feed) return;
        const key = `${mid}`;
        if (!on) {
          delete feed.remoteTracks[key];
          return;
        }
        feed.remoteTracks[key] = track;
        const tracks = Object.values(feed.remoteTracks);
        const videoTrack = tracks.find((t) => t.kind === 'video');
        const audioTrack = tracks.find((t) => t.kind === 'audio');
        addPeer(
          id,
          display,
          videoTrack ? new MediaStream([videoTrack]) : null,
          audioTrack ? new MediaStream([audioTrack]) : null,
        );
      },
    });
  }, [janusRoomId, addPeer]);

  useEffect(() => {
    if (!enabled || !janusRoomId || !userId || !server) return undefined;

    if (typeof window.Janus === 'undefined') {
      setError('Janus library not loaded. Check public/janus.js');
      setConnectionStatus('offline');
      return undefined;
    }

    let destroyed = false;
    setConnectionStatus('connecting');
    setError(null);

    window.Janus.init({
      debug: false,
      callback() {
        if (destroyed) return;

        const janus = new window.Janus({
          server,
          iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
          success() {
            if (destroyed) return;
            janus.attach({
              plugin: 'janus.plugin.videoroom',
              success(pluginHandle) {
                if (destroyed) return;
                publisherRef.current = pluginHandle;

                pluginHandle.send({
                  message: {
                    request: 'join',
                    room: janusRoomId,
                    ptype: 'publisher',
                    display: userId,
                  },
                });
              },
              error(err) {
                setError(err?.message || 'Failed to attach VideoRoom plugin');
                setConnectionStatus('offline');
              },
              onmessage(msg, jsep) {
                const event = msg.videoroom;
                if (event === 'joined') {
                  privateIdRef.current = msg.private_id;
                  setConnectionStatus('connected');
                  publishOwnFeed(publisherRef.current, true);

                  if (msg.publishers) {
                    msg.publishers.forEach((pub) => {
                      if (pub.dummy) return;
                      const streams = pub.streams?.map((s) => ({ ...s, id: pub.id, display: pub.display })) || [];
                      feedStreamsRef.current[pub.id] = streams;
                      subscribeToFeed(janus, pub.id, pub.display, streams, privateIdRef.current);
                    });
                  }
                } else if (event === 'event' && msg.publishers) {
                  msg.publishers.forEach((pub) => {
                    if (pub.dummy) return;
                    const streams = pub.streams?.map((s) => ({ ...s, id: pub.id, display: pub.display })) || [];
                    feedStreamsRef.current[pub.id] = streams;
                    subscribeToFeed(janus, pub.id, pub.display, streams, privateIdRef.current);
                  });
                } else if (msg.leaving || msg.unpublished) {
                  const left = msg.leaving || msg.unpublished;
                  if (left !== 'ok') removePeer(left);
                } else if (msg.error) {
                  setError(msg.error);
                }
                if (jsep) publisherRef.current?.handleRemoteJsep({ jsep });
              },
              onlocaltrack(track, on) {
                if (!on || track.kind !== 'video') return;
                const stream = new MediaStream([track]);
                localStreamRef.current = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
              },
              webrtcState(on) {
                if (on) setConnectionStatus('connected');
              },
            });
          },
          error(err) {
            setError(err?.message || 'Janus connection failed');
            setConnectionStatus('offline');
          },
          destroyed() {
            setConnectionStatus('offline');
          },
        });

        janusRef.current = janus;
      },
    });

    return () => {
      destroyed = true;
      Object.values(feedsRef.current).forEach((f) => {
        try { f.detach(); } catch { /* ignore */ }
      });
      feedsRef.current = {};
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (janusRef.current) {
        try { janusRef.current.destroy(); } catch { /* ignore */ }
        janusRef.current = null;
      }
      publisherRef.current = null;
    };
  }, [enabled, janusRoomId, userId, server, iceServers, publishOwnFeed, subscribeToFeed, removePeer]);

  const toggleMic = useCallback(() => {
    const h = publisherRef.current;
    if (!h) return;
    if (micOn) h.muteAudio(); else h.unmuteAudio();
    setMicOn(!micOn);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const h = publisherRef.current;
    if (!h) return;
    if (camOn) h.muteVideo(); else h.unmuteVideo();
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !camOn; });
    }
    setCamOn(!camOn);
  }, [camOn]);

  return {
    localVideoRef,
    peers,
    connectionStatus,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    error,
  };
}
