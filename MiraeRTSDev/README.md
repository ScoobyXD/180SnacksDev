# MiraeOpus Messaging MVP (Go-first on AWS)

This MVP now follows the recommended stack direction:
- **Frontend direction:** React + TypeScript (next step)
- **Backend now:** Go
- **Backend later (only hot paths):** Rust
- **Database:** AWS RDS PostgreSQL

## Why this version
- Keeps one backend language initially (Go) so development stays clean.
- Leaves a clear path for Rust services later if specific bottlenecks appear.
- Aligns with large-scale architecture patterns captured in `docs/LLM.md`.

## Current project layout
- `main.go` — Go HTTP + WebSocket server
- `db/schema.sql` — users/conversations/messages schema
- `public/index.html` — minimal browser client
- `.env.example` — runtime config

## Local run
1. Configure env:
   ```bash
   cp .env.example .env
   source .env
   ```
2. Apply schema to Postgres:
   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   ```
3. Start server:
   ```bash
   go run .
   ```
4. Open browser:
   - `http://localhost:3000`

## Environment variables
- `DATABASE_URL` (required)
- `APP_ADDR` (default `:3000`)

## API
- `GET /health`
- `GET /api/messages?userA=alice&userB=bob&sinceId=0`
- `POST /api/messages` with JSON `{ "fromUser": "alice", "toUser": "bob", "body": "hello" }`
- `GET /ws?me=alice&other=bob` (WebSocket)
