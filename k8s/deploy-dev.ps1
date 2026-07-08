#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot

Write-Host "=== KZYS dev deploy (no DNS, auto node IP) ===" -ForegroundColor Cyan

kubectl version --client *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error "kubectl not found. Install kubectl and enable Kubernetes (Docker Desktop)."
}

$manifests = @(
    "livekit-secrets.yaml",
    "turn-secrets.yaml",
    "config-init-scripts.yaml",
    "kzys-redis-service.yaml",
    "kzys-redis-statefulset.yaml",
    "kzys-backend-csharp-deployment.yaml",
    "kzys-backend-csharp-service.yaml",
    "kzys-backend-go-deployment.yaml",
    "kzys-backend-go-service.yaml",
    "kzys-frontend-deployment.yaml",
    "kzys-frontend-service.yaml",
    "kzys-coturn-deployment.yaml",
    "kzys-coturn-service.yaml",
    "livekit-sfu-deployment.yaml",
    "livekit-sfu-service.yaml"
)

Write-Host "Applying manifests..." -ForegroundColor Yellow
foreach ($manifest in $manifests) {
    kubectl apply -f (Join-Path $ScriptDir $manifest)
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$deployments = @(
    "deployment/kzys-frontend",
    "deployment/kzys-backend-csharp",
    "deployment/kzys-backend-go",
    "deployment/livekit-sfu",
    "deployment/kzys-coturn",
    "statefulset/kzys-redis"
)

Write-Host "Waiting for workloads (up to 5 min)..." -ForegroundColor Yellow
foreach ($d in $deployments) {
    kubectl rollout status $d --timeout=300s
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Rollout slow or failed for $d — check: kubectl get pods"
    }
}

$nodeIp = kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'
if (-not $nodeIp) {
    $nodeIp = kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="ExternalIP")].address}'
}
if (-not $nodeIp) {
    $nodeIp = "<NODE_IP>"
}

Write-Host ""
Write-Host "=== Ready ===" -ForegroundColor Green
Write-Host "Open app:        http://${nodeIp}:31498/"
Write-Host "LiveKit direct:  ws://${nodeIp}:7880/  (or via app at /rtc)"
Write-Host "TURN:            turn:${nodeIp}:3478"
Write-Host ""
Write-Host "TURN_HOST + LiveKit node_ip use status.hostIP (no DNS needed)."
Write-Host "Rebuild images if you changed App.js / TurnController / nginx.conf."
