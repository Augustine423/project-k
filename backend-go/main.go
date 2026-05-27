package main

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// JanusController handles signaling
type JanusController struct {
	upgrader websocket.Upgrader
	janusWS  *websocket.Conn
	mu       sync.Mutex
}

func (jc *JanusController) connectToJanus() {
	// In production, this would be an environment variable
	url := "ws://janus-gateway:8188" 
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		log.Printf("Failed to connect to Janus at %s: %v", url, err)
		time.Sleep(5 * time.Second)
		go jc.connectToJanus() // Reconnect loop
		return
	}
	jc.janusWS = conn
	log.Println("Connected to Janus Gateway")
}

func (jc *JanusController) handleConnection(w http.ResponseWriter, r *http.Request) {
	clientConn, err := jc.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer clientConn.Close()

	for {
		_, message, err := clientConn.ReadMessage()
		if err != nil {
			break
		}

		// Relay logic: Pass the message to Janus
		jc.mu.Lock()
		if jc.janusWS != nil {
			err = jc.janusWS.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Println("Error forwarding to Janus:", err)
			}
		}
		jc.mu.Unlock()
	}
}

func main() {
	jc := &JanusController{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}

	go jc.connectToJanus()

	http.HandleFunc("/ws", jc.handleConnection)
	log.Println("Signaling Controller listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
