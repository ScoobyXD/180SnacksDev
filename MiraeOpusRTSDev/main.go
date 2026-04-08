package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	db  *pgxpool.Pool
	hub *hub
}

type message struct {
	ID        int64     `json:"id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	FromUser  string    `json:"fromUser"`
	ToUser    string    `json:"toUser"`
}

type hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*websocket.Conn]struct{}
}

func newHub() *hub {
	return &hub{rooms: map[string]map[*websocket.Conn]struct{}{}}
}

func (h *hub) join(room string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.rooms[room]; !ok {
		h.rooms[room] = map[*websocket.Conn]struct{}{}
	}
	h.rooms[room][conn] = struct{}{}
}

func (h *hub) leave(room string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if clients, ok := h.rooms[room]; ok {
		delete(clients, conn)
		if len(clients) == 0 {
			delete(h.rooms, room)
		}
	}
}

func (h *hub) broadcast(room string, msg message) {
	h.mu.RLock()
	clients := h.rooms[room]
	h.mu.RUnlock()

	for c := range clients {
		_ = c.WriteJSON(map[string]any{"type": "message:new", "message": msg})
	}
}

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	a := &app{db: db, hub: newHub()}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", a.handleHealth)
	mux.HandleFunc("GET /api/messages", a.handleGetMessages)
	mux.HandleFunc("POST /api/messages", a.handleCreateMessage)
	mux.HandleFunc("GET /ws", a.handleWS)
	mux.Handle("/", http.FileServer(http.Dir("./public")))

	addr := os.Getenv("APP_ADDR")
	if addr == "" {
		addr = ":3000"
	}

	log.Printf("MiraeOpus Go API listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) handleHealth(w http.ResponseWriter, _ *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := a.db.Ping(ctx); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"ok": true, "runtime": "go", "service": "miraeopus-message-api"})
}

func (a *app) handleGetMessages(w http.ResponseWriter, r *http.Request) {
	userA, err := normalizeUsername(r.URL.Query().Get("userA"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "userA is required (1-50 chars)")
		return
	}
	userB, err := normalizeUsername(r.URL.Query().Get("userB"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "userB is required (1-50 chars)")
		return
	}

	sinceID, _ := strconv.ParseInt(r.URL.Query().Get("sinceId"), 10, 64)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := a.db.Query(ctx, `
		SELECT
			m.id,
			m.body,
			m.created_at,
			sender.username AS from_user,
			recipient.username AS to_user
		FROM messages m
		JOIN users sender ON sender.id = m.sender_id
		JOIN users recipient ON recipient.id = m.recipient_id
		JOIN conversations c ON c.id = m.conversation_id
		JOIN users ua ON ua.id = c.user_a_id
		JOIN users ub ON ub.id = c.user_b_id
		WHERE LEAST(ua.username, ub.username) = LEAST($1, $2)
		  AND GREATEST(ua.username, ub.username) = GREATEST($1, $2)
		  AND m.id > $3
		ORDER BY m.id ASC
		LIMIT 200
	`, userA, userB, sinceID)
	if err != nil {
		respondErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	messages := make([]message, 0)
	for rows.Next() {
		var m message
		if err := rows.Scan(&m.ID, &m.Body, &m.CreatedAt, &m.FromUser, &m.ToUser); err != nil {
			respondErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		messages = append(messages, m)
	}

	respondJSON(w, http.StatusOK, map[string]any{"messages": messages})
}

func (a *app) handleCreateMessage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FromUser string `json:"fromUser"`
		ToUser   string `json:"toUser"`
		Body     string `json:"body"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	fromUser, err := normalizeUsername(req.FromUser)
	if err != nil {
		respondErr(w, http.StatusBadRequest, "fromUser is required (1-50 chars)")
		return
	}
	toUser, err := normalizeUsername(req.ToUser)
	if err != nil {
		respondErr(w, http.StatusBadRequest, "toUser is required (1-50 chars)")
		return
	}
	body := strings.TrimSpace(req.Body)
	if body == "" || len(body) > 2000 {
		respondErr(w, http.StatusBadRequest, "body must be 1-2000 chars")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	trx, err := a.db.Begin(ctx)
	if err != nil {
		respondErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer trx.Rollback(ctx)

	senderID, err := upsertUser(ctx, trx, fromUser)
	if err != nil {
		respondErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	recipientID, err := upsertUser(ctx, trx, toUser)
	if err != nil {
		respondErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	conversationID, err := upsertConversation(ctx, trx, senderID, recipientID)
	if err != nil {
		respondErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	var m message
	err = trx.QueryRow(ctx, `
		INSERT INTO messages (conversation_id, sender_id, recipient_id, body)
		VALUES ($1, $2, $3, $4)
		RETURNING id, body, created_at
	`, conversationID, senderID, recipientID, body).Scan(&m.ID, &m.Body, &m.CreatedAt)
	if err != nil {
		respondErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	m.FromUser = fromUser
	m.ToUser = toUser

	if err := trx.Commit(ctx); err != nil {
		respondErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	a.hub.broadcast(roomKey(fromUser, toUser), m)
	respondJSON(w, http.StatusCreated, m)
}

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(_ *http.Request) bool {
		return true
	},
}

func (a *app) handleWS(w http.ResponseWriter, r *http.Request) {
	me, err := normalizeUsername(r.URL.Query().Get("me"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "me is required")
		return
	}
	other, err := normalizeUsername(r.URL.Query().Get("other"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "other is required")
		return
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	room := roomKey(me, other)
	a.hub.join(room, conn)
	defer func() {
		a.hub.leave(room, conn)
		_ = conn.Close()
	}()

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

func normalizeUsername(v string) (string, error) {
	n := strings.ToLower(strings.TrimSpace(v))
	if n == "" || len(n) > 50 {
		return "", errors.New("invalid username")
	}
	return n, nil
}

func roomKey(a, b string) string {
	parts := []string{a, b}
	sort.Strings(parts)
	return parts[0] + "::" + parts[1]
}

func upsertUser(ctx context.Context, trx pgxTx, username string) (int64, error) {
	var id int64
	err := trx.QueryRow(ctx, `
		INSERT INTO users (username)
		VALUES ($1)
		ON CONFLICT (username)
		DO UPDATE SET username = EXCLUDED.username
		RETURNING id
	`, username).Scan(&id)
	return id, err
}

func upsertConversation(ctx context.Context, trx pgxTx, userAID, userBID int64) (int64, error) {
	if userAID > userBID {
		userAID, userBID = userBID, userAID
	}
	var id int64
	err := trx.QueryRow(ctx, `
		INSERT INTO conversations (user_a_id, user_b_id)
		VALUES ($1, $2)
		ON CONFLICT ON CONSTRAINT uq_conversation_pair
		DO UPDATE SET user_a_id = EXCLUDED.user_a_id
		RETURNING id
	`, userAID, userBID).Scan(&id)
	return id, err
}

type pgxTx interface {
	QueryRow(context.Context, string, ...any) rowScanner
}

type rowScanner interface {
	Scan(dest ...any) error
}

func respondErr(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}

func respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
