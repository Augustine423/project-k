# KZYS — Janus VideoRoom (dev test)
#
# Deploy:
#   kubectl apply -f k8s/
#
# Open app:
#   kubectl get svc kzys-frontend
#   http://<EXTERNAL-IP>/
#
# Stack:
#   kzys-frontend       LoadBalancer  nginx (/api, /janus-ws)
#   kzys-backend-csharp ClusterIP    rooms + Janus config + chat
#   janus                 ClusterIP    VideoRoom SFU (hostNetwork)
#   kzys-coturn           NodePort     TURN 30478/30479
#   kzys-redis            ClusterIP    rooms + SignalR backplane
#
# Video logic: janus-gateway/html/demos/videoroom.js → frontend/src/useJanusVideoRoom.js
#
# Rebuild after code changes:
#   kubectl rollout restart deployment/kzys-frontend deployment/kzys-backend-csharp deployment/janus
