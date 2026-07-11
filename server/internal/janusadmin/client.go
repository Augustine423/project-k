// Package janusadmin talks to one Janus node's Admin API
// (janus.transport.http admin_* endpoints). We deliberately use the
// "message_plugin" admin request for all VideoRoom/Streaming plugin
// operations (create/destroy/kick/moderate/rtp_forward/...) instead of
// opening a session+handle, because these are all synchronous
// room-management operations Janus supports without an active participant
// handle -- much simpler than driving the full Janus core session
// lifecycle from the control plane.
package janusadmin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type Client struct {
	AdminURL string
	Secret   string
	http     *http.Client
}

func New(adminURL, secret string) *Client {
	return &Client{
		AdminURL: adminURL,
		Secret:   secret,
		http:     &http.Client{Timeout: 15 * time.Second},
	}
}

type Error struct {
	Code   int
	Reason string
}

func (e *Error) Error() string {
	return fmt.Sprintf("janus admin error %d: %s", e.Code, e.Reason)
}

// MessagePlugin sends a synchronous plugin request via the Admin API and
// returns the plugin's response data (the "plugindata.data" object).
func (c *Client) MessagePlugin(ctx context.Context, plugin string, request map[string]any) (map[string]any, error) {
	payload := map[string]any{
		"janus":       "message_plugin",
		"transaction": uuid.NewString(),
		"secret":      c.Secret,
		"plugin":      plugin,
		"request":     request,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.AdminURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var parsed struct {
		Janus string `json:"janus"`
		Error *struct {
			Code   int    `json:"code"`
			Reason string `json:"reason"`
		} `json:"error"`
		PluginData struct {
			Data map[string]any `json:"data"`
		} `json:"plugindata"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decode janus admin response: %w", err)
	}

	if parsed.Janus == "error" || parsed.Error != nil {
		if parsed.Error != nil {
			return nil, &Error{Code: parsed.Error.Code, Reason: parsed.Error.Reason}
		}
		return nil, fmt.Errorf("janus admin returned error with no detail")
	}

	if errCode, ok := parsed.PluginData.Data["error_code"]; ok {
		reason, _ := parsed.PluginData.Data["error"].(string)
		code := int(toFloat(errCode))
		return parsed.PluginData.Data, &Error{Code: code, Reason: reason}
	}

	return parsed.PluginData.Data, nil
}

func toFloat(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	default:
		return 0
	}
}

// IsRoomExists reports whether err represents Janus's "room already exists" (427).
func IsRoomExists(err error) bool {
	var jerr *Error
	return asJanusError(err, &jerr) && jerr.Code == 427
}

func asJanusError(err error, target **Error) bool {
	if e, ok := err.(*Error); ok {
		*target = e
		return true
	}
	return false
}
