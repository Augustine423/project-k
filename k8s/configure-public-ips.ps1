# After: kubectl apply -f k8s/
# Run:   powershell -File k8s/configure-public-ips.ps1
#
# Patches PUBLIC_HOST / TURN_HOST / LIVEKIT_PUBLIC_URL, restarts pods,
# and prints gcloud firewall + HTTPS URL for cam/mic testing.

$ErrorActionPreference = "Stop"

function Wait-ExternalIp([string]$Service, [int]$TimeoutSec = 300) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $ip = kubectl get svc $Service -o jsonpath="{.status.loadBalancer.ingress[0].ip}" 2>$null
    if (-not $ip) {
      $ip = kubectl get svc $Service -o jsonpath="{.status.loadBalancer.ingress[0].hostname}" 2>$null
    }
    if ($ip) { return $ip }
    Write-Host "Waiting for $Service EXTERNAL-IP..."
    Start-Sleep -Seconds 5
  }
  throw "Timed out waiting for EXTERNAL-IP on service/$Service"
}

function Get-CoturnNodeExternalIp {
  $node = kubectl get pod -l app=coturn -o jsonpath="{.items[0].spec.nodeName}" 2>$null
  if (-not $node) { throw "coturn pod not found — apply manifests first" }
  $ip = kubectl get node $node -o jsonpath="{.status.addresses[?(@.type=='ExternalIP')].address}" 2>$null
  if (-not $ip) {
    $ip = kubectl get node $node -o jsonpath="{.status.addresses[?(@.type=='InternalIP')].address}" 2>$null
  }
  if (-not $ip) { throw "Could not resolve node IP for coturn on node $node" }
  return $ip
}

Write-Host "==> Waiting for web LoadBalancer..."
$webIp = Wait-ExternalIp "kzys-web"
Write-Host "    WEB_LB_IP = $webIp"

Write-Host "==> Resolving coturn node IP (hostNetwork)..."
$deadline = (Get-Date).AddSeconds(180)
$turnIp = $null
while ((Get-Date) -lt $deadline) {
  try {
    $turnIp = Get-CoturnNodeExternalIp
    break
  } catch {
    Write-Host "Waiting for coturn pod..."
    Start-Sleep -Seconds 5
  }
}
if (-not $turnIp) { throw "Timed out waiting for coturn pod/node IP" }
Write-Host "    TURN_HOST = $turnIp"

$patchJson = @"
{"data":{"PUBLIC_HOST":"$webIp","TURN_HOST":"$turnIp","LIVEKIT_PUBLIC_URL":"wss://$webIp/livekit"}}
"@

Write-Host "==> Patching ConfigMap kzys-app-config..."
kubectl patch configmap kzys-app-config --type merge -p $patchJson

Write-Host "==> Restarting web, coturn, control-plane..."
kubectl rollout restart deploy/kzys-web deploy/coturn deploy/kzys-control-plane
kubectl rollout status deploy/kzys-web --timeout=180s
kubectl rollout status deploy/coturn --timeout=180s
kubectl rollout status deploy/kzys-control-plane --timeout=180s

Write-Host ""
Write-Host "Open (accept self-signed cert warning for cam/mic):"
Write-Host "  https://$webIp/"
Write-Host ""
Write-Host "Open GKE node firewall for WebRTC (once per project), adjust --target-tags to your node tags:"
Write-Host @"
  gcloud compute firewall-rules create project-k-webrtc --allow udp:3478,tcp:3478,udp:20000-20999,tcp:7881,udp:50000-50999 --direction=INGRESS --source-ranges=0.0.0.0/0 --target-tags=TAG_FROM_gcloud_compute_instances_list
"@
