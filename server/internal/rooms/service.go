package rooms

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"projectk/server/internal/auth"
	"projectk/server/internal/config"
	"projectk/server/internal/janusadmin"
	"projectk/server/internal/turn"
)

type Store interface {
	SaveRoom(ctx context.Context, room Room) error
	GetRoom(ctx context.Context, id string) (*Room, error)
	DeleteRoom(ctx context.Context, id string) error
	AddParticipant(ctx context.Context, p Participant) error
	RemoveParticipant(ctx context.Context, roomID, participantID string) error
	ListParticipants(ctx context.Context, roomID string) ([]Participant, error)
	GetParticipant(ctx context.Context, roomID, participantID string) (*Participant, error)
	IncrNodeLoad(ctx context.Context, nodeID string, delta int64) error
}

type NodeRouter interface {
	PickLeastLoaded(ctx context.Context) (config.JanusNode, error)
	NodeByID(id string) (config.JanusNode, bool)
}

type Service struct {
	store        Store
	router       NodeRouter
	janusAdmins  map[string]*janusadmin.Client
	jwt          *auth.Issuer
	turnIssuer   *turn.Issuer
	adminSecret  string
	videoRoomKey string
	log          *slog.Logger
}

func NewService(
	store Store,
	router NodeRouter,
	janusAdmins map[string]*janusadmin.Client,
	jwtIssuer *auth.Issuer,
	turnIssuer *turn.Issuer,
	adminSecret, videoRoomKey string,
	log *slog.Logger,
) *Service {
	return &Service{
		store:        store,
		router:       router,
		janusAdmins:  janusAdmins,
		jwt:          jwtIssuer,
		turnIssuer:   turnIssuer,
		adminSecret:  adminSecret,
		videoRoomKey: videoRoomKey,
		log:          log,
	}
}

func randomID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + "-" + hex.EncodeToString(b)
}

type CreateRoomInput struct {
	Mode          Mode
	MaxPublishers int
	DisplayName   string
	PIN           string
}

// CreateRoom picks the least-loaded Janus node, provisions a VideoRoom on
// it, registers the room in Redis, and returns a join ticket for the host --
// all in one call so the host can start publishing immediately.
func (s *Service) CreateRoom(ctx context.Context, in CreateRoomInput) (*JoinTicket, error) {
	node, err := s.router.PickLeastLoaded(ctx)
	if err != nil {
		return nil, fmt.Errorf("pick node: %w", err)
	}
	admin, ok := s.janusAdmins[node.ID]
	if !ok {
		return nil, fmt.Errorf("no admin client for node %s", node.ID)
	}

	if in.MaxPublishers <= 0 {
		in.MaxPublishers = 200
	}
	if in.Mode == "" {
		in.Mode = ModeInteractive
	}

	roomID := randomID("room")
	janusRoomID := roomID
	secret := uuid.NewString()

	if err := admin.CreateVideoRoom(ctx, janusadmin.CreateRoomOpts{
		RoomID:        janusRoomID,
		Secret:        secret,
		PIN:           in.PIN,
		Description:   roomID,
		MaxPublishers: in.MaxPublishers,
		BitrateKbps:   1500,
		AdminKey:      s.videoRoomKey,
	}); err != nil {
		return nil, fmt.Errorf("create janus room: %w", err)
	}

	room := Room{
		ID:            roomID,
		Mode:          in.Mode,
		JanusNodeID:   node.ID,
		JanusRoomID:   janusRoomID,
		Secret:        secret,
		PIN:           in.PIN,
		MaxPublishers: in.MaxPublishers,
		CreatedAt:     time.Now(),
	}

	hostID := randomID("p")
	room.HostParticipant = hostID

	if err := s.store.SaveRoom(ctx, room); err != nil {
		return nil, fmt.Errorf("save room: %w", err)
	}
	if err := s.store.IncrNodeLoad(ctx, node.ID, 1); err != nil {
		s.log.Warn("failed to increment node load", "node", node.ID, "err", err)
	}

	host := Participant{
		ID:          hostID,
		RoomID:      roomID,
		DisplayName: in.DisplayName,
		Role:        RoleHost,
		Approved:    true,
		JoinedAt:    time.Now(),
	}
	if err := s.store.AddParticipant(ctx, host); err != nil {
		return nil, fmt.Errorf("save host participant: %w", err)
	}

	return s.buildTicket(room, host, node)
}

type JoinRoomInput struct {
	RoomID      string
	DisplayName string
	PIN         string
}

var ErrRoomNotFound = fmt.Errorf("room not found")
var ErrRoomLocked = fmt.Errorf("room is locked")
var ErrBadPIN = fmt.Errorf("incorrect pin")

