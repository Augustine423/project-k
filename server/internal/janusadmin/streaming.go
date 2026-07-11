package janusadmin

import "context"

const pluginStreaming = "janus.plugin.streaming"

type StreamingMedia struct {
	Type  string // "audio" | "video"
	Mid   string
	Label string
	Port  int
	PT    int
	Codec string
}

type CreateMountpointOpts struct {
	ID          string
	Secret      string
	AdminKey    string
	Description string
	Media       []StreamingMedia
}

// CreateMountpoint provisions an RTP-source Streaming-plugin mountpoint on
// an edge node. The webinar fan-out (internal/webinar) rtp_forwards a stage
// publisher's stream into the ports configured here, and viewers subscribe
// to this mountpoint read-only -- so this edge node never has to run the
// full VideoRoom publish/subscribe logic for the broadcast audience.
func (c *Client) CreateMountpoint(ctx context.Context, opts CreateMountpointOpts) error {
	media := make([]map[string]any, 0, len(opts.Media))
	for _, m := range opts.Media {
		media = append(media, map[string]any{
			"type":  m.Type,
			"mid":   m.Mid,
			"label": m.Label,
			"port":  m.Port,
			"pt":    m.PT,
			"codec": m.Codec,
		})
	}
	_, err := c.MessagePlugin(ctx, pluginStreaming, map[string]any{
		"request":     "create",
		"type":        "rtp",
		"id":          opts.ID,
		"admin_key":   opts.AdminKey,
		"secret":      opts.Secret,
		"description": opts.Description,
		"media":       media,
	})
	if err != nil && !IsRoomExists(err) {
		return err
	}
	return nil
}

func (c *Client) DestroyMountpoint(ctx context.Context, id, secret string) error {
	_, err := c.MessagePlugin(ctx, pluginStreaming, map[string]any{
		"request": "destroy",
		"id":      id,
		"secret":  secret,
	})
	return err
}
