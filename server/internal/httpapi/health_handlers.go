package httpapi

import "net/http"

func (h *Handlers) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := h.Redis.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "redis unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
