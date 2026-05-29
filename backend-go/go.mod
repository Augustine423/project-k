module kzys/backend

go 1.24

require (
	github.com/gorilla/websocket v1.5.3
	google.golang.org/grpc v1.65.0
	kzys/backend/pb v0.0.0-00010101000000-000000000000
)

require (
	golang.org/x/net v0.25.0 // indirect
	golang.org/x/sys v0.20.0 // indirect
	golang.org/x/text v0.15.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20240528184218-531527333157 // indirect
	google.golang.org/protobuf v1.36.0 // indirect
)

replace kzys/backend/pb => ./pb
