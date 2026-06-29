#!/bin/bash
set -e

echo "Installing nginx ingress controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/baremetal/deploy.yaml

echo "Waiting for controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo "Ingress controller ready."
kubectl get svc -n ingress-nginx

echo ""
echo "Deploying KZYS application..."
kubectl apply -k .

echo ""
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
INGRESS_PORT=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.spec.ports[?(@.port==80)].nodePort}')
FRONTEND_PORT=31498
LIVEKIT_WS_PORT=30780
TURN_UDP_PORT=30478
TURN_TCP_PORT=30479

echo "=== KZYS dev/test access ==="
echo "App (ingress):     http://${NODE_IP}:${INGRESS_PORT}/"
echo "App (NodePort):    http://${NODE_IP}:${FRONTEND_PORT}/"
echo "LiveKit (direct):  ws://${NODE_IP}:${LIVEKIT_WS_PORT}/"
echo "TURN UDP:          turn:${NODE_IP}:${TURN_UDP_PORT}"
echo "TURN TCP:          turn:${NODE_IP}:${TURN_TCP_PORT}"
echo ""
echo "WebRTC via app uses wss://<host>/rtc (proxied through frontend nginx)."
echo "Node IP is auto-detected via status.hostIP for LiveKit ICE + TURN credentials."
