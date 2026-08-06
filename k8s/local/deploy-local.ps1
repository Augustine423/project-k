# Deploy MeetingMax k8s stack for local laptop + phone-on-LAN testing.
# Usage (from MeetingMax repo root OR any cwd):
#   powershell -ExecutionPolicy Bypass -File k8s/local/deploy-local.ps1
#   powershell -ExecutionPolicy Bypass -File k8s/local/deploy-local.ps1 -LanIp 192.168.1.5
param(
  [string]$LanIp = ""
)

$ErrorActionPreference = "Stop"
# .../MeetingMax/k8s/local → MeetingMax
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root
Write-Host "Repo root: $Root"

kubectl cluster-info 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Error @"
No Kubernetes API on this machine.

Do this first:
  1) Docker Desktop → Settings → Kubernetes → Enable Kubernetes → Apply
  2) Wait until kubectl get nodes works
  3) Install a LoadBalancer provider if EXTERNAL-IP stays <pending>
     (cloud-provider-kind / MetalLB / Docker Desktop cloud LB)
  4) Re-run this script
"@
}

Write-Host "Applying local kustomize overlay…"
kubectl apply -k k8s/local
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Waiting for core pods…"
kubectl rollout status deployment/redis --timeout=180s
kubectl rollout status deployment/kzys-control-plane --timeout=300s
kubectl rollout status deployment/livekit --timeout=300s
kubectl rollout status deployment/coturn --timeout=180s
kubectl rollout status deployment/kzys-web --timeout=300s

& (Join-Path $Root "k8s\configure-public-ips.ps1") -LanIp $LanIp

Write-Host ""
Write-Host "Services:"
kubectl get svc kzys-web,kzys-livekit,coturn,kzys-control-plane -o wide
Write-Host ""
Write-Host "Pods:"
kubectl get pods -o wide
Write-Host ""
Write-Host "Done. On phone (same Wi‑Fi): open https://<LAN_IP>/ and accept the cert warning."
