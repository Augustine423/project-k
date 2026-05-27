/* WebRTC Integration for Frontend */
class KZYSWebRTC {
    constructor() {
        this.peerConnections = new Map();
        this.localStream = null;
        this.ws = null;
        this.roomId = null;
        this.userId = null;
        this.isReady = false; // Connection စစ်ဖို့ flag
    }
    
    async init(roomId, userId) {
        this.roomId = roomId;
        this.userId = userId;
        
        // 1. Get local media
        this.localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // 2. WebSocket Initialize
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
        
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log("WebSocket Connected!");
                this.isReady = true;
                // Join message ကို connection ပွင့်မှပို့ပါ
                this.send({ type: 'join', room: roomId, user: userId });
                resolve();
            };
            
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onerror = (err) => reject(err);
        });
    }
    
    send(message) {
        // Connection ပွင့်မှပဲ ပို့ဖို့ စစ်ပေးပါ
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn("WebSocket not ready, queuing message:", message.type);
        }
    }
    
    send(message) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
    
    handleMessage(event) {
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
    }
    
    createPeerConnection(remoteUserId) {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        // Add local stream
        this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
        });
        
        // ICE candidate handling
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.send({
                    type: 'ice',
                    to: remoteUserId,
                    candidate: event.candidate
                });
            }
        };
        
        // Remote stream handling
        pc.ontrack = (event) => {
            // Add remote video element
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
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.id = `remote-${userId}`;
        document.getElementById('videos').appendChild(video);
    }
}

// Usage
// const webrtc = new KZYSWebRTC();
// await webrtc.init(1234, 'user123');
