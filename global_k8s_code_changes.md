# Global Kubernetes Deployment: Code Modifications Guide

To support a high-performance global conferencing network using Kubernetes, you cannot rely on static configuration files. The C# and React code must be updated to route traffic dynamically based on geography.

---

## 1. C# Backend: Geo-Location Ingress Resolution
> [!IMPORTANT]
> Currently, [RoomService.cs](file:///C:/Users/kyawz/Desktop/project-k/backend-csharp/Services/RoomService.cs#L147) uses a single static environment variable `LIVEKIT_PUBLIC_URL` for all users worldwide. If an Asian user joins a room hosted on a US server, they will experience extreme lag.

### Code Modification
Modify `RoomService.cs` to resolve the nearest regional LiveKit and TURN cluster based on the client's incoming IP address (using a GeoIP database or routing API):

```csharp
// In Services/RoomService.cs
private JoinTicketDto BuildTicket(RoomRecord room, ParticipantRecord participant, string mediaHost, string clientIp)
{
    // Resolve the closest regional endpoint
    var regionalIngress = IngressRouter.GetClosestEndpoint(clientIp); 
    
    return new JoinTicketDto
    {
        Room = room,
        Participant = participant,
        // Route client to their local region's ingress gateway
        LiveKitUrl = regionalIngress.LiveKitWsUrl, 
        LiveKitToken = _liveKit.CreateJoinToken(...),
        Turn = new TurnInfoDto
        {
            Urls = regionalIngress.TurnUrls,
            Username = username,
            Credential = credential
        }
    };
}
```

---

## 2. React Client: Enable Adaptive Streaming & Dynacast
> [!TIP]
> To save bandwidth globally, you must configure the LiveKit client SDK to dynamically adapt quality settings based on network conditions.

### Code Modification
In [LiveKitConference.tsx](file:///C:/Users/kyawz/Desktop/project-k/web/src/livekit/LiveKitConference.tsx) (or wherever the LiveKit `Room` object is instantiated), configure the connection options:

```typescript
const room = new Room({
  // Enable LiveKit adaptive streaming (stops rendering offscreen video)
  adaptiveStream: true, 
  
  // Enable dynacast (stops uploading video resolution that nobody is watching)
  dynacast: true, 
  
  // Configure client publish codecs
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
  },
  publishDefaults: {
    videoSimulcast: true, // Send multiple resolutions (low, mid, high)
  }
});
```

---

## 3. High Availability Redis Connection
Because the C# control plane uses Redis for Pub/Sub ([RoomEventHub.cs](file:///C:/Users/kyawz/Desktop/project-k/backend-csharp/Realtime/RoomEventHub.cs)) and locks ([ControlPlaneStore.cs](file:///C:/Users/kyawz/Desktop/project-k/backend-csharp/Services/ControlPlaneStore.cs)), global instances must connect to a globally replicated or clustered Redis cluster (e.g. AWS ElastiCache with Global Datastore, or GCP Memorystore).

*   **Code Update:** Modify the connection multiplexer configuration to support cluster endpoints, read-replicas, and automatic reconnection retry policies to survive inter-region connection blips.