func (s *Service) JoinRoom(ctx context.Context, in JoinRoomInput) (*JoinTicket, error) {
	room, err := s.store.GetRoom(ctx, in.RoomID)
	if err != nil {
		return nil, err
	}
	if room == nil {
		return nil, ErrRoomNotFound
	}
	if room.Locked {
		return nil, ErrRoomLocked
	}
	if room.PIN != "" && room.PIN != in.PIN {
		return nil, ErrBadPIN
	}

	node, ok := s.router.NodeByID(room.JanusNodeID)
	if !ok {
		return nil, fmt.Errorf("room's assigned node %s is unavailable", room.JanusNodeID)
	}

	role := RoleParticipant
	if room.Mode == ModeWebinar {
		role = RoleViewer
	}

	participant := Participant{
		ID:          randomID("p"),
		RoomID:      room.ID,
		DisplayName: in.DisplayName,
		Role:        role,
		Approved:    !room.WaitingRoom,
		JoinedAt:    time.Now(),
	}
	if err := s.store.AddParticipant(ctx, participant); err != nil {
		return nil, err
	}

	return s.buildTicket(*room, participant, node)
}

func (s *Service) buildTicket(room Room, p Participant, node config.JanusNode) (*JoinTicket, error) {
	token, err := s.jwt.Issue(room.ID, p.ID, auth.Role(p.Role))
	if err != nil {
		return nil, fmt.Errorf("issue token: %w", err)
	}
	creds := s.turnIssuer.IssueFor(p.ID)
	ticket := &JoinTicket{
		Room:           room,
		Participant:    p,
		JanusWsURL:     node.PublicWsURL,
		ParticipantJWT: token,
		TURN: TURNInfo{
			URLs:       creds.URLs,
			Username:   creds.Username,
			Credential: creds.Credential,
		},
	}
	if room.PIN != "" {
		ticket.JanusJoinPin = room.PIN
	}
	return ticket, nil
}

func (s *Service) adminFor(room Room) (*janusadmin.Client, error) {
	admin, ok := s.janusAdmins[room.JanusNodeID]
	if !ok {
		return nil, fmt.Errorf("no admin client for node %s", room.JanusNodeID)
	}
	return admin, nil
}

// --- Host controls ---

func (s *Service) MuteParticipant(ctx context.Context, roomID, targetID, mid string, mute bool) error {
	room, err := s.mustRoom(ctx, roomID)
	if err != nil {
		return err
	}
	admin, err := s.adminFor(*room)
	if err != nil {
		return err
	}
	return admin.ModerateStream(ctx, room.JanusRoomID, room.Secret, targetID, mid, mute)
}

func (s *Service) KickParticipant(ctx context.Context, roomID, targetID string) error {
	room, err := s.mustRoom(ctx, roomID)
	if err != nil {
		return err
	}
	admin, err := s.adminFor(*room)
	if err != nil {
		return err
	}
	if err := admin.KickParticipant(ctx, room.JanusRoomID, room.Secret, targetID); err != nil {
		return err
	}
	return s.store.RemoveParticipant(ctx, roomID, targetID)
}

func (s *Service) SetLocked(ctx context.Context, roomID string, locked bool) error {
	room, err := s.mustRoom(ctx, roomID)
	if err != nil {
		return err
	}
	admin, err := s.adminFor(*room)
	if err != nil {
		return err
	}
	if err := admin.EditRoom(ctx, room.JanusRoomID, room.Secret, locked); err != nil {
		return err
	}
	room.Locked = locked
	return s.store.SaveRoom(ctx, *room)
}

func (s *Service) EndRoom(ctx context.Context, roomID string) error {
	room, err := s.mustRoom(ctx, roomID)
	if err != nil {
		return err
	}
	admin, err := s.adminFor(*room)
	if err != nil {
		return err
	}
	if err := admin.DestroyVideoRoom(ctx, room.JanusRoomID, room.Secret); err != nil {
		return err
	}
	if err := s.store.IncrNodeLoad(ctx, room.JanusNodeID, -1); err != nil {
		s.log.Warn("failed to decrement node load", "node", room.JanusNodeID, "err", err)
	}
	return s.store.DeleteRoom(ctx, roomID)
}

func (s *Service) GetRoom(ctx context.Context, roomID string) (*Room, error) {
	return s.store.GetRoom(ctx, roomID)
}

func (s *Service) ListParticipants(ctx context.Context, roomID string) ([]Participant, error) {
	return s.store.ListParticipants(ctx, roomID)
}

func (s *Service) mustRoom(ctx context.Context, roomID string) (*Room, error) {
	room, err := s.store.GetRoom(ctx, roomID)
	if err != nil {
		return nil, err
	}
	if room == nil {
		return nil, ErrRoomNotFound
	}
	return room, nil
}
