// Package redisstore is the shared room/participant registry for the control plane.
package redisstore

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"projectk/server/internal/rooms"
)

const roomTTL = 24 * time.Hour

type Store struct {
	rdb *redis.Client
}

func New(redisURL string) (*Store, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	return &Store{rdb: redis.NewClient(opts)}, nil
}

func (s *Store) Ping(ctx context.Context) error {
	return s.rdb.Ping(ctx).Err()
}

func roomKey(id string) string         { return "room:" + id }
func participantsKey(id string) string { return "room:" + id + ":participants" }

func (s *Store) SaveRoom(ctx context.Context, room rooms.Room) error {
	data, err := json.Marshal(room)
	if err != nil {
		return err
	}
	return s.rdb.Set(ctx, roomKey(room.ID), data, roomTTL).Err()
}

func (s *Store) GetRoom(ctx context.Context, id string) (*rooms.Room, error) {
	data, err := s.rdb.Get(ctx, roomKey(id)).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var room rooms.Room
	if err := json.Unmarshal(data, &room); err != nil {
		return nil, err
	}
	return &room, nil
}

func (s *Store) DeleteRoom(ctx context.Context, id string) error {
	pipe := s.rdb.TxPipeline()
	pipe.Del(ctx, roomKey(id))
	pipe.Del(ctx, participantsKey(id))
	_, err := pipe.Exec(ctx)
	return err
}

func (s *Store) AddParticipant(ctx context.Context, p rooms.Participant) error {
	data, err := json.Marshal(p)
	if err != nil {
		return err
	}
	pipe := s.rdb.TxPipeline()
	pipe.HSet(ctx, participantsKey(p.RoomID), p.ID, data)
	pipe.Expire(ctx, participantsKey(p.RoomID), roomTTL)
	_, err = pipe.Exec(ctx)
	return err
}

func (s *Store) RemoveParticipant(ctx context.Context, roomID, participantID string) error {
	return s.rdb.HDel(ctx, participantsKey(roomID), participantID).Err()
}

func (s *Store) ListParticipants(ctx context.Context, roomID string) ([]rooms.Participant, error) {
	values, err := s.rdb.HGetAll(ctx, participantsKey(roomID)).Result()
	if err != nil {
		return nil, err
	}
	out := make([]rooms.Participant, 0, len(values))
	for _, raw := range values {
		var p rooms.Participant
		if err := json.Unmarshal([]byte(raw), &p); err != nil {
			continue
		}
		out = append(out, p)
	}
	return out, nil
}

func (s *Store) GetParticipant(ctx context.Context, roomID, participantID string) (*rooms.Participant, error) {
	raw, err := s.rdb.HGet(ctx, participantsKey(roomID), participantID).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var p rooms.Participant
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, err
	}
	return &p, nil
}
