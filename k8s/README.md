# MeetingMax Kubernetes

Only two environments:

| Folder | Machine | Frontend | LiveKit media / Coturn | API / Redis / signal |
|---|---|---|---|---|
| **`local/`** | Laptop kind (ALB only) | ALB / web LB :80/:443 | **hostPort** (no NLB) | ClusterIP |
| **`staging/`** | Cloud staging | GCE Ingress (ALB) | L4 LoadBalancer (NLB) | ClusterIP |

```powershell
# Laptop — create kind (1 node default; add workers in cluster/kind.yaml)
kind create cluster --name local --config MeetingMax\k8s\local\cluster\kind.yaml
cd MeetingMax\k8s\local
.\apply-local.ps1
# later: kubectl apply -f .

# Cloud staging
cd MeetingMax\k8s\staging
kubectl apply -f 00-namespace.yaml
kubectl apply -f .
```
