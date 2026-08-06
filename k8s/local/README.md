# Local laptop Kubernetes — phone on Wi‑Fi

## Can you test locally?

**Yes**, with this layout:

```text
Laptop (host)  Wi‑Fi IP e.g. 192.168.1.5
   ├─ Kubernetes + LoadBalancer (or NodePort 30443)
   └─ MeetingMax (web / API / LiveKit / coturn)

Phone (same Wi‑Fi)
   └─ Browser → https://192.168.1.5/
```

Phone must be on the **same Wi‑Fi**, not mobile data. Do **not** use `localhost` / `127.0.0.1` on the phone.

## Current repo status (checked)

| Item | Status |
|------|--------|
| Base `k8s/` manifests | GKE-oriented (3 LiveKit nodes, heavy CPU) |
| `configure-public-ips.ps1` | Added (was missing) |
| Local overlay `k8s/local/` | Added (1 LiveKit, small resources, LB + NodePort) |
| Cluster on this PC right now | **Not running** (`kubectl` → localhost:8080 refused) |
| Your Wi‑Fi LAN IP | **192.168.1.5** |

## 1) Enable Kubernetes on Windows

Docker Desktop → **Settings → Kubernetes → Enable Kubernetes** → Apply & Restart.

Confirm:

```powershell
kubectl get nodes
```

## 2) LoadBalancer provider

`kzys-web` is `type: LoadBalancer`.

- If EXTERNAL-IP becomes your LAN IP (or a reachable IP) → use `https://<EXTERNAL-IP>/`
- If EXTERNAL-IP stays `<pending>` → use NodePort fallback: `https://192.168.1.5:30443/`

Your cloud-provider LB on the desktop is fine when it assigns an IP phones can reach on LAN.

## 3) Deploy local stack

From `MeetingMax`:

```powershell
powershell -ExecutionPolicy Bypass -File k8s/local/deploy-local.ps1 -LanIp 192.168.1.5
```

Or auto-detect LAN IP:

```powershell
powershell -ExecutionPolicy Bypass -File k8s/local/deploy-local.ps1
```

## 4) Phone test checklist

1. Laptop + phone on same Wi‑Fi  
2. On phone open `https://192.168.1.5/` (or `:30443` if needed)  
3. Accept self-signed cert warning (needed for mic/cam)  
4. Create/join meeting  
5. Windows Firewall: allow TCP `80,443,30080,30443,7880,7881` and UDP `3478,20000-20999,50000-50999`

## Faster alternative (no k8s): Docker Compose LAN

If k8s is still installing, Compose works sooner for phone A/V:

```powershell
# In MeetingMax/.env set:
# PUBLIC_HOST=192.168.1.5
# LIVEKIT_NODE_IP=192.168.1.5
# LIVEKIT_PUBLIC_URL=ws://192.168.1.5:7880

docker compose up -d --build
```

Then phone → `https://192.168.1.5/` (port 80/443 from compose web service).

## What will NOT work

- Phone → `https://localhost` (localhost is the phone itself)  
- Phone → `127.0.0.1` on laptop  
- Phone on mobile data while laptop is on home Wi‑Fi  
- Current stock GKE manifests alone on a single laptop (3 LiveKit replicas + anti-affinity + heavy CPU)
