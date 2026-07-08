# KZYS — simple video rooms on Kubernetes
#
# Deploy:
#   kubectl apply -f k8s/
#   kubectl apply -f k8s/kzys-endpoint-setup.yaml   # waits for coturn LB IP, restarts pods
#
# Open app:
#   kubectl get svc kzys-frontend
#   http://<EXTERNAL-IP>/
#
# Camera on HTTP public IP is blocked by browsers. For local testing:
#   kubectl port-forward svc/kzys-frontend 8080:80
#   http://localhost:8080
#
# Stack:
#   kzys-frontend       LoadBalancer  HTTP + nginx (/api, /rtc)
#   kzys-backend-csharp ClusterIP    rooms + LiveKit tokens + TURN creds
#   livekit-sfu         ClusterIP    WebRTC SFU (hostNetwork UDP 50000-50100)
#   kzys-coturn         LoadBalancer  TURN relay (UDP/TCP 3478) — fixes pc connection
#   kzys-redis          ClusterIP    room registry
#
# After code changes, rebuild & push images then:
#   kubectl rollout restart deployment/kzys-frontend deployment/kzys-backend-csharp
