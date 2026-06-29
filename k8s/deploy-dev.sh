#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== KZYS dev deploy (no DNS, auto node IP) ==="

command -v kubectl >/dev/null || { echo "kubectl not found"; exit 1; }

echo "Applying manifests..."
kubectl apply -k "${SCRIPT_DIR}/overlays/dev"

for d in deployment/kzys-frontend deployment/kzys-backend-csharp deployment/livekit-sfu deployment/kzys-coturn statefulset/kzys-redis; do
  echo "Waiting for ${d}..."
  kubectl rollout status "${d}" --timeout=300s || echo "Warning: rollout slow for ${d}"
done

NODE_IP="$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')"
if [[ -z "${NODE_IP}" ]]; then
  NODE_IP="$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="ExternalIP")].address}')"
fi
NODE_IP="${NODE_IP:-<NODE_IP>}"

echo ""
echo "=== Ready ==="
echo "Open app:        http://${NODE_IP}:31498/"
echo "LiveKit direct:  ws://${NODE_IP}:7880/  (or via app at /rtc)"
echo "TURN:            turn:${NODE_IP}:3478"
echo ""
echo "TURN_HOST + LiveKit node_ip use status.hostIP (no DNS needed)."
