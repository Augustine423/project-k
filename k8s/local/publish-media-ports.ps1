# Publish LiveKit ICE + Coturn onto the Windows host via media-publish Compose.
#
# Skip if the kind node already publishes 7881 (cluster created with extraPortMappings).

param(
  [string] $ControlPlane = "local-control-plane"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$proxyName = "kzys-media-publish"
$composeDir = Join-Path $PSScriptRoot "media-publish"

function Test-TcpOpen([string] $HostName, [int] $Port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $ar = $c.BeginConnect($HostName, $Port, $null, $null)
    $ok = $ar.AsyncWaitHandle.WaitOne(800, $false) -and $c.Connected
    $c.Close()
    return $ok
  } catch {
    return $false
  }
}

function Stop-Proxy {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  Push-Location $composeDir
  try {
    docker compose down --remove-orphans | Out-Null
  } finally {
    Pop-Location
    $ErrorActionPreference = $prev
  }
  cmd /c "docker rm -f $proxyName >nul 2>&1"
}

$published = docker port $ControlPlane 2>$null
if ($published -match "7881") {
  Write-Host "kind node already publishes 7881 (extraPortMappings). No proxy needed."
  Stop-Proxy
  exit 0
}

$cpJson = docker inspect $ControlPlane --format "{{json .NetworkSettings.Networks}}"
if (-not $cpJson) { throw "Cannot inspect $ControlPlane. Is the kind cluster running?" }
$nets = $cpJson | ConvertFrom-Json
$cpIp = $nets.kind.IPAddress
if (-not $cpIp) { throw "$ControlPlane has no IP on the kind Docker network." }

Write-Host "kind control-plane: $cpIp"
kubectl wait --for=condition=ready pod -l app=livekit --timeout=120s | Out-Null
kubectl wait --for=condition=ready pod -l app=coturn --timeout=120s | Out-Null

$env:CP_IP = $cpIp
Stop-Proxy
Push-Location $composeDir
try {
  docker compose up -d --build
  if ($LASTEXITCODE -ne 0) { throw "docker compose up media-publish failed" }
} finally {
  Pop-Location
}

Start-Sleep -Seconds 3
if (Test-TcpOpen "127.0.0.1" 7881) {
  Write-Host "Laptop :7881 (ICE-TCP) and :3478 (TURN) are published (kzys-media-publish)."
} else {
  Write-Host "WARN: 127.0.0.1:7881 not open yet. Check: docker logs $proxyName"
}
