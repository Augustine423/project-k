package rooms

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"

	"projectk/server/internal/auth"
	lk "projectk/server/internal/livekit"
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
}

type Service struct {
	store      Store
	jwt        *auth.Issuer
	livekit    *lk.TokenIssuer
	turn       *turn.Issuer
	maxPerRoom int
	log        *slog.Logger
}

func NewService(
	store Store,
	jwtIssuer *auth.Issuer,
	livekitIssuer *lk.TokenIssuer,
	turnIssuer *turn.Issuer,
	maxPerRoom int,
	log *slog.Logger,
) *Service {
	if maxPerRoom <= 0 {
		maxPerRoom = 10
	}
	return &Service{
		store:      store,
		jwt:        jwtIssuer,
		livekit:    livekitIssuer,
		turn:       turnIssuer,
		maxPerRoom: maxPerRoom,
		log:        log,
	}
}

func randomID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + "-" + hex.EncodeToString(b)
}

type CreateRoomInput struct {
	DisplayName string
	PIN         string
	MaxUsers    int
	MediaHost   string
}

// CreateRoom registers a symmetrical multiparty room (LiveKit SFU handles media).
func (s *Service) CreateRoom(ctx context.Context, in CreateRoomInput) (*JoinTicket, error) {
	maxUsers := in.MaxUsers
	if maxUsers <= 0 || maxUsers > s.maxPerRoom {
		maxUsers = s.maxPerRoom
	}

	roomID := randomID("room")
	room := Room{
		ID:              roomID,
		Mode:            ModeInteractive,
		LiveKitRoomName: roomID,
		MaxParticipants: maxUsers,
		PIN:             in.PIN,
		CreatedAt:       time.Now(),
	}

	hostID := randomID("p")
	room.HostParticipant = hostID

	if err := s.store.SaveRoom(ctx, room); err != nil {
		return nil, fmt.Errorf("save room: %w", err)
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
		return nil, fmt.Errorf("save host: %w", err)
	}

	return s.buildTicket(room, host, in.MediaHost)
}

type JoinRoomInput struct {
	RoomID      string
	DisplayName string
	PIN         string
	MediaHost   string
}

var (
	ErrRoomNotFound = fmt.Errorf("room not found")
	ErrRoomLocked   = fmt.Errorf("room is locked")
	ErrBadPIN       = fmt.Errorf("incorrect pin")
	ErrRoomFull     = fmt.Errorf("room is full")
)

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

	existing, err := s.store.ListParticipants(ctx, room.ID)
	if err != nil {
		return nil, err
	}
	if len(existing) >= room.MaxParticipants {
		return nil, ErrRoomFull
	}

	participant := Participant{
		ID:          randomID("p"),
		RoomID:      room.ID,
		DisplayName: in.DisplayName,
		Role:        RoleParticipant,
		Approved:    true,
		JoinedAt:    time.Now(),
	}
	if err := s.store.AddParticipant(ctx, participant); err != nil {
		return nil, err
	}

	return s.buildTicket(*room, participant, in.MediaHost)
}

func (s *Service) buildTicket(room Room, p Participant, mediaHost string) (*JoinTicket, error) {
	appToken, err := s.jwt.Issue(room.ID, p.ID, auth.Role(p.Role))
	if err != nil {
		return nil, fmt.Errorf("issue app token: %w", err)
	}
	lkToken, err := s.livekit.Issue(room.LiveKitRoomName, p.ID, p.DisplayName)
	if err != nil {
		return nil, err
	}
	lkURL := rewriteURLHost(s.livekit.PublicURL(), mediaHost)
	var ice []IceServer
	if s.turn != nil {
		for _, srv := range s.turn.IceServers(p.ID) {
			urls := make([]string, len(srv.URLs))
			for i, u := range srv.URLs {
				urls[i] = rewriteURLHost(u, mediaHost)
			}
			ice = append(ice, IceServer{
				URLs:       urls,
				Username:   srv.Username,
				Credential: srv.Credential,
			})
		}
	}
	return &JoinTicket{
		Room:           room,
		Participant:    p,
		LiveKitURL:     lkURL,
		LiveKitToken:   lkToken,
		ParticipantJWT: appToken,
		IceServers:     ice,
	}, nil
}

func (s *Service) KickParticipant(ctx context.Context, roomID, targetID string) error {
	if _, err := s.mustRoom(ctx, roomID); err != nil {
		return err
	}
	return s.store.RemoveParticipant(ctx, roomID, targetID)
}

func (s *Service) SetLocked(ctx context.Context, roomID string, locked bool) error {
	room, err := s.mustRoom(ctx, roomID)
	if err != nil {
		return err
	}
	room.Locked = locked
	return s.store.SaveRoom(ctx, *room)
}

func (s *Service) EndRoom(ctx context.Context, roomID string) error {
	if _, err := s.mustRoom(ctx, roomID); err != nil {
		return err
	}
	return s.store.DeleteRoom(ctx, roomID)
}

// MuteParticipant is a no-op on LiveKit phase 1 (client-side mute only).
func (s *Service) MuteParticipant(_ context.Context, _, _, _ string, _ bool) error {
	return nil
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
