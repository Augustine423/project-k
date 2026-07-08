# KZYS — simple video rooms on Kubernetes
#
# Deploy:
#   kubectl apply -f k8s/
#
# Open app:
#   kubectl get svc kzys-frontend
#   http://<EXTERNAL-IP>/
#
# Stack:
#   kzys-frontend       LoadBalancer  HTTP + nginx (/api, /rtc)
#   kzys-backend-csharp ClusterIP    rooms + LiveKit tokens + TURN creds
#   livekit-sfu         ClusterIP    WebRTC SFU (hostNetwork UDP 50000-50100)
#   kzys-coturn         NodePort     TURN on 30478/30479 (same as dev branch)
#   kzys-redis          ClusterIP    room registry
#
# GCP firewall (allow WebRTC):
#   UDP 30478, TCP 30479  (TURN)
#   UDP 50000-50100       (LiveKit media)
#
# After code changes, rebuild & push images then:
#   kubectl rollout restart deployment/kzys-frontend deployment/kzys-backend-csharp
