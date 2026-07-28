# Codebase & Architecture Improvements (Code Quality Upgrades)

To bring the project codebase to a 9.5/10+ level, the following logic and feature implementations are recommended.

---

## 1. Implement Webinar Mode Switch Logic
> [!IMPORTANT]
> The dynamic scaling capability to handle 10,000+ webinar participants is currently stubbed out in [RoomModeService.cs](file:///C:/Users/kyawz/Desktop/project-k/backend-csharp/Services/RoomModeService.cs#L122-L136). The system always treats rooms as `Interactive`, bypassing the webinar-scale safety limits.

### Action Item
Implement dynamic transitions based on configuration thresholds in `EvaluateMode`:
```csharp
public string EvaluateMode(string currentMode, int totalParticipants, int publishers, int listeners)
{
    // Threshold to promote to webinar (e.g. 45 users) and demote to interactive (e.g. 20 users)
    if (currentMode == RoomModes.Interactive && totalParticipants >= _config.WebinarEnterListeners)
    {
        return RoomModes.Webinar;
    }
    if (currentMode == RoomModes.Webinar && totalParticipants <= _config.WebinarExitListeners)
    {
        return RoomModes.Interactive;
    }
    return currentMode;
}

public bool ShouldJoinAsListener(RoomRecord room, ParticipantRecord participant)
{
    if (participant.Role is ParticipantRoles.Host or ParticipantRoles.CoHost)
        return false;

    // In webinar mode, standard participants join as listeners (subscribe-only) by default
    return room.Mode == RoomModes.Webinar;
}
```

---

## 2. Eliminate Redundant Polling in React
> [!TIP]
> In [RoomPage.tsx:L41-L49](file:///C:/Users/kyawz/Desktop/project-k/web/src/pages/RoomPage.tsx#L41-L49), the frontend calls `listParticipants` API on every socket connection/disconnect event. 

### Action Item
Rely on the LiveKit Client SDK's state synchronization rather than polling HTTP API endpoints for room rosters:
*   Instead of manually fetching participants via HTTP, listen to LiveKit events: `RoomEvent.ParticipantConnected` and `RoomEvent.ParticipantDisconnected`. This reduces load on the C# control plane during peak entry/exit phases.

---

## 3. Dynamic TURN Credential Refreshing
*   **The Issue:** Turn credentials minted in [TurnCredentialService.cs](file:///C:/Users/kyawz/Desktop/project-k/backend-csharp/Services/TurnCredentialService.cs) have a hard TTL. If a webinar runs longer than the credential TTL, WebRTC renegotiations will fail if connection drops.
*   **Action Item:** Provide an endpoint `/api/rooms/{roomId}/turn` to allow clients to request fresh TURN configurations on the fly before a token or TURN username expires.

---

## 4. DB Migration & Seeding Resilience
*   **The Issue:** [DatabaseSeeder.cs](file:///C:/Users/kyawz/Desktop/project-k/backend-csharp/Services/DatabaseSeeder.cs) initializes seed data, but during high availability rolling updates, multiple replicas starting up simultaneously might encounter SQLite locks or write conflicts when attempting migrations.
*   **Action Item:** Execute database migrations during your CI/CD deployment pipelines (e.g. via EF bundle/CLI tasks) rather than inside the application startup process (`Program.cs`).
