# Mirae Opus RTS — Concept Notes

## Core Problem
Enterprise context is fragmented across many communication and work systems (e.g., Slack, email, Linear, ClickUp, SMS, calls). For urgent, cross-functional work, critical context is scattered and difficult to reconstruct, causing delays, missed ownership, and poor executive visibility.

## RTS Thesis
RTS (real-time system) is a new enterprise management layer that unifies communication, tasks, and execution state in one place.

Instead of treating information as one-dimensional notifications, RTS models each signal in a multi-dimensional operational space:

- **Time/Urgency axis**: how quickly response or action is required.
- **Information/Factual axis**: context and facts being communicated.
- **Action axis**: expected execution, ownership, and next steps.
- **Category overlay**: business domain (HR, Operations, Manufacturing, Sales, etc.), represented by zones/tags/colors.

This creates a single operational rendering of company activity rather than fragmented message streams.

## Product Direction
RTS should function as:

1. **Unified communication protocol** across existing enterprise channels.
2. **Unified UI** where urgent signals, tasks, blockers, and progress are tracked in real time.
3. **Executive command view** for managers/CEOs to understand what is happening now without depending on manual dashboard updates.
4. **Automation layer** via microservices that can execute repetitive workflows and expose progress to all stakeholders.

## Why This Is Differentiated
The value is not only aggregating channels. The key is transforming fragmented communications into executable operational state:

- identify intent,
- assign owners,
- track deadlines/risks,
- surface blockers/escalations,
- provide a continuously updated source of truth.

## AI/Agent Infrastructure Insight
RTS can become the foundational infrastructure for enterprise agents.

Agents are most useful when they have:

- reliable context,
- live organizational state,
- clear permissions/policies,
- structured objectives and dependencies.

RTS can provide this by accumulating enterprise history and patterns over time.

## Enterprise Memory + State Model
RTS should preserve both historical and live context:

- **Memory**: what happened, who decided, and why.
- **State**: what is true right now.
- **Intent**: what outcomes are expected.
- **Policy**: what actions are allowed.

A practical canonical model for RTS records should include:

- `event` (raw signal),
- `entity` (task/project/customer/system),
- `decision`,
- `owner`,
- `deadline/SLA`,
- `dependency`,
- `policy/permission`,
- `outcome`.

## Strategic Compounding Loop
As RTS usage increases, it accumulates higher-quality organizational context and patterns.

This supports a feedback loop:

**more usage → better operational graph → better automation/agent performance → more usage**.

Over time, this creates defensibility through enterprise-specific context and decision history.

## Initial Wedge (Suggested)
Start with urgent cross-functional incident/workflow coordination where fragmentation is most painful. Prove value through faster resolution, clearer ownership, and lower coordination overhead, then expand to broader operational domains.

## MVP Step 1: Browser-First Peer-to-Peer Text Communication
The first MVP can focus on direct, real-time text chat between two users in a browser-first PWA. This proves low-latency communication and presence before adding multi-channel ingestion and workflow intelligence.

### MVP Goals
- browser-first UX (installable PWA),
- 1:1 text messaging,
- online presence and last seen,
- message delivery/read receipts,
- basic auth and enterprise tenant isolation,
- simple but production-viable storage model.

### Architecture Option A (Recommended for MVP): WebSocket + Server Relay
Use a central backend to relay messages over WebSockets. This is the most common and operationally simple architecture for enterprise chat MVPs.

**Client (PWA)**
- React/Next.js (or similar) with service worker and offline cache,
- WebSocket connection for live message events,
- REST endpoints for initial sync/history fetch and auth bootstrap.

**Backend**
- API Gateway / Load Balancer,
- stateless chat service instances (horizontal scale),
- WebSocket session manager + presence service,
- message persistence service,
- optional pub/sub (Redis, NATS, Kafka) for fan-out across multiple instances.

**Data Flow**
1. Sender posts message over WebSocket.
2. Chat service validates tenant + auth + recipient relationship.
3. Message is written to durable storage.
4. Event is published to pub/sub for recipient fan-out.
5. Recipient gets real-time delivery event; receipts are persisted asynchronously.

