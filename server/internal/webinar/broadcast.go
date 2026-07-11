// Package webinar implements the broadcast fan-out path: a small number of
// on-stage publishers (host + panelists) publish into a regular VideoRoom on
// their assigned "stage" node, and this package fans their streams out via
// Janus's rtp_forward feature to a Streaming-plugin mountpoint on a
// separate "edge" node. Viewers then subscribe read-only to that mountpoint
// instead of joining the VideoRoom directly.
//
// Why this is the mechanism that gets us to thousands of viewers: the stage
// node only ever has to relay to a handful of edge nodes (one rtp_forward
// per edge, regardless of how many viewers that edge serves), and each edge
// node just replicates one incoming stream to as many WebRTC viewers as it
// has capacity for. Add more edge nodes -- linked to the same room via
// additional rtp_forward targets -- to add more viewer capacity, with zero
// additional load on the stage node or the publishers.
//
// Phase 1 scope: one edge node/mountpoint per room. Scaling a single
// broadcast across multiple edge nodes (fan the same publisher out to
// N mountpoints) is a straightforward extension of ForwardPublisher --
// call it once per edge node -- left for Phase 2 once there's more than
// one Janus node to actually spread across.
package webinar

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"

	"projectk/server/internal/config"
	"projectk/server/internal/janusadmin"
	"projectk/server/internal/redisstore"
	"projectk/server/internal/rooms"
)

type Store interface {
	GetBroadcastTarget(ctx context.Context, roomID string) (*redisstore.BroadcastTarget, error)
	SaveBroadcastTarget(ctx context.Context, roomID string, target redisstore.BroadcastTarget) error
	AllocatePort(ctx context.Context, nodeID string, rangeStart, rangeEnd int) (int, error)
}

type NodeRouter interface {
	PickEdgeNode(ctx context.Context, excludeID string) (config.JanusNode, error)
	NodeByID(id string) (config.JanusNode, bool)
}

type Service struct {
	store          Store
	router         NodeRouter
	janusAdmins    map[string]*janusadmin.Client
	adminSecret    string
	videoRoomKey   string
	portRangeStart int
	portRangeEnd   int
	log            *slog.Logger
}

func NewService(
	store Store,
	router NodeRouter,
	janusAdmins map[string]*janusadmin.Client,
	adminSecret, videoRoomKey string,
	portRangeStart, portRangeEnd int,
	log *slog.Logger,
) *Service {
	return &Service{
		store:          store,
		router:         router,
		janusAdmins:    janusAdmins,
		adminSecret:    adminSecret,
		videoRoomKey:   videoRoomKey,
		portRangeStart: portRangeStart,
		portRangeEnd:   portRangeEnd,
		log:            log,
	}
}

// EnsureFanout provisions (idempotently) the edge Streaming-plugin
// mountpoint viewers of this room should subscribe to, picking a node other
// than the room's stage node when more than one Janus node is available.
func (s *Service) EnsureFanout(ctx context.Context, room rooms.Room) (*redisstore.BroadcastTarget, error) {
	if existing, err := s.store.GetBroadcastTarget(ctx, room.ID); err != nil {
		return nil, err
	} else if existing != nil {
		return existing, nil
	}

	edgeNode, err := s.router.PickEdgeNode(ctx, room.JanusNodeID)
	if err != nil {
		return nil, fmt.Errorf("pick edge node: %w", err)
	}
	edgeAdmin, ok := s.janusAdmins[edgeNode.ID]
	if !ok {
		return nil, fmt.Errorf("no admin client for edge node %s", edgeNode.ID)
	}

	audioPort, err := s.store.AllocatePort(ctx, edgeNode.ID, s.portRangeStart, s.portRangeEnd)
	if err != nil {
		return nil, fmt.Errorf("allocate audio port: %w", err)
	}
	videoPort, err := s.store.AllocatePort(ctx, edgeNode.ID, s.portRangeStart, s.portRangeEnd)
	if err != nil {
		return nil, fmt.Errorf("allocate video port: %w", err)
	}

	mountpointID := "bcast-" + room.ID
	if err := edgeAdmin.CreateMountpoint(ctx, janusadmin.CreateMountpointOpts{
		ID:          mountpointID,
		Secret:      room.Secret,
		AdminKey:    s.videoRoomKey,
		Description: "Broadcast for room " + room.ID,
		Media: []janusadmin.StreamingMedia{
			{Type: "audio", Mid: "a", Label: "audio", Port: audioPort, PT: 111, Codec: "opus"},
			{Type: "video", Mid: "v", Label: "video", Port: videoPort, PT: 100, Codec: "vp8"},
		},
	}); err != nil {
		return nil, fmt.Errorf("create mountpoint: %w", err)
	}

	target := redisstore.BroadcastTarget{
		EdgeNodeID:   edgeNode.ID,
		MountpointID: mountpointID,
		AudioPort:    audioPort,
		VideoPort:    videoPort,
	}
	if err := s.store.SaveBroadcastTarget(ctx, room.ID, target); err != nil {
		return nil, fmt.Errorf("save broadcast target: %w", err)
	}
	return &target, nil
}

