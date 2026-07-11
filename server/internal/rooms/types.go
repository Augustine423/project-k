package rooms

import "time"

// Mode distinguishes an interactive meeting (everyone can publish) from a
// webinar/broadcast room (a small set of publishers, unlimited view-only
// viewers fanned out across edge Janus nodes via rtp_forward).
type Mode string

const (
	ModeInteractive Mode = "interactive"
	ModeWebinar     Mode = "webinar"
)

type Role string

const (
	RoleHost        Role = "host"
	RoleCoHost      Role = "cohost"
	RolePublisher   Role = "publisher" // webinar panelist
	RoleParticipant Role = "participant"
	RoleViewer      Role = "viewer" // webinar view-only
)

// Room is the control plane's source of truth for a room, persisted in
// Redis (see internal/redisstore) so any control-plane instance can serve
// requests for it -- this is what lets the control plane itself scale
// horizontally, independent of how many Janus media nodes exist.
type Room struct {
	ID              string    `json:"id"`
	Mode            Mode      `json:"mode"`
	JanusNodeID     string    `json:"janusNodeId"`
	JanusRoomID     string    `json:"janusRoomId"`
	Secret          string    `json:"-"` // Janus room secret, never sent to clients
	PIN             string    `json:"-"`
	MaxPublishers   int       `json:"maxPublishers"`
	Locked          bool      `json:"locked"`
	WaitingRoom     bool      `json:"waitingRoom"`
	CreatedAt       time.Time `json:"createdAt"`
	HostParticipant string    `json:"hostParticipantId"`
}

type Participant struct {
	ID          string    `json:"id"`
	RoomID      string    `json:"roomId"`
	DisplayName string    `json:"displayName"`
	Role        Role      `json:"role"`
	Approved    bool      `json:"approved"`
	JoinedAt    time.Time `json:"joinedAt"`
}

// JoinTicket is what the client receives after a successful create/join
// call: everything it needs to connect straight to the assigned Janus node
// and start signaling, without the control plane sitting in the media path.
type JoinTicket struct {
	Room           Room        `json:"room"`
	Participant    Participant `json:"participant"`
	JanusWsURL     string      `json:"janusWsUrl"`
	ParticipantJWT string      `json:"participantToken"`
	JanusJoinPin   string      `json:"janusJoinPin,omitempty"`
	TURN           TURNInfo    `json:"turn"`
}

type TURNInfo struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username"`
	Credential string   `json:"credential"`
}
