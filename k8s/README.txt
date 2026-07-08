# KZYS — simple video rooms on Kubernetes
#
# Deploy everything:
#   kubectl apply -f k8s/
#
# Open app:
#   kubectl get svc kzys-frontend
#   http://<EXTERNAL-IP>/
#
# Stack:
#   kzys-frontend      LoadBalancer  HTTP + nginx (/api, /rtc)
#   kzys-backend-csharp ClusterIP    rooms + LiveKit tokens
#   livekit-sfu        ClusterIP    WebRTC SFU (hostNetwork for media)
#   kzys-redis         ClusterIP    room registry (scale LiveKit replicas later)
#
# Scale SFU for more users (future):
#   kubectl scale deployment/livekit-sfu --replicas=3
