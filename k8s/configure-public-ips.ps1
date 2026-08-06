# Detect Wi‑Fi / Ethernet LAN IP and patch kzys-app-config for phone testing.
# Usage:
#   powershell -ExecutionPolicy Bypass -File k8s/configure-public-ips.ps1
#   powershell -ExecutionPolicy Bypass -File k8s/configure-public-ips.ps1 -LanIp 192.168.1.5
param(
  [string]$LanIp = "",
  [string]$Namespace = "default"
)

$ErrorActionPreference = "Stop"

function Get-LanIPv4 {
  # Prefer Wi‑Fi / Ethernet private LAN addresses (skip Docker/WSL virtual NICs).
  $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
      $_.PrefixOrigin -ne "WellKnown" -and
      $_.InterfaceAlias -notmatch 'WSL|vEthernet|Docker|Loopback|VirtualBox|Hyper-V'
    } |
    Sort-Object -Property InterfaceMetric |
    Select-Object -ExpandProperty IPAddress -Unique

  # Prefer 192.168.x / 10.x home LAN
  $preferred = $candidates | Where-Object { $_ -match '^(192\.168\.|10\.)' } | Select-Object -First 1
  if ($preferred) { return $preferred }
  if ($candidates -and $candidates.Count -gt 0) { return $candidates[0] }
  return ""
}

if (-not $LanIp) {
  $LanIp = Get-LanIPv4
}

if (-not $LanIp) {
  Write-Error "Could not detect LAN IP. Pass -LanIp 192.168.x.x explicitly."
}

Write-Host "Using LAN IP: $LanIp"

# Verify cluster is up
kubectl cluster-info 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Error "No Kubernetes cluster. Enable Docker Desktop Kubernetes (or start kind/minikube), then retry."
}

$patch = @"
[
  {"op":"replace","path":"/data/PUBLIC_HOST","value":"$LanIp"},
  {"op":"replace","path":"/data/TURN_HOST","value":"$LanIp"},
  {"op":"replace","path":"/data/LIVEKIT_PUBLIC_URL","value":"wss://$LanIp/livekit"}
]
"@

kubectl patch configmap kzys-app-config -n $Namespace --type=json -p $patch

Write-Host "Restarting web + coturn + control-plane so PUBLIC_HOST / TURN / LiveKit URLs apply…"
kubectl rollout restart deployment/kzys-web deployment/coturn deployment/kzys-control-plane -n $Namespace
kubectl rollout status deployment/kzys-web -n $Namespace --timeout=180s
kubectl rollout status deployment/kzys-control-plane -n $Namespace --timeout=180s

Write-Host ""
Write-Host "Phone test URLs (same Wi‑Fi as this laptop):"
Write-Host "  https://$LanIp/"
Write-Host "  https://$LanIp:30443/   (NodePort fallback if LoadBalancer EXTERNAL-IP is pending)"
Write-Host ""
Write-Host "Accept the self-signed certificate warning on phone (required for mic/cam)."
Write-Host "Firewall: allow inbound TCP 80,443,30080,30443,7880,7881 and UDP 3478,20000-20999,50000-50999"
