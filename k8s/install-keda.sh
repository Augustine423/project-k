#!/usr/bin/env bash
# Install KEDA for scale-to-zero (run once per cluster).
set -euo pipefail
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm upgrade --install keda kedacore/keda \
  --namespace keda --create-namespace \
  --wait
