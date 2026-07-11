// Package router picks which Janus media node a new room should live on.
// Rooms are the unit of sharding: because each room is fully independent on
// the Janus side, spreading rooms across nodes by least-current-load is
// enough to make total platform capacity grow linearly as nodes are added,
// with zero code changes anywhere else -- just add a node to JANUS_NODES
// (or, in Kubernetes, to the pool the autoscaler manages).
package router

import (
	"context"
	"fmt"

	"projectk/server/internal/config"
)

type LoadReader interface {
	GetNodeLoad(ctx context.Context, nodeID string) (int64, error)
}

type Router struct {
	nodes []config.JanusNode
	loads LoadReader
}

func New(nodes []config.JanusNode, loads LoadReader) *Router {
	return &Router{nodes: nodes, loads: loads}
}

func (r *Router) NodeByID(id string) (config.JanusNode, bool) {
	for _, n := range r.nodes {
		if n.ID == id {
			return n, true
		}
	}
	return config.JanusNode{}, false
}

// PickLeastLoaded returns the node currently hosting the fewest rooms.
func (r *Router) PickLeastLoaded(ctx context.Context) (config.JanusNode, error) {
	if len(r.nodes) == 0 {
		return config.JanusNode{}, fmt.Errorf("no janus nodes configured")
	}
	best := r.nodes[0]
	bestLoad := int64(-1)
	for _, n := range r.nodes {
		load, err := r.loads.GetNodeLoad(ctx, n.ID)
		if err != nil {
			return config.JanusNode{}, err
		}
		if bestLoad == -1 || load < bestLoad {
			best = n
			bestLoad = load
		}
	}
	return best, nil
}

// PickEdgeNode returns a node other than excludeID to host webinar viewer
// fan-out, so viewer traffic for a broadcast doesn't compete with the
// on-stage publishers' own node. Falls back to the stage node itself if
// it's the only one available (single-node dev setups).
func (r *Router) PickEdgeNode(ctx context.Context, excludeID string) (config.JanusNode, error) {
	if len(r.nodes) == 1 {
		return r.nodes[0], nil
	}
	var best config.JanusNode
	bestLoad := int64(-1)
	found := false
	for _, n := range r.nodes {
		if n.ID == excludeID {
			continue
		}
		load, err := r.loads.GetNodeLoad(ctx, n.ID)
		if err != nil {
			return config.JanusNode{}, err
		}
		if !found || load < bestLoad {
			best = n
			bestLoad = load
			found = true
		}
	}
	if !found {
		node, ok := r.NodeByID(excludeID)
		if !ok {
			return config.JanusNode{}, fmt.Errorf("node %s not found", excludeID)
		}
		return node, nil
	}
	return best, nil
}

func (r *Router) All() []config.JanusNode {
	return r.nodes
}
