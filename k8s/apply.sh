#!/usr/bin/env bash
# Apply core manifests only (no KEDA / ingress / HPA extras).
set -euo pipefail
exec "$(dirname "$0")/deploy-dev.sh"