### Architecture Option B: WebRTC DataChannel (True P2P) + TURN Fallback
This enables direct browser-to-browser transport, but is harder operationally for enterprise environments due to NAT/firewall constraints and reliability concerns.

- Requires signaling server anyway,
- requires STUN/TURN infrastructure,
- encryption and compliance controls become more complex at enterprise scale,
- better for low-latency media-style workloads than auditable enterprise messaging.

Recommendation: keep WebRTC as a future optimization, not MVP default.

### Architecture Option C: Hybrid (Local-First + Server Authority)
Clients store local state for instant UX while server remains source of truth.

- optimistic local sends,
- background sync retries,
- conflict resolution by server ordering rules,
- good path once offline-first behavior becomes important.

## Data Storage Design (MVP)
For enterprise messaging, storage should prioritize auditability, tenancy boundaries, and query efficiency.

### Primary Store
Use PostgreSQL first (widely used, strong consistency, easy operations for MVP).

Suggested core tables:
- `tenants`
- `users`
- `conversations` (1:1 for MVP)
- `conversation_participants`
- `messages`
- `message_receipts` (delivered/read)
- `presence_events` (or short-TTL in Redis)

### Cache + Ephemeral State
- Redis for:
  - active WebSocket connection maps,
  - short-lived presence status,
  - idempotency keys / rate limiting,
  - pub/sub for cross-instance fan-out.

### Attachment Storage (Later)
- Object storage (S3-compatible) for files/images,
- message row stores metadata and signed URL references.

## Scalability Path
Start simple, then scale bottlenecks independently.

### Phase 1 (0 → early customers)
- single region,
- Postgres primary + read replica optional,
- Redis single node or managed small cluster,
- horizontally scaled chat API pods.

### Phase 2 (growth)
- partition message writes by `tenant_id` + `conversation_id`,
- move event fan-out to durable bus (Kafka/NATS) if needed,
- add background workers for receipts, notifications, and analytics projection.

### Phase 3 (enterprise scale)
- multi-region strategy:
  - home-region write authority per tenant,
  - local read replicas,
  - async cross-region replication and failover plans,
- dedicated compliance pipelines (retention, legal hold, audit export).

## Security + Enterprise Requirements (From Day 1)
- OIDC/SAML SSO support path,
- strict tenant isolation on every query and event route,
- at-rest encryption and TLS in transit,
- immutable audit events for message lifecycle,
- retention policy framework (per-tenant),
- role-based access control.

## Recommended MVP Stack (Practical)
- **Frontend**: Next.js PWA + TypeScript.
- **Realtime**: WebSocket (Socket.IO or native WS).
- **Backend**: Node.js/TypeScript (or Go) stateless services.
- **DB**: PostgreSQL.
- **Cache/PubSub**: Redis.
- **Infra**: managed Kubernetes or ECS/Fargate.
- **Observability**: OpenTelemetry + centralized logs + basic SLO dashboards.

## Why This MVP Sequence Fits RTS
1. Proves real-time communication reliability.
2. Establishes tenant-aware event schema.
3. Builds the canonical event log needed for later 3D RTS rendering.
4. Creates the substrate for automation and agents without premature complexity.

## Deep Technical: Data Platform for 1,000s of Companies
If RTS becomes the operational system of record for many enterprises, the data layer should be designed around **tenant isolation, predictable scaling, and operability**.

### Key Clarification
“On-prem PostgreSQL” is usually the wrong default for a SaaS RTS platform.  
What scales in practice is typically:
- managed cloud Postgres/MySQL for early stages,
- plus horizontal partitioning (by tenant/workspace),
- plus event streaming and read-model separation,
- plus regionalization over time.

The question is less “Postgres vs not Postgres” and more “what is the right **evolution path**?”

## How Similar Companies Handle Data (Publicly Shared Patterns)
### Slack (public engineering posts)
- Slack persisted message data in MySQL and migrated to **Vitess** for horizontal scaling and flexible sharding.
- They emphasize persisting a message before realtime fan-out and scaling through keyspaces/shards.
- They also operate multi-region and discuss separating transient realtime events from durable persisted events.

