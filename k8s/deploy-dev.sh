#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== KZYS GCP deploy (LoadBalancer frontend + TURN) ==="

command -v kubectl >/dev/null || { echo "kubectl not found"; exit 1; }

wait_lb_ip() {
  local svc="$1"
  local ip=""
  echo "Waiting for LoadBalancer IP on service/${svc}..."
  for _ in $(seq 1 60); do
    ip="$(kubectl get svc "${svc}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
    if [[ -z "${ip}" ]]; then
      ip="$(kubectl get svc "${svc}" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
    fi
    if [[ -n "${ip}" ]]; then
      echo "${ip}"
      return 0
    fi
    sleep 5
  done
  echo "Timed out waiting for LoadBalancer on ${svc}" >&2
  return 1
}

MANIFESTS=(
  livekit-secrets.yaml
  turn-secrets.yaml
  kzys-gcp-endpoints.yaml
  config-init-scripts.yaml
  kzys-redis-service.yaml
  kzys-redis-statefulset.yaml
  kzys-backend-csharp-deployment.yaml
  kzys-backend-csharp-service.yaml
  kzys-backend-go-deployment.yaml
  kzys-backend-go-service.yaml
  kzys-frontend-deployment.yaml
  kzys-frontend-service.yaml
  kzys-coturn-deployment.yaml
  kzys-coturn-service.yaml
  livekit-sfu-deployment.yaml
  livekit-sfu-service.yaml
)

echo "Applying manifests..."
for manifest in "${MANIFESTS[@]}"; do
  kubectl apply -f "${SCRIPT_DIR}/${manifest}"
done

FRONTEND_IP="$(wait_lb_ip kzys-frontend)"
TURN_IP="$(wait_lb_ip kzys-coturn)"

echo "Patching kzys-gcp-endpoints (turn-host=${TURN_IP})..."
kubectl patch configmap kzys-gcp-endpoints --type merge \
  -p "{\"data\":{\"turn-host\":\"${TURN_IP}\"}}"

echo "Restarting workloads that use TURN / external IP config..."
for d in deployment/kzys-coturn deployment/livekit-sfu deployment/kzys-backend-csharp; do
  kubectl rollout restart "${d}"
done

for d in deployment/kzys-frontend deployment/kzys-backend-csharp deployment/kzys-backend-go deployment/livekit-sfu deployment/kzys-coturn statefulset/kzys-redis; do
  echo "Waiting for ${d}..."
  kubectl rollout status "${d}" --timeout=300s || echo "Warning: rollout slow for ${d}"
done

echo ""
echo "=== Ready ==="
echo "Open app:        http://${FRONTEND_IP}/"
echo "LiveKit signal:  ws://${FRONTEND_IP}/rtc  (proxied via frontend nginx)"
echo "TURN (coturn):   turn:${TURN_IP}:3478"
echo ""
echo "Service types:"
echo "  kzys-frontend     LoadBalancer  (public HTTP)"
echo "  kzys-coturn       LoadBalancer  (public UDP/TCP TURN)"
echo "  livekit-sfu       ClusterIP     (internal, via /rtc proxy)"
echo "  kzys-backend-*    ClusterIP     (internal)"
echo "  kzys-redis        ClusterIP     (internal headless)"
