# Stamp this laptop's LAN IP into topic ConfigMaps, then:
#   kubectl apply -f .
#
#   cd MeetingMax\k8s\local
#   .\apply-local.ps1
#   .\apply-local.ps1 -LanIP 192.168.1.12
param(
  [string] $LanIP = $env:LAPTOP_LAN_IP
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-LaptopLanIPv4 {
  $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric, InterfaceMetric |
    Select-Object -First 1
  if ($route) {
    $addr = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" } |
      Select-Object -First 1
    if ($addr -and $addr.IPAddress) { return $addr.IPAddress }
  }

  $fallback = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.PrefixOrigin -in @("Dhcp", "Manual") -and
      $_.IPAddress -notmatch "^(127\.|169\.254\.|172\.1[6-9]\.|172\.2[0-9]\.|172\.3[0-1]\.)"
    } |
    Select-Object -First 1
  if ($fallback) { return $fallback.IPAddress }
  throw "Could not detect a LAN IPv4. Pass -LanIP 192.168.x.x"
}

if (-not $LanIP) { $LanIP = Get-LaptopLanIPv4 }
if ($LanIP -notmatch "^\d{1,3}(\.\d{1,3}){3}$") {
  throw "Invalid IPv4: $LanIP"
}

Write-Host "Laptop LAN IP: $LanIP"

function Set-ConfigMapLanIp([string] $FileName) {
  $path = Join-Path $PSScriptRoot $FileName
  $cm = [System.IO.File]::ReadAllText($path)
  $cm = $cm -replace 'PUBLIC_HOST: "[^"]+"', "PUBLIC_HOST: `"$LanIP`""
  $cm = $cm -replace 'TURN_HOST: "[^"]+"', "TURN_HOST: `"$LanIP`""
  $cm = $cm -replace 'LIVEKIT_NODE_IP: "[^"]+"', "LIVEKIT_NODE_IP: `"$LanIP`""
  $cm = $cm -replace 'LIVEKIT_MEDIA_IP: "[^"]+"', "LIVEKIT_MEDIA_IP: `"$LanIP`""
  $cm = $cm -replace 'LIVEKIT_PUBLIC_URL: "[^"]+"', "LIVEKIT_PUBLIC_URL: `"wss://$LanIP/livekit`""
  [System.IO.File]::WriteAllText($path, $cm)
}

Set-ConfigMapLanIp "01-configmap-host.yaml"
Set-ConfigMapLanIp "01-configmap-livekit.yaml"
Set-ConfigMapLanIp "01-configmap-coturn.yaml"
Write-Host "Updated host / livekit / coturn ConfigMaps"

# kubectl apply -f .  (non-recursive: cluster/kind.yaml is not applied)
Push-Location $PSScriptRoot
try {
  kubectl apply -f .
  if ($LASTEXITCODE -ne 0) { throw "kubectl apply -f . failed" }
}
finally {
  Pop-Location
}

kubectl delete svc kzys-livekit-nlb coturn --ignore-not-found
kubectl rollout restart deployment/kzys-web deployment/kzys-control-plane deployment/livekit deployment/coturn
kubectl rollout status deployment/livekit --timeout=120s
kubectl rollout status deployment/coturn --timeout=120s

& (Join-Path $PSScriptRoot "publish-media-ports.ps1")

Write-Host ""
Write-Host "Open  https://$LanIP/  (accept the self-signed cert for mic/cam)"
Write-Host "Media: laptop must accept TCP 7881 + UDP 7882 + TURN 3478 (Windows Firewall)."
