package rooms

import "time"

// Mode distinguishes room types. Phase 1 LiveKit path is interactive multiparty only.
type Mode string

const (
	ModeInteractive Mode = "interactive"
)

type Role string

const (
	RoleHost        Role = "host"
	RoleCoHost      Role = "cohost"
	RoleParticipant Role = "participant"
)

// Room is the control plane's source of truth, persisted in Redis.
type Room struct {
	ID              string    `json:"id"`
	Mode            Mode      `json:"mode"`
	LiveKitRoomName string    `json:"livekitRoomName"`
	MaxParticipants int       `json:"maxParticipants"`
	Locked          bool      `json:"locked"`
	PIN             string    `json:"-"`
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

// JoinTicket is returned after create/join: app JWT + LiveKit credentials.
type JoinTicket struct {
	Room           Room        `json:"room"`
	Participant    Participant `json:"participant"`
	LiveKitURL     string      `json:"livekitUrl"`
	LiveKitToken   string      `json:"livekitToken"`
	ParticipantJWT string      `json:"participantToken"`
	IceServers     []IceServer `json:"iceServers,omitempty"`
}

// IceServer is a STUN/TURN entry for WebRTC ICE (Phase A join resilience).
type IceServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}
