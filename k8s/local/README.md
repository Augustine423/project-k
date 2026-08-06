# MeetingMax — kind local (2 workers)

Your cluster shape (OK for this folder):

```text
local-control-plane
local-worker
local-worker2
```

LiveKit runs **1 pod per worker** (2 replicas + anti-affinity). Other services prefer workers (not control-plane).

## Apply (no scripts)

1. Edit `01-configmap.yaml` if your Wi‑Fi IP is not `192.168.1.5`:
   - `PUBLIC_HOST`
   - `TURN_HOST`
   - `LIVEKIT_NODE_IP`
   - `LIVEKIT_PUBLIC_URL` (`wss://<LAN_IP>/livekit`)

2. Deploy:

```powershell
cd C:\Users\kyawz\Desktop\project-k\MeetingMax\k8s\local
kubectl apply -f .
```

3. Check:

```powershell
kubectl get nodes -o wide
kubectl get pods -o wide
kubectl get svc
```

Expect LiveKit on **two different workers**.

4. Phone (same Wi‑Fi as laptop):

```text
https://192.168.1.5/
```

Accept the self-signed cert warning (needed for mic/cam).

## LoadBalancer

Keep your cloud-provider LB running so `kzys-web` / `coturn` / `kzys-livekit-lb` get EXTERNAL-IP.

If web EXTERNAL-IP is only `127.0.0.1`, phone still uses the **LAN IP** in the ConfigMap (`https://192.168.1.5/`) once the LB forwards host ports 80/443.

## Do not use

```powershell
kubectl apply -f ../   # GKE manifests (3 LiveKit / hostNetwork / heavy CPU)
```

Use **only** `k8s/local` for this kind laptop cluster.
