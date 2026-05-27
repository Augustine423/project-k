/* WebRTC Integration for Frontend */
class KZYSWebRTC {
    constructor() {
        this.peerConnections = new Map();
        this.localStream = null;
        this.ws = null;
        this.roomId = null;
        this.userId = null;
        this.isReady = false;
    }
    
    async init(roomId, userId) {
        this.roomId = roomId;
        this.userId = userId;
        
        this.localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
        
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log("WebSocket Connected!");
                this.isReady = true;
                this.send({ type: 'join', room: roomId, user: userId });
                resolve();
            };
            
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onerror = (err) => reject(err);
        });
    }
    
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn("WebSocket not ready, queuing message:", message.type);
        }
    }
    
    handleMessage(event) {
        try {
            const msg = JSON.parse(event.data);
            switch(msg.type) {
                case 'joined':
                    console.log('Joined room, users:', msg.users);
                    break;
                case 'new_participant':
                    this.createPeerConnection(msg.userId);
                    break;
                case 'offer':
                    this.handleOffer(msg);
                    break;
                case 'answer':
                    this.handleAnswer(msg);
                    break;
                case 'ice':
                    this.handleICECandidate(msg);
                    break;
            }
        } catch (e) {
            console.error("Malformed WebSocket message received:", e);
        }
    }
    
    createPeerConnection(remoteUserId) {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
        });
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.send({
                    type: 'ice',
                    to: remoteUserId,
                    candidate: event.candidate
                });
            }
        };
        
        pc.ontrack = (event) => {
            this.addRemoteVideo(remoteUserId, event.streams[0]);
        };
        
        this.peerConnections.set(remoteUserId, pc);
        return pc;
    }
    
    async handleOffer(msg) {
        const pc = this.peerConnections.get(msg.from) || this.createPeerConnection(msg.from);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send({
            type: 'answer',
            to: msg.from,
            sdp: answer
        });
    }
    
    async handleAnswer(msg) {
        const pc = this.peerConnections.get(msg.from);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
    }
    
    handleICECandidate(msg) {
        const pc = this.peerConnections.get(msg.from);
        if (pc && msg.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }
    }
    
    addRemoteVideo(userId, stream) {
        const container = document.getElementById('videos');
        if (!container) return;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.id = `remote-${userId}`;
        container.appendChild(video);
    }
}
