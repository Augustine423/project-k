# MeetingMax — laptop kind local

Works with **1 node or many**. Media/TURN stay on the control-plane so laptop `hostPort` mappings still work.

| Traffic | How (test only) |
|---|---|
| UI + `/api` `/ws` `/livekit` | ALB / web LoadBalancer :80/:443 |
| LiveKit signal | ClusterIP `kzys-livekit:7880` |
| LiveKit media / Coturn | **hostNetwork** on the control-plane + extraPortMappings (or `publish-media-ports.ps1`) |
| API / Redis / web | Any node (1-node kind is fine) |

`cluster/kind.yaml` is **only** for `kind create cluster`. It is not a Kubernetes object. `kubectl apply -f .` in this folder will not apply it.

## 1. Create kind (any worker count)

Default is **1 control-plane**. Uncomment extra `- role: worker` lines in `cluster/kind.yaml` if you want more nodes.

```powershell
kind create cluster --name local --config C:\Users\kyawz\Desktop\project-k\MeetingMax\k8s\local\cluster\kind.yaml
```

If the cluster already exists **without** those `extraPortMappings`, you do **not** have to recreate it: `.\apply-local.ps1` starts `publish-media-ports.ps1` (Docker proxy for ICE/TURN). Recreate only if you want mappings on the kind node itself.

**`could not establish pc connection` / Connecting to media server…** means HTTPS join worked but WebRTC ICE could not reach LiveKit. Typical laptop cause: 7881/3478 not published on Windows (kind `hostPort` is ignored; extraPortMappings missing). Fix is hostNetwork + published 7881/7882/3478.

## 2. Apply the app

Stamps your laptop LAN IP into the host / LiveKit / Coturn ConfigMaps, then runs `kubectl apply -f .`:

```powershell
cd C:\Users\kyawz\Desktop\project-k\MeetingMax\k8s\local
.\apply-local.ps1
```

After that, you can re-apply with:

```powershell
kubectl apply -f .
```

(IP is already in `01-configmap-host.yaml`, `01-configmap-livekit.yaml`, `01-configmap-coturn.yaml`. Re-run `.\apply-local.ps1` if Wi‑Fi IP changed.)

| ConfigMap file | Object | Topic |
|---|---|---|
| `01-configmap-app.yaml` | `kzys-config-app` | Room / webinar / API limits |
| `01-configmap-host.yaml` | `kzys-config-host` | Laptop `PUBLIC_HOST` |
| `01-configmap-livekit.yaml` | `kzys-config-livekit` + `kzys-livekit-config` | ICE IPs, `livekit.yaml` |
| `01-configmap-coturn.yaml` | `kzys-config-coturn` + `coturn-config` | TURN host/ports, `turnserver.conf` |
| `01-configmap-nginx.yaml` | `kzys-web-nginx` | Frontend `/api` `/ws` `/livekit` proxy |

Override IP:

```powershell
.\apply-local.ps1 -LanIP 192.168.1.12
```

Build images first: `docker compose build` in `MeetingMax/`.

Open `https://<LAN_IP>/` and accept the self-signed cert.

If ICE still fails, allow inbound TCP 7881, UDP 7882, TCP/UDP 3478, UDP 20000 in Windows Firewall (run PowerShell as Administrator).

## Media port forwarder (not Coturn)

`media-publish/` is Alpine + socat. It is **not** Coturn. `.\apply-local.ps1` builds and starts it when kind has no extraPortMappings.

```powershell
cd C:\Users\kyawz\Desktop\project-k\MeetingMax\k8s\local
.\publish-media-ports.ps1
```
