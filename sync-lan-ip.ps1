# Auto-detect this PC's Wi‑Fi/LAN IPv4 and stamp it into docker compose env files.
#
#   cd MeetingMax
#   .\sync-lan-ip.ps1
#   .\sync-lan-ip.ps1 -Restart          # also recreate compose services
#   .\sync-lan-ip.ps1 -LanIP 192.168.1.12
#   .\sync-lan-ip.ps1 -Hub              # Hub-only compose overlay
param(
  [string] $LanIP = $env:LAPTOP_LAN_IP,
  [switch] $Restart,
  [switch] $Hub
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Get-LaptopLanIPv4 {
  # Prefer the interface that owns the default route (real Wi‑Fi/LAN, not WSL/vEthernet).
  $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric, InterfaceMetric |
    Select-Object -First 1
  if ($route) {
    $addr = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" } |
      Select-Object -First 1
    if ($addr -and $addr.IPAddress) { return [string]$addr.IPAddress }
  }

  $fallback = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.PrefixOrigin -in @("Dhcp", "Manual") -and
      $_.IPAddress -notmatch "^(127\.|169\.254\.|172\.1[6-9]\.|172\.2[0-9]\.|172\.3[0-1]\.)"
    } |
    Select-Object -First 1
  if ($fallback) { return [string]$fallback.IPAddress }
  throw "Could not detect a LAN IPv4. Pass -LanIP 192.168.x.x"
}

function Set-DotEnvLanIp([string] $Path, [string] $Ip) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Warning "Skip missing file: $Path"
    return
  }
  $text = [System.IO.File]::ReadAllText($Path)
  $text = [regex]::Replace($text, '(?m)^PUBLIC_HOST=.*$', "PUBLIC_HOST=$Ip")
  $text = [regex]::Replace($text, '(?m)^LIVEKIT_NODE_IP=.*$', "LIVEKIT_NODE_IP=$Ip")
  $text = [regex]::Replace($text, '(?m)^LIVEKIT_PUBLIC_URL=.*$', "LIVEKIT_PUBLIC_URL=wss://$Ip/livekit")
  # Refresh common comment examples that still show an old LAN IP.
  $text = [regex]::Replace($text, 'https://192\.168\.\d+\.\d+', "https://$Ip")
  $text = [regex]::Replace($text, 'wss://192\.168\.\d+\.\d+/livekit', "wss://$Ip/livekit")
  [System.IO.File]::WriteAllText($Path, $text)
  Write-Host "Updated $Path"
}

if (-not $LanIP) { $LanIP = Get-LaptopLanIPv4 }
if ($LanIP -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
  throw "Invalid IPv4: $LanIP"
}

Write-Host "Detected LAN IP: $LanIP"

Set-DotEnvLanIp (Join-Path $Root ".env") $LanIP
Set-DotEnvLanIp (Join-Path $Root "web\.env") $LanIP

# Keep k8s local ConfigMaps in sync when present (compose-first; apply separately).
$k8sLocal = Join-Path $Root "k8s\local"
if (Test-Path -LiteralPath $k8sLocal) {
  foreach ($name in @(
      "01-configmap-host.yaml",
      "01-configmap-livekit.yaml",
      "01-configmap-coturn.yaml"
    )) {
    $path = Join-Path $k8sLocal $name
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $cm = [System.IO.File]::ReadAllText($path)
    $cm = $cm -replace 'PUBLIC_HOST: "[^"]+"', "PUBLIC_HOST: `"$LanIP`""
    $cm = $cm -replace 'TURN_HOST: "[^"]+"', "TURN_HOST: `"$LanIP`""
    $cm = $cm -replace 'LIVEKIT_NODE_IP: "[^"]+"', "LIVEKIT_NODE_IP: `"$LanIP`""
    $cm = $cm -replace 'LIVEKIT_MEDIA_IP: "[^"]+"', "LIVEKIT_MEDIA_IP: `"$LanIP`""
    $cm = $cm -replace 'LIVEKIT_PUBLIC_URL: "[^"]+"', "LIVEKIT_PUBLIC_URL: `"wss://$LanIP/livekit`""
    [System.IO.File]::WriteAllText($path, $cm)
    Write-Host "Updated $path"
  }
}

if ($Restart) {
  Push-Location $Root
  try {
    if ($Hub) {
      docker compose -f docker-compose.yaml -f docker-compose.image.yaml up -d --force-recreate
    } else {
      docker compose up -d --force-recreate
    }
    if ($LASTEXITCODE -ne 0) { throw "docker compose recreate failed ($LASTEXITCODE)" }
  }
  finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host "Open  https://$LanIP/  (accept self-signed cert for mic/cam)"
if (-not $Restart) {
  Write-Host "Recreate stack to apply ICE/TURN host:"
  Write-Host "  .\sync-lan-ip.ps1 -Restart"
  Write-Host "  .\sync-lan-ip.ps1 -Restart -Hub"
}
