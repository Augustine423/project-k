package httpapi

import (
	"context"
	"net/http"
	"time"
)

type healthResponse struct {
	Status  string            `json:"status"`
	Service string            `json:"service"`
	Phase   string            `json:"phase"`
	Checks  map[string]string `json:"checks"`
}

// handleHealth is the liveness probe — process is up; Redis may be degraded.
func (h *Handlers) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{
		Status:  "ok",
		Service: h.ServiceName,
		Phase:   "A",
		Checks:  map[string]string{"process": "ok"},
	})
}

// handleReady is the readiness probe — must pass before K8s sends traffic.
func (h *Handlers) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	checks := map[string]string{}
	ready := true

	if err := h.Redis.Ping(ctx); err != nil {
		checks["redis"] = "fail"
		ready = false
	} else {
		checks["redis"] = "ok"
	}

	status := http.StatusOK
	overall := "ok"
	if !ready {
		status = http.StatusServiceUnavailable
		overall = "degraded"
	}

	writeJSON(w, status, healthResponse{
		Status:  overall,
		Service: h.ServiceName,
		Phase:   "A",
		Checks:  checks,
	})
}