// PublisherStream describes one m-line of a stage publisher's own SDP, as
// reported by the client after it publishes -- Janus assigns these mids,
// so the control plane can't know them in advance.
type PublisherStream struct {
	Mid  string
	Type string // "audio" | "video"
}

// ForwardPublisher relays an on-stage publisher's audio/video into the
// room's edge mountpoint. Safe to call again for the same publisher (e.g.
// after a reconnect); Janus will simply have two forwarders running, so
// callers should pair this with StopForwarding on disconnect in Phase 2
// hardening -- acceptable for Phase 1's scope.
func (s *Service) ForwardPublisher(ctx context.Context, room rooms.Room, publisherID string, streams []PublisherStream) error {
	target, err := s.EnsureFanout(ctx, room)
	if err != nil {
		return err
	}
	edgeNode, ok := s.router.NodeByID(target.EdgeNodeID)
	if !ok {
		return fmt.Errorf("edge node %s not found", target.EdgeNodeID)
	}
	edgeHost, err := hostnameOf(edgeNode.AdminURL)
	if err != nil {
		return fmt.Errorf("resolve edge node host: %w", err)
	}

	stageAdmin, ok := s.janusAdmins[room.JanusNodeID]
	if !ok {
		return fmt.Errorf("no admin client for stage node %s", room.JanusNodeID)
	}

	forwardStreams := make([]janusadmin.RtpForwardStream, 0, len(streams))
	for _, st := range streams {
		switch st.Type {
		case "audio":
			forwardStreams = append(forwardStreams, janusadmin.RtpForwardStream{Mid: st.Mid, Port: target.AudioPort})
		case "video":
			forwardStreams = append(forwardStreams, janusadmin.RtpForwardStream{Mid: st.Mid, Port: target.VideoPort})
		default:
			s.log.Warn("skipping unknown stream type in webinar fan-out", "type", st.Type)
		}
	}
	if len(forwardStreams) == 0 {
		return fmt.Errorf("no audio/video streams to forward for publisher %s", publisherID)
	}

	_, err = stageAdmin.RtpForward(ctx, janusadmin.RtpForwardOpts{
		RoomID:      room.JanusRoomID,
		Secret:      room.Secret,
		AdminKey:    s.videoRoomKey,
		PublisherID: publisherID,
		Host:        edgeHost,
		Streams:     forwardStreams,
	})
	return err
}

// ViewerJoinInfo tells a webinar viewer client which edge node/mountpoint
// to subscribe to -- deliberately not the stage node, so viewer scale never
// touches the room's actual publish/subscribe VideoRoom capacity.
type ViewerJoinInfo struct {
	JanusWsURL   string `json:"janusWsUrl"`
	MountpointID string `json:"mountpointId"`
}

func (s *Service) ViewerJoinInfo(ctx context.Context, room rooms.Room) (*ViewerJoinInfo, error) {
	target, err := s.EnsureFanout(ctx, room)
	if err != nil {
		return nil, err
	}
	edgeNode, ok := s.router.NodeByID(target.EdgeNodeID)
	if !ok {
		return nil, fmt.Errorf("edge node %s not found", target.EdgeNodeID)
	}
	return &ViewerJoinInfo{JanusWsURL: edgeNode.PublicWsURL, MountpointID: target.MountpointID}, nil
}

func hostnameOf(rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	if u.Hostname() == "" {
		return "", fmt.Errorf("no hostname in URL %q", rawURL)
	}
	return u.Hostname(), nil
}
