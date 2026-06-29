#!/bin/bash
# Optional: nginx ingress (only when you have DNS or want a single HTTP entrypoint).
set -e

echo "Installing nginx ingress controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/baremetal/deploy.yaml

echo "Waiting for controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo "Applying optional ingress rules..."
kubectl apply -f optional/ingress.yaml

NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
INGRESS_PORT=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.spec.ports[?(@.port==80)].nodePort}')
echo "Ingress access: http://${NODE_IP}:${INGRESS_PORT}/"
echo "NodePort access (dev): http://${NODE_IP}:31498/"
