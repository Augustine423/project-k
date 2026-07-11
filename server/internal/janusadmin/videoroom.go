package janusadmin

import "context"

const pluginVideoRoom = "janus.plugin.videoroom"

type CreateRoomOpts struct {
	RoomID        string
	Secret        string
	PIN           string
	Description   string
	MaxPublishers int
	BitrateKbps   int
	AdminKey      string
}

// CreateVideoRoom provisions (or confirms) a VideoRoom on this node. It's
// idempotent: if Janus reports the room already exists (427) that's treated
// as success, since a control-plane retry or re-deploy shouldn't fail here.
func (c *Client) CreateVideoRoom(ctx context.Context, opts CreateRoomOpts) error {
	// Do not send "pin" when empty: Janus treats a present-but-empty pin as a
	// real room password and then requires clients to pass pin on every join.
	// Access control for optional user PINs is enforced by the control plane;
	// only propagate a non-empty PIN to Janus when the host set one.
	req := map[string]any{
		"request":        "create",
		"room":           opts.RoomID,
		"admin_key":      opts.AdminKey,
		"secret":         opts.Secret,
		"description":    opts.Description,
		"publishers":     opts.MaxPublishers,
		"bitrate":        opts.BitrateKbps * 1000,
		"fir_freq":       10,
		"videocodec":     "vp9,vp8,h264",
		"require_pvtid":  true,
		"notify_joining": true,
	}
	if opts.PIN != "" {
		req["pin"] = opts.PIN
	}
	_, err := c.MessagePlugin(ctx, pluginVideoRoom, req)
	if err != nil && !IsRoomExists(err) {
		return err
	}
	return nil
}

func (c *Client) DestroyVideoRoom(ctx context.Context, roomID, secret string) error {
	_, err := c.MessagePlugin(ctx, pluginVideoRoom, map[string]any{
		"request": "destroy",
		"room":    roomID,
		"secret":  secret,
	})
	return err
}

// KickParticipant forcibly disconnects a publisher from the room (host "remove participant" control).
func (c *Client) KickParticipant(ctx context.Context, roomID, secret, publisherID string) error {
	_, err := c.MessagePlugin(ctx, pluginVideoRoom, map[string]any{
		"request": "kick",
		"room":    roomID,
		"secret":  secret,
		"id":      publisherID,
	})
	return err
}

// ModerateStream mutes/unmutes a specific publisher's media line (host "mute participant" control).
func (c *Client) ModerateStream(ctx context.Context, roomID, secret, publisherID, mid string, mute bool) error {
	_, err := c.MessagePlugin(ctx, pluginVideoRoom, map[string]any{
		"request": "moderate",
		"room":    roomID,
		"secret":  secret,
		"id":      publisherID,
		"mid":     mid,
		"mute":    mute,
	})
	return err
}

func (c *Client) EditRoom(ctx context.Context, roomID, secret string, locked bool) error {
	_, err := c.MessagePlugin(ctx, pluginVideoRoom, map[string]any{
		"request":        "edit",
		"room":           roomID,
		"secret":         secret,
		"new_is_private": locked,
	})
	return err
}

func (c *Client) ListParticipants(ctx context.Context, roomID string) ([]any, error) {
	data, err := c.MessagePlugin(ctx, pluginVideoRoom, map[string]any{
		"request": "listparticipants",
		"room":    roomID,
	})
	if err != nil {
		return nil, err
	}
	participants, _ := data["participants"].([]any)
	return participants, nil
}

type RtpForwardStream struct {
	Mid  string `json:"mid"`
	Port int    `json:"port"`
}

// RtpForwardOpts drives the webinar fan-out: forward a publisher's stream(s)
// from this (stage) node to a Streaming-plugin mountpoint listening on an
// edge node. See internal/webinar for how this is orchestrated.
type RtpForwardOpts struct {
	RoomID      string
	Secret      string
	AdminKey    string
	PublisherID string
	Host        string
	Streams     []RtpForwardStream
}

func (c *Client) RtpForward(ctx context.Context, opts RtpForwardOpts) (map[string]any, error) {
	streams := make([]map[string]any, 0, len(opts.Streams))
	for _, s := range opts.Streams {
		streams = append(streams, map[string]any{"mid": s.Mid, "port": s.Port})
	}
	return c.MessagePlugin(ctx, pluginVideoRoom, map[string]any{
		"request":      "rtp_forward",
		"room":         opts.RoomID,
		"secret":       opts.Secret,
		"admin_key":    opts.AdminKey,
		"publisher_id": opts.PublisherID,
		"host":         opts.Host,
		"streams":      streams,
	})
}

func (c *Client) StopRtpForward(ctx context.Context, roomID, secret, publisherID string, streamID int) error {
	_, err := c.MessagePlugin(ctx, pluginVideoRoom, map[string]any{
		"request":      "stop_rtp_forward",
		"room":         roomID,
		"secret":       secret,
		"publisher_id": publisherID,
		"stream_id":    streamID,
	})
	return err
}
