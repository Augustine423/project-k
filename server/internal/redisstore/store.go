// Package redisstore is the shared room/participant registry. Every control
// plane instance reads/writes here instead of keeping state in memory, which
// is what lets us run many control-plane replicas behind a load balancer
// (horizontal scaling of the signaling layer itself, not just the media layer).
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

// IncrNodeLoad / node load tracking backs the Router's least-loaded node
// selection (internal/router). Each node's "load" is simply how many rooms
// are currently assigned to it -- cheap, and good enough for room-level
// sharding since rooms are the unit of placement.
func (s *Store) IncrNodeLoad(ctx context.Context, nodeID string, delta int64) error {
	return s.rdb.IncrBy(ctx, "nodeload:"+nodeID, delta).Err()
}

func (s *Store) GetNodeLoad(ctx context.Context, nodeID string) (int64, error) {
	v, err := s.rdb.Get(ctx, "nodeload:"+nodeID).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return v, err
}

func (s *Store) IsNodeDraining(ctx context.Context, nodeID string) (bool, error) {
	exists, err := s.rdb.Exists(ctx, "nodedraining:"+nodeID).Result()
	if err != nil {
		return false, err
	}
	return exists > 0, nil
}

func (s *Store) SetNodeDraining(ctx context.Context, nodeID string, draining bool) error {
	if draining {
		return s.rdb.Set(ctx, "nodedraining:"+nodeID, "1", 0).Err()
	}
	return s.rdb.Del(ctx, "nodedraining:"+nodeID).Err()
}

func broadcastKey(roomID string) string { return "broadcast:" + roomID }

// BroadcastTarget is the webinar fan-out's record of which edge node and
// Streaming-plugin mountpoint viewers of a given room should subscribe to.
// See internal/webinar for how it's created and used.
type BroadcastTarget struct {
	EdgeNodeID   string `json:"edgeNodeId"`
	MountpointID string `json:"mountpointId"`
	AudioPort    int    `json:"audioPort"`
	VideoPort    int    `json:"videoPort"`
}

func (s *Store) SaveBroadcastTarget(ctx context.Context, roomID string, target BroadcastTarget) error {
	data, err := json.Marshal(target)
	if err != nil {
		return err
	}
	return s.rdb.Set(ctx, broadcastKey(roomID), data, roomTTL).Err()
}

func (s *Store) GetBroadcastTarget(ctx context.Context, roomID string) (*BroadcastTarget, error) {
	data, err := s.rdb.Get(ctx, broadcastKey(roomID)).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var target BroadcastTarget
	if err := json.Unmarshal(data, &target); err != nil {
		return nil, err
	}
	return &target, nil
}

// AllocatePort hands out the next port in [rangeStart, rangeEnd) for a given
// node, cycling round-robin via an atomic counter. Phase 1 scope: good
// enough for demo/moderate broadcast fan-out; a production version should
// track freed ports explicitly instead of assuming the range never wraps
// into still-in-use ports.
func (s *Store) AllocatePort(ctx context.Context, nodeID string, rangeStart, rangeEnd int) (int, error) {
	span := int64(rangeEnd - rangeStart)
	if span <= 0 {
		return 0, fmt.Errorf("invalid port range %d-%d", rangeStart, rangeEnd)
	}
	n, err := s.rdb.Incr(ctx, "portalloc:"+nodeID).Result()
	if err != nil {
		return 0, err
	}
	return rangeStart + int((n-1)%span), nil
}
