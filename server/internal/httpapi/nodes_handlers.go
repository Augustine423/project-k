package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type NodeResponse struct {
	ID            string `json:"id"`
	AdminURL      string `json:"adminUrl"`
	InternalWsURL string `json:"internalWsUrl"`
	PublicWsURL   string `json:"publicWsUrl"`
	Load          int64  `json:"load"`
	Draining      bool   `json:"draining"`
}

func (h *Handlers) handleListNodes(w http.ResponseWriter, r *http.Request) {
	nodes := h.Router.All()
	response := make([]NodeResponse, len(nodes))

	for i, n := range nodes {
		load, err := h.Redis.GetNodeLoad(r.Context(), n.ID)
		if err != nil {
			h.Log.Error("failed to get node load", "nodeID", n.ID, "err", err)
			load = 0
		}

		draining, err := h.Redis.IsNodeDraining(r.Context(), n.ID)
		if err != nil {
			h.Log.Error("failed to check node draining status", "nodeID", n.ID, "err", err)
			draining = false
		}

		response[i] = NodeResponse{
			ID:            n.ID,
			AdminURL:      n.AdminURL,
			InternalWsURL: n.InternalWsURL,
			PublicWsURL:   n.PublicWsURL,
			Load:          load,
			Draining:      draining,
		}
	}

	writeJSON(w, http.StatusOK, response)
}

func (h *Handlers) handleDrainNode(w http.ResponseWriter, r *http.Request) {
	nodeID := chi.URLParam(r, "nodeID")
	if nodeID == "" {
		writeError(w, http.StatusBadRequest, "nodeID is required")
		return
	}

	err := h.Redis.SetNodeDraining(r.Context(), nodeID, true)
	if err != nil {
		h.Log.Error("failed to drain node", "nodeID", nodeID, "err", err)
		writeError(w, http.StatusInternalServerError, "failed to set node draining status")
		return
	}

	h.Log.Info("node marked as draining", "nodeID", nodeID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "draining", "nodeId": nodeID})
}

func (h *Handlers) handleUndrainNode(w http.ResponseWriter, r *http.Request) {
	nodeID := chi.URLParam(r, "nodeID")
	if nodeID == "" {
		writeError(w, http.StatusBadRequest, "nodeID is required")
		return
	}

	err := h.Redis.SetNodeDraining(r.Context(), nodeID, false)
	if err != nil {
		h.Log.Error("failed to undrain node", "nodeID", nodeID, "err", err)
		writeError(w, http.StatusInternalServerError, "failed to clear node draining status")
		return
	}

	h.Log.Info("node draining status cleared", "nodeID", nodeID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "active", "nodeId": nodeID})
}