What this implies for RTS:
- relational storage can scale very far with the right sharding control plane,
- realtime delivery and durable storage should be separate concerns,
- choose shard keys that avoid “hot enterprise tenant” bottlenecks.

### Linear (public engineering post)
- Linear publicly describes a multi-region design where they initially replicated full regional deployments instead of early complex DB sharding.
- They added a global auth/routing layer that resolves workspace region and forwards requests to the correct regional backend.
- They prioritized isolating multi-region complexity so product engineers can keep building features without region-specific logic.

What this implies for RTS:
- region-routing + workspace placement is a practical step before hard sharding,
- keep multi-region concerns in platform services (proxy/auth), not product code.

### Front (public security/compliance handbook)
- Front publicly documents AWS-based distributed architecture with RDS, S3, queueing (SQS), VPC isolation, and logical tenant separation via enterprise IDs.
- They also document regional hosting options (US/EU), encryption, and audit trail concepts.

What this implies for RTS:
- for enterprise trust, architecture and compliance controls are part of product design, not afterthoughts,
- tenant identity must be enforced through every storage and retrieval path.

## RTS Recommended Data Architecture (Target State)
### 1) Core OLTP (System of Record)
- Primary relational store (Postgres or MySQL/Vitess family).
- Strict tenant-scoped schema design from day 1.
- All writes include `tenant_id` + stable entity IDs.
- Message/task/event rows include immutable append metadata and version fields.

### 2) Realtime Transport Layer
- WebSocket gateways for connected clients.
- Presence and ephemeral state in Redis or memory grid.
- Durable events still written to OLTP first (or transactionally staged) before delivery acknowledgment for critical event classes.

### 3) Event Log / Stream
- CDC or transactional outbox from OLTP into Kafka/PubSub/NATS.
- Downstream consumers build specialized read models:
  - search index,
  - analytics warehouse,
  - notification materializations,
  - executive risk dashboards,
  - agent context projections.

### 4) Query-Optimized Read Models
- Keep OLTP normalized and strict.
- Build denormalized projections for fast UI queries and timeline rendering.
- Support replay/rebuild from event log when projection bugs happen.

### 5) Policy + Audit Plane
- Immutable audit log for message/task lifecycle events.
- Centralized policy evaluation for permissions and agent action gates.
- Retention/legal-hold per tenant and per data class.

## Tenant Scaling Strategy (Concrete)
### Stage A (now)
- Single region, single primary relational cluster.
- Partition high-volume tables by `tenant_id` hash + time.
- Soft limits and rate shaping by tenant.

### Stage B (growth)
- Introduce logical shards (tenant ranges).
- Directory service maps `tenant_id -> shard`.
- Move heavy tenants to dedicated shards (“tenant split” playbook).

### Stage C (multi-region)
- Region assignment at tenant/workspace creation.
- Global edge router resolves tenant region and forwards to regional API.
- Keep writes local to home region; use async replication for global analytics/search copies.

### Stage D (very large scale)
- Mix of:
  - pooled multi-tenant shards for SMB/mid-market,
  - single-tenant or isolated shard groups for top enterprise tenants,
  - dedicated compliance controls where required.

## Data Model Rules You Should Lock In Early
1. Every record is tenant-scoped.
2. Every mutation emits an auditable event.
3. IDs are globally unique and sortable (ULID/KSUID/Snowflake style).
4. Cross-tenant joins are forbidden at application level.
5. Deletion is policy-driven (soft delete + retention pipeline).
6. Agent actions are first-class events with actor type (`human`, `automation`, `agent`).

## Recommendation: What to Build First
For RTS MVP + future scale:
1. Start with **managed Postgres + Redis + object storage + outbox table**.
2. Add strict tenant boundaries and audit events immediately.
3. Add stream pipeline (Kafka/PubSub) when projections/search/analytics begin to contend with OLTP.
4. Add region routing once enterprise/compliance demand requires data residency options.

This path avoids premature complexity while preserving a clean migration path to Slack/Linear-class scale patterns.
