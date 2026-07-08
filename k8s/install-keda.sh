#!/usr/bin/env bash
# Install KEDA for SFU autoscaling (run once per cluster, requires Helm).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v helm >/dev/null || { echo "helm not found — install Helm first"; exit 1; }

echo "Installing KEDA..."
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm upgrade --install keda kedacore/keda \
  --namespace keda --create-namespace \
  --wait

echo "Applying LiveKit ScaledObject..."
kubectl apply -f "${SCRIPT_DIR}/optional/keda-scaledobject.yaml.example"

echo "KEDA ready."
