/* WebRTC Integration for Frontend */
class KZYSWebRTC {
    constructor() {
        this.peerConnections = new Map();
        this.localStream = null;
        this.ws = null;
        this.roomId = null;
        this.userId = null;
    }
    
    async init(roomId, userId) {
        this.roomId = roomId;
        this.userId = userId;
        
        // Get local media
        this.localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Connect WebSocket - Use relative path for Docker
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
        // const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // const wsHost = window.location.hostname === 'localhost' ? 'localhost:8080' : window.location.host;
        // const wsUrl = `${wsProtocol}//${wsHost}/ws`;
        
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = this.handleMessage.bind(this);
        
        // Send join message
        this.send({
            type: 'join',
            room: roomId,
            user: userId
        });
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
