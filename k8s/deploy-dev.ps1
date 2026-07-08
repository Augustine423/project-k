#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot

Write-Host "=== KZYS GCP deploy (LoadBalancer frontend + TURN) ===" -ForegroundColor Cyan

kubectl version --client *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error "kubectl not found. Install kubectl and enable Kubernetes."
}

function Wait-LbIp {
    param([string]$ServiceName)
    Write-Host "Waiting for LoadBalancer IP on service/$ServiceName..." -ForegroundColor Yellow
    for ($i = 0; $i -lt 60; $i++) {
        $ip = kubectl get svc $ServiceName -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>$null
        if (-not $ip) {
            $ip = kubectl get svc $ServiceName -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>$null
        }
        if ($ip) { return $ip }
        Start-Sleep -Seconds 5
    }
    throw "Timed out waiting for LoadBalancer on $ServiceName"
}

$manifests = @(
    "livekit-secrets.yaml",
    "turn-secrets.yaml",
    "kzys-gcp-endpoints.yaml",
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

$frontendIp = Wait-LbIp "kzys-frontend"
$turnIp = Wait-LbIp "kzys-coturn"

Write-Host "Patching kzys-gcp-endpoints (turn-host=$turnIp)..." -ForegroundColor Yellow
kubectl patch configmap kzys-gcp-endpoints --type merge -p "{`"data`":{`"turn-host`":`"$turnIp`"}}"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Restarting workloads that use TURN / external IP config..." -ForegroundColor Yellow
foreach ($d in @("deployment/kzys-coturn", "deployment/livekit-sfu", "deployment/kzys-backend-csharp")) {
    kubectl rollout restart $d
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

Write-Host ""
Write-Host "=== Ready ===" -ForegroundColor Green
Write-Host "Open app:        http://${frontendIp}/"
Write-Host "LiveKit signal:  ws://${frontendIp}/rtc  (proxied via frontend nginx)"
Write-Host "TURN (coturn):   turn:${turnIp}:3478"
Write-Host ""
Write-Host "Service types:"
Write-Host "  kzys-frontend     LoadBalancer  (public HTTP)"
Write-Host "  kzys-coturn       LoadBalancer  (public UDP/TCP TURN)"
Write-Host "  livekit-sfu       ClusterIP     (internal, via /rtc proxy)"
Write-Host "  kzys-backend-*    ClusterIP     (internal)"
Write-Host "  kzys-redis        ClusterIP     (internal headless)"
