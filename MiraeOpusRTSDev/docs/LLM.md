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

## How Similar Companies Handle Data (Publicly Shared Patterns)

### Slack — Deep Architecture Breakdown

#### Background and Origins
Slack's technical foundation traces back to a browser-based MMORPG called Glitch. Although Glitch failed commercially, the internal communication tool built during its development became Slack. This origin baked in two architectural principles early: a separation between a dedicated channel server for real-time messaging and a web application for business logic, storage, and authentication.

#### The Two Core Backend Systems
Slack's backend is split into two fundamental systems that work together:

1. **Webapp servers** — these handle HTTP request/response cycles and communicate with databases, job queues, and other internal services. They are the "brain" that handles business logic, authentication, message persistence, and search indexing.

2. **Real-time message servers** — these fan out messages, presence updates, typing indicators, and other live events to connected clients over WebSockets. They are the "nervous system" that keeps every open Slack client in sync.

When you send a message, it goes to the webapp via HTTP POST first. The webapp persists it to the database and queues it for indexing. Only after the message is durably stored does the system invoke the channel server for real-time broadcast. This is a deliberate design choice — Slack originally broadcast messages before persisting them, which meant if a server crashed mid-broadcast, messages could be lost even though they appeared as "sent" on the sender's screen. The current approach guarantees that a message is either stored or the sender gets a clear failure notification.

#### What "Sharding" Means (Plain Language)
Sharding is just splitting one giant database into many smaller databases, each responsible for a slice of the data. Imagine one filing cabinet holding every message from every company in the world — eventually it's too full, too slow, and too many people are trying to open drawers at the same time. Sharding splits that cabinet into many smaller ones. Cabinet A holds companies 1–1000, Cabinet B holds 1001–2000, and so on. Each cabinet lives on its own server, so you spread the load.

The hard part is deciding *how* to split (the "shard key") and making sure requests get routed to the right cabinet. That's where Vitess comes in.

#### Vitess — Slack's Sharding Layer
Slack persists message data in MySQL and migrated to **Vitess** for horizontal scaling. Vitess is an open-source system (originally built by YouTube/Google) that sits on top of MySQL and acts as a smart routing layer. It handles splitting, merging, and rebalancing shards automatically so your application code doesn't have to know which shard a particular piece of data lives on.

Key properties of Vitess that matter:
- Application code and database queries remain oblivious to how data is distributed across shards — Vitess encapsulates the routing logic.
- It makes it trivial to re-partition a shard or merge shards as requirements evolve.
- It provides a shard topology management service, so as you grow you can add more shards without rewriting your app.

Slack's original shard key was the **workspace**. When a workspace was created, it was assigned to a specific database shard, messaging server shard, and search service shard. To find data or route a message, the system only needed to look up which shard that workspace was assigned to. This was simple and effective for years.

#### The Real-Time Messaging Pipeline (Detailed)
Slack's real-time infrastructure has four key server types:

1. **Gateway Servers (GS)** — stateful, in-memory servers that maintain user information and WebSocket channel subscriptions. They act as the interface between Slack clients and Channel Servers. Gateway Servers are deployed across multiple geographic regions to optimize connection speeds. When you open Slack, your client establishes a WebSocket connection to the nearest Gateway Server.

2. **Channel Servers (CS)** — stateful, in-memory servers that manage the pub/sub subscriptions for channels. When a message is sent to a channel, the Channel Server knows which Gateway Servers have clients subscribed to that channel and fans the message out to them.

3. **Admin Servers (AS)** — stateless, in-memory servers that act as the interface between the Webapp backend and Channel Servers. They translate webapp events into the real-time pipeline.

4. **Presence Servers (PS)** — track which users are online, powering the green dots in Slack clients.

The message flow works like this: a message travels from the Webapp API → Admin Server → Channel Server → every subscribed Gateway Server worldwide → every connected client subscribed to that channel. Slack's engineering team reports they serve tens of millions of channels per host, tens of millions of connected clients, and deliver messages globally within 500 milliseconds.

For transient events like "user is typing," these follow a slightly different path since they don't need to be persisted to a database — they flow through the real-time pipeline only and are never stored.

#### Flannel — The Caching Layer
When you first launch Slack, the client needs to know who's on your team, what channels you're in, who's in those channels, etc. Originally, the server sent a giant snapshot of all this data at boot time. For large teams, this snapshot could grow to dozens of megabytes and take a long time to load.

To fix this, Slack built **Flannel** — a geo-distributed caching microservice that:
- Maintains a pre-warmed, in-memory cache of team metadata.
- Listens to real-time events to keep the cache continuously updated.
- Serves session data locally from regional replicas, reducing latency and backend load.
- Enables lazy loading — the client loads minimal data at boot time and fetches more on demand from Flannel, which guarantees fast data access because it's nearby and already has the data cached.

This transformed Slack's session startup from a heavy compute operation into a cache-driven process. The name "Flannel" has no deep meaning — on the day the project kicked off, the lead engineer happened to be wearing a flannel shirt.

#### Kafka and Redis — The Plumbing
Slack uses **Kafka** for durable message queuing — it acts as the system's permanent ledger. Events are written to Kafka so they can be replayed, processed by downstream consumers (search indexing, analytics, notifications), and audited.

**Redis** is used for fast, ephemeral data — active WebSocket connection maps, in-flight job data, presence status, idempotency keys, and rate limiting. Redis also handles pub/sub for cross-instance fan-out (when multiple server instances need to coordinate who gets what message).

Slack also uses idempotency keys to handle message duplication, which is a common problem at scale when clients retry sends due to network delays. The idempotency key lets the server recognize "I already processed this message" and suppress the duplicate.

#### Cellular Architecture — Failure Isolation
Slack's core infrastructure runs in multiple Availability Zones (AZs) within a single AWS region (us-east-1). Availability Zones are isolated datacenters — they're physically separate so a failure in one shouldn't take down the others.

However, Slack learned the hard way (during a real outage on June 30, likely 2022) that their original architecture didn't actually isolate failures well. A problem in one AZ would cascade across all AZs because backend services were spread across zones and talking to each other freely.

To fix this, Slack migrated to a **cellular architecture** over ~1.5 years:
- All services are present in all AZs, but each service only communicates with services within its own AZ.
- If one AZ fails, the failure is contained to that AZ.
- Slack can redirect traffic away from a bad AZ at the frontend level, and all internal services in that AZ naturally stop getting work.
- The design goal: remove as much traffic as possible from a failing AZ within 5 minutes (Slack's 99.99% availability SLA allows less than 1 hour of downtime per year).

This is essentially an "AZ drain button" — conceptually simple, but operationally complex to build across hundreds of services.

#### Unified Grid — The Big Architectural Rewrite
Slack launched in 2013 with a simple assumption: each user belongs to a single workspace. To see messages from a different workspace, you clicked into it. The workspace was the fundamental unit of everything — data storage, permissions, routing.

This worked fine until large enterprise customers (with Enterprise Grid) needed users to work across many workspaces within one organization. Slack initially tried to build views that aggregated content from multiple workspaces (like a unified Threads view and Unreads view) on top of the existing workspace-centric model. But the underlying architecture kept causing friction.

Eventually Slack committed to a full rewrite called **Unified Grid** — moving from workspace-centric to organization-wide architecture. This meant:
- Updating thousands of APIs, database queries, and permissions checks.
- Migrating client data stores from workspace-scoped repositories to org-wide stores (different clients solved this differently — some added an org-level store while keeping some workspace-scoped data, others moved everything).
- Building a tracking spreadsheet and methodically driving the count of broken APIs toward zero.

The team prototyped the path first to prove value before committing fully. They also combined the effort with a major UI revamp to get organizational buy-in. Unified Grid was used internally by summer 2023, rolled out to customers in fall 2023, and completed the rollout in March 2024.

The lesson: your initial data model assumptions (workspace = tenant = everything) will haunt you if the business outgrows them, and rewriting is a multi-year effort.

#### Slack's Scale Numbers (Public)
- Billions of messages sent daily.
- Millions of channels served in real time globally.
- Tens of millions of connected clients.
- Tens of millions of channels per host.
- Sub-500ms global message delivery.
- Peak traffic between 11:00–14:00 on weekdays, with the active window roughly 09:00–17:00.

#### What This Implies for RTS
- **Relational storage can scale very far** with the right sharding control plane (Vitess or equivalent). Don't prematurely abandon relational databases.
- **Save before you broadcast.** Never send a real-time event until the data is durably stored. Slack learned this the hard way by losing messages when servers crashed mid-broadcast.
- **Separate your hot path from your cold path.** Real-time delivery (WebSockets, presence, typing indicators) is a fundamentally different concern than durable storage (MySQL/Postgres) and search indexing. Don't make one system do all three.
- **Build a caching layer early.** Something like Flannel — a geo-distributed, pre-warmed cache for team metadata — will matter the moment you have any real user count. It also enables lazy loading, which dramatically improves client startup time.
- **Choose your shard key carefully.** Slack used workspace as the shard key and it worked for years, but eventually had to do a multi-year rewrite when the business model outgrew it. For RTS, think carefully about whether the tenant boundary is the company, the workspace, or the organization — because changing it later is extremely painful.
- **Plan for failure isolation from the start.** Slack's cellular architecture (services only talk within their own AZ, traffic drainable at the edge) is worth understanding even if you don't build it day one. At minimum, design your services so that AZ isolation is *possible* later without a rewrite.
- **Idempotency keys are not optional.** At any meaningful scale, network retries will cause duplicate messages. Build deduplication into the message pipeline early.
- **Reconnect storms are a real threat.** When a regional network problem or software bug drops thousands of connections simultaneously, all those clients reconnect at once and can overwhelm your backend. This is something Slack is still actively engineering around.

### Linear — Deep Architecture Breakdown

#### Background and What Linear Is
Linear is a project management and issue tracking tool for software teams — essentially a modern replacement for Jira. What makes it technically interesting (and relevant to RTS) is that it feels impossibly fast. Every interaction is instant — clicking an issue, updating a status, searching. There are no loading spinners. This isn't just good frontend engineering; it's a fundamentally different architecture called **local-first**, and it has deep implications for how you build real-time collaborative software.

Linear was founded in 2019 by Tuomas Artman (previously at Airbnb) and Karri Saarinen (previously at Airbnb and Coinbase). Their co-founder Tuomas described the tech stack in 2019 as: "A pretty basic stack. React, MobX, TypeScript and Node with PostgreSQL. And some home-made sync magic." That "home-made sync magic" is the core of everything.

#### The Tech Stack
Linear's infrastructure runs on Google Cloud Platform:

- **Backend**: Node.js and TypeScript, running as Kubernetes workloads that scale independently.
- **Database**: Google Cloud SQL for PostgreSQL — their primary data store. They've scaled into tens of terabytes of data on managed Postgres without a dedicated operations team, which they credit to using managed services. They also use pgvector for vector search (finding duplicate/similar issues), which required partitioning their issues table into 300 segments to index at scale.
- **Cache/Event Bus**: Google Memorystore for Redis, used as both an event bus and a cache.
- **APIs**: Both public and private GraphQL APIs.
- **Real-time**: WebSocket servers for sync.
- **Background Work**: Task runners for background jobs, running as separate Kubernetes workloads.
- **Frontend**: React with MobX for state management, TypeScript throughout.

The key architectural insight: Linear doesn't have a dedicated ops team. They lean heavily on managed cloud services (Cloud SQL, Memorystore) so their engineers can focus on product. This is a deliberate tradeoff — they're paying Google to handle database operations rather than hiring DBAs.

#### The Sync Engine — How Linear Feels Instant (Local-First Architecture)

This is the most important part of Linear's architecture and the thing that makes it feel like magic. Here's how it works in plain language:

**Traditional web apps** work like this: you click something → the browser sends a request to the server → the server queries the database → the server sends back a response → the browser updates the screen. Every interaction has network latency (typically 50–500ms depending on where you are).

**Linear's approach** flips this: Linear downloads a copy of your workspace's data to your browser and stores it in **IndexedDB** (a database built into every browser). When you click something, you're querying a local database on your own machine — zero network latency. When you make a change, it updates locally *first* (so it feels instant), then syncs to the server in the background.

Here's the detailed flow:

1. **Bootstrap**: When you first open Linear, it sends a request to `/sync/bootstrap` with `type=full`. The server sends down a snapshot of your workspace data — users, issues, projects, labels, etc. This gets stored in IndexedDB. A second request with `type=partial` fetches less critical data (like comments and attachments) that aren't needed to render the initial view.

2. **Local Object Graph**: Linear uses MobX to build an in-memory object graph from the IndexedDB data. The UI reads directly from this object graph. When you search for issues, you're filtering a JavaScript array in memory — that's why search is instant.

3. **Mutations (Making Changes)**: When you update an issue (say, change its status), the flow is:
   - The frontend directly updates the local object graph (instant UI update).
   - This triggers an update to the object pool in IndexedDB.
   - A transaction is queued to send the change to the backend via a GraphQL mutation.
   - The backend persists the change to Postgres.

4. **Real-time Sync**: Every change in Linear produces a `SyncAction` — a record with a unique, incrementing ID (the `lastSyncId`). The client maintains a WebSocket connection and receives these SyncActions in real time. When another user changes an issue, your client receives the SyncAction, updates IndexedDB, updates the in-memory object graph, and the UI reactively updates via MobX. The `lastSyncId` acts as a cursor — the client knows exactly where it left off and can request any changes it missed.

5. **Conflict Resolution**: Linear uses **Last-Write-Wins (LWW)** for most data. Their co-founder Tuomas has said that conflicts are actually not that common in issue trackers — two people rarely edit the same field of the same issue at the same time. For rich text (issue descriptions), they recently added CRDTs (Conflict-free Replicated Data Types), but for everything else, LWW is sufficient.

6. **Offline Support**: Because the full dataset lives in IndexedDB, Linear works offline. You can create issues, update statuses, etc. Changes queue up locally and sync when you reconnect.

**Why this matters economically**: Because data is persisted on users' devices, Linear doesn't pay for database reads as often as a traditional three-tier application. The server is mostly handling writes and sync deltas, not serving every page load from the database. This is a meaningful cost advantage at scale.

**The tradeoff**: Building and maintaining a sync engine is genuinely hard. Linear's co-founder has given multiple talks about the challenges of scaling it — handling large workspaces where the bootstrap data gets huge, managing schema migrations across clients that might be offline on old versions, dealing with edge cases where the read or write path gets stale. This is not a "set and forget" system; it requires continuous engineering investment.

#### Multi-Region Architecture — How Linear Went Global

Linear's multi-region story is one of the cleanest examples of how to do this without overcomplicating your codebase. They published a detailed engineering post in May 2024 explaining the approach.

**Why they did it**: Two reasons. First, having separate regional deployments makes future scaling simpler — if you can host some workspaces in one deployment and some in another, you avoid hitting scaling limits on a single Postgres server. Second, European enterprise customers needed data residency in Europe for GDPR compliance.

**The key decision — replicate everything, don't shard**: Instead of sharding their database (splitting one database into pieces), Linear chose to replicate the entire production deployment per region. Each region gets a complete copy of the Linear stack: API servers, sync engine, background task processors, and databases. This means:
- Engineers can continue writing code against a single database instance — no shard-aware queries.
- All ancillary data stores (Redis, etc.) are regional by default with no extra logic.
- Problems in one region don't affect others — full isolation.
- It's conceptually simpler than sharding, at the cost of running duplicate infrastructure.

**The three-phase build**:

**Phase 1 — Terraform (Infrastructure as Code)**: Before multi-region, all of Linear's infrastructure was manually managed in Google Cloud. They used Google Cloud's Terraform export tooling to convert their existing setup into Terraform modules, then refactored those modules to accept a target region as a variable. This let them spin up a complete new region by changing one parameter. They also used this to build a staging environment for testing.

**Phase 2 — Extracting the Authentication Service**: This was the hardest part. They built a global authentication service that knows about all user accounts, all workspaces, and which region each workspace lives in. Key design decisions:
- **One-way data flow**: Regional services can call the auth service directly, but the auth service communicates back via Google Pub/Sub (one-to-many pattern) to schedule tasks across all regions. The auth service only responds to HTTP requests — no background task runner — making deployment simpler.
- **GraphQL internal API**: They chose GraphQL for service-to-service communication (not ideal, but they already had strong GraphQL tooling in their codebase and used Zeus for type-safe client generation).
- **Database split**: The auth service initially shared a database with the main backend in the US region. Once the extraction was done, they split tables into separate schemas and set database permissions so the auth service literally cannot read or write regional data, and vice versa.
- **Shared records**: Some data (like workspace settings) needs to exist in both the auth service and regional databases. For creates, they always create in the auth service first (to enforce global uniqueness constraints like workspace URL keys), then create the corresponding record in the regional database using the returned ID. For deletes, same order, with Postgres triggers as a fallback for cascading deletes. For updates, they reuse the sync engine's existing logic to schedule async updates to the auth service.
- **Consistency checks**: Background tasks periodically walk through all synced tables, fetching batches and comparing records between the auth service and regional databases to catch any drift.

**Phase 3 — The Proxy Layer (Cloudflare Workers)**: Since Linear already used Cloudflare Workers extensively, they added a proxy worker in front of all traffic. The flow:
1. Request arrives at Cloudflare Worker.
2. Worker extracts authentication info from the request.
3. Worker calls the auth service to get a signed JWT and the target region.
4. Worker forwards the request to the correct regional deployment with the pre-signed header.
5. Cloudflare caches auth signatures so frequent requests from the same client skip the round-trip to the auth service.

This works even for WebSocket connections (Linear's real-time sync) because Cloudflare Workers that pass through a fetch without modifying the response use an efficient code path.

**The critical design principle**: Region selection is invisible to users except when creating a workspace. There's no separate domain for Europe — you use `linear.app` and `api.linear.app` regardless of where your data is. Engineers developing features never have to think about multi-region. All multi-region complexity is isolated to a few sub-systems (the proxy, the auth service, and the data sync logic). This was an explicit, non-negotiable requirement from the start.

**Rollout strategy**: They added a region selector to workspace creation, gated behind a feature flag. It was initially available only to Linear engineers internally. Once confirmed working, they gradually opened it to all users. The default region is set based on the user's system timezone.

#### What This Implies for RTS

- **Local-first is the gold standard for perceived performance.** If RTS needs to feel instant (and for an operational command center, it does), downloading data to the client and syncing is the way to get there. The tradeoff is significant engineering complexity in the sync engine, but the UX payoff is massive — zero loading spinners, offline capability, and minimal server-side read load.
- **You don't need CRDTs for everything.** Linear runs on Last-Write-Wins for almost all data and only uses CRDTs for rich text editing. For an RTS system where most updates are discrete actions (assign owner, change status, post message), LWW is likely sufficient.
- **Replicate entire deployments instead of sharding early.** Linear's approach of spinning up a complete stack per region is simpler than database sharding and gives you full regional isolation for free. For RTS, this means you can defer complex sharding decisions until you actually hit the scaling limits of a single Postgres instance (which can handle tens of terabytes, as Linear demonstrates).
- **Extract authentication as a global service from the start.** This is the foundation that makes multi-region possible without rewriting your app. The auth service knows which region every workspace belongs to, and the proxy layer handles routing transparently. For RTS, building a global auth/routing layer early (even before you need a second region) means you won't have to untangle auth from your regional services later.
- **Isolate multi-region complexity ruthlessly.** Linear's non-negotiable rule was that product engineers should never have to think about regions when writing features. All multi-region logic lives in the proxy, the auth service, and the data sync layer. For RTS, this means keeping your platform concerns (routing, auth, region placement) completely separate from your product code (messaging, task management, dashboards).
- **Managed services over ops teams.** Linear runs on Cloud SQL for Postgres, Memorystore for Redis, and Kubernetes — all managed by Google Cloud. They explicitly chose this so they didn't need a dedicated ops team. For an early-stage RTS product, this is the right call: pay your cloud provider to handle infrastructure operations and keep your engineering team focused on product.
- **Terraform your infrastructure before you need a second region.** Linear converted to infrastructure-as-code before going multi-region, which made spinning up a new region trivial. For RTS, getting on Terraform/Pulumi early means you can replicate your entire stack to a new region with a parameter change when the time comes.
- **The sync engine is a competitive moat.** Linear's speed is its primary competitive advantage over Jira, and it comes directly from the sync engine. For RTS, if you can build a sync engine that keeps the executive command view and operational dashboard instant and always up-to-date, that's a genuine differentiator that's very hard for competitors to replicate.

### Front — Deep Architecture Breakdown

#### Background and What Front Is
Front is a customer communication platform (founded 2013, Y Combinator 2014) that unifies email, SMS, live chat, WhatsApp, social media, and other channels into a single collaborative inbox. Over 8,000 companies use it. Think of it as "Slack meets Zendesk" — teams can @mention each other inside email threads, leave internal comments, assign conversations, and automate routing, all without the customer seeing the internal collaboration.

Front is relevant to RTS not because of a flashy sync engine or sharding story, but because they are a strong example of **enterprise-grade security, compliance, and tenant isolation done right from day one** — which is exactly what an enterprise operational platform like RTS needs to earn trust and close deals with larger customers.

Unlike Slack and Linear, Front does not publish detailed engineering architecture blog posts. What they *do* publish extensively is their security posture, compliance certifications, and enterprise architecture — because for a product that handles companies' most sensitive customer communications, security *is* the product story.

#### Enterprise Architecture (From Front's Public Security Handbook)
Front's October 2024 Security and Compliance Handbook includes an architecture diagram that reveals their system design:

**Cloud Infrastructure**: Front is hosted entirely on Amazon Web Services (AWS), designed for 99.99% availability. Services are hosted regionally from both the US and the EU, giving customers a choice of data residency at workspace creation.

**The Core Services**:
- **Metadata Server** — built on Amazon RDS (Relational Database Service), encrypted at rest. This is the primary database holding conversation metadata, user data, team structures, rules, tags, and all the application state.
- **Content Server** — hosted on Amazon S3, with files stored in encrypted blocks. This handles attachments, images, and file storage.
- **Message Queue** — Amazon SQS (Simple Queue Service) for asynchronous processing. This decouples the intake of messages from processing, enabling the system to handle bursts of incoming email/chat without blocking.
- **Elasticsearch** — for search functionality across conversations and contacts.
- **Memcached** — for caching hot data and reducing database load.
- **Analytics** — a separate analytics service for reporting and dashboards.

**Client Access**: The system serves desktop, web, mobile, and API clients, plus an SMTP interface for email ingestion. All client communication requires HTTPS connections and TLS 1.2 encryption in transit.

**Network Architecture**: All services are contained within a protected VPC (Virtual Private Cloud) environment using individual security groups. This means each service component has its own network isolation rules — the database can only be reached by the application servers, the application servers can only be reached by the load balancer, etc. This is defense-in-depth: even if one component is compromised, the attacker can't laterally move to other services.

The architecture uses multiple availability zones for redundancy with integrated failover and fault tolerance. All production systems require VPN and multi-factor authentication for engineer access.

#### Tenant Isolation — The Key Design Pattern
This is the most important architectural lesson from Front for RTS:

**Every customer is assigned a unique enterprise identifier (enterprise ID).** This ID is used to validate requests during all data retrieval processes. All customer data is logically separated using this identifier — meaning the application layer enforces tenant boundaries on every single database query, every API request, every event, and every data export.

This is "logical" tenant isolation (as opposed to "physical" isolation where each customer gets their own database). It means:
- One shared database infrastructure serves all customers.
- But every query includes the enterprise ID as a filter.
- No API endpoint can return data without first validating the tenant context.
- No admin action can cross tenant boundaries without explicit authorization.

For a platform handling 8,000+ companies' most sensitive customer communications — emails, support tickets, billing conversations — this tenant isolation must be airtight. A single data leak across tenants would be catastrophic.

#### Security Controls
Front's publicly documented security practices are worth studying because they represent the baseline that enterprise customers expect:

**Data Encryption**:
- Data at rest: AES-256 bit encryption (via RDS and S3).
- Data in transit: TLS 1.2.
- All API and client communication requires HTTPS.

**Authentication and Access**:
- Two-factor authentication (TOTP-based) for all users.
- Single Sign-On (SSO) via any SAML-based Identity Provider (Okta, Google, OneLogin, Azure AD).
- OAuth support for Gmail and Office 365 mailbox connections.
- IP restrictions — administrators can allowlist specific IP addresses from which employees can access Front.
- Role-based access control with customizable permission sets.
- Admin console for managing teammate settings, signatures, and preferences.

**Email Security**: SPF, DKIM, and DMARC record support — essential for enterprise email trust.

**Audit and Governance**:
- Conversation audit trail — all user actions, rule triggers, and API activities generate an activity history logged to the conversation.
- Sensitive administrative actions trigger real-time notifications written to an immutable log.
- Background checks for all employees prior to hiring.
- Annual third-party vulnerability audits and security penetration tests.
- A bug bounty program through HackerOne.
- Engineers go through annual security developer training beyond general onboarding.

**Data Privacy and Compliance**:
- SOC 2 Type II compliant.
- ISO 27001 certified.
- GDPR and CCPA compliant.
- HIPAA compliant (with signed BAA for customers handling protected health information).
- EU/US and EU/Switzerland Privacy Shield framework adherence.
- Data retention and deletion policies with GDPR-compliant data deletion upon validated request (metadata purged from backups within 10 days).
- Regional data hosting — customers choose US or EU at setup.
- Defined information security incident response program for disaster recovery and business continuity.

**Application Security**:
- Source code stored in a secure environment with peer review for all changes.
- Dedicated staging environments separated from production.
- All company-owned devices encrypted with MDM (Mobile Device Management) for remote wipe capability.
- Principle of least privilege applied to all business systems.
- Security monitoring technology for detecting system anomalies.

**AI-Specific Privacy**: For AI-powered features (Autopilot, Copilot, Smart QA), Front explicitly states that customer data is not used for model training. Third-party AI providers are listed as subprocessors, and customers can disable AI features entirely.

#### Multi-Team Workspaces and Organizational Design
Front's Teams feature allows organizations to build multiple workspaces within a single account, each containing its own resources (tags, rules, response templates, analytics). This is relevant to RTS because it shows how a SaaS product can offer organizational flexibility within a single tenant:
- A logistics company might have separate workspaces for US operations, EU operations, and VIP clients.
- Each workspace has its own automations and analytics, but they all live under one enterprise ID.
- Delegated inboxes let one user manage another's workspace without sharing credentials.

This is a practical model for how RTS could structure its multi-team support — different departments or business units within a single company get their own operational views and automations, but everything rolls up to the enterprise-level executive command view.

#### Front's Scale Context
- 8,000+ customers (as of late 2024).
- Founded 2013 in Paris, relocated to San Francisco after Y Combinator.
- Pricing from $19/seat/month (Starter) to $229/seat/month (Premier, 50+ seats).
- 110+ integrations (Salesforce, Jira, Slack, HubSpot, etc.).
- Omnichannel: email, SMS, WhatsApp, live chat, Facebook, Instagram, Slack, Twitter, voice (via Dialpad/Aircall).
- One engineer noted that "systems are running at scale at Front — it's quick to understand the general concept of their architecture, but grasping the in-depth view of the whole system is not."

#### What This Implies for RTS

- **Security and compliance are product features, not afterthoughts.** Front can sell to financial services, healthcare, logistics, and manufacturing companies precisely because they invested in SOC 2, ISO 27001, HIPAA, GDPR, and regional data hosting from the start. For RTS, if the goal is to be the operational system of record for enterprises, these certifications and controls need to be on the roadmap from day one. You won't close enterprise deals without them.
- **Tenant isolation via enterprise ID must be enforced at every layer.** Every database query, every API response, every event, every audit log entry must be scoped to the tenant. Front's approach of logical separation with a unique enterprise identifier is the right model — it lets you run shared infrastructure (which is cheaper) while maintaining strict data boundaries. For RTS, this means the `tenant_id` should be a required parameter on literally every data access path, not just most of them.
- **The audit trail is not optional for enterprise customers.** Front logs every user action, rule trigger, and API call to an immutable conversation history. Enterprise buyers will ask for this. Their compliance teams will ask for this. For RTS, building immutable audit events from the start (as already noted in the RTS data model rules) is validated by Front's approach.
- **Regional data hosting is a requirement, not a nice-to-have.** European enterprises increasingly need data to stay in Europe. Front offers US/EU hosting choice at workspace creation. For RTS, the Linear-style regional deployment model (replicate the entire stack per region) combined with Front's enterprise ID isolation gives you both data residency and tenant security.
- **AI features need explicit data privacy guarantees.** As RTS adds AI agent capabilities, you'll need to clearly state that customer data is not used for model training, that AI providers are listed as subprocessors, and that AI features can be disabled per-tenant. Front's approach here is a good template.
- **The VPC + security group pattern is the AWS baseline.** Each service component in its own security group within a VPC, with explicit rules about what can talk to what — this is standard but essential. For RTS on AWS (or equivalent on GCP/Azure), this network architecture should be the default from MVP.
- **SQS-style message queuing decouples ingestion from processing.** Front uses SQS to handle bursts of incoming messages. For RTS, which will ingest signals from multiple communication channels (email, Slack, SMS, etc.), a message queue between ingestion and processing is essential for handling spikes without dropping events.
- **Enterprise features sell enterprise deals.** SSO, IP restrictions, role-based access, audit trails, data retention policies, admin consoles — these are the features that get you past enterprise security reviews. They're not exciting, but they're deal-breakers. Plan for them architecturally even if you don't build them all in MVP.

### Discord — Deep Architecture Breakdown

#### Background and What Discord Is
Discord is a real-time voice, video, and text communication platform, originally built for gamers in 2015, now used by over 200 million monthly active users across every kind of community. It handles trillions of messages, millions of concurrent voice connections, and massive "guild" (server) sizes — the MidJourney server alone exceeded 15 million members. Discord is relevant to RTS because it's the most publicly documented example of building real-time messaging infrastructure at extreme scale with a remarkably small engineering team.

#### The Tech Stack — A Multi-Language Architecture
Discord chose its languages pragmatically based on what each subsystem needs:

- **Elixir (Erlang VM/BEAM)** — powers all real-time communication: the WebSocket gateway, presence tracking, typing indicators, voice call signaling, and 20+ individual services. Discord runs 400–500 Elixir machines maintained by just 5 engineers. The Erlang VM's lightweight process model (one process per user session) enables millions of concurrent WebSocket connections. Discord's team has stated: "What we do would not be possible without Elixir. It wouldn't be possible in Node or Python."
- **Rust** — used for performance-critical data services. Discord built a Rust-based data services layer between their API and database, and rewrote their data migrator in Rust (reducing a 3-month migration to 9 days). They also use Rust NIFs (Native Implemented Functions) inside Elixir for hot data structures that Elixir alone couldn't handle fast enough — achieving 160x worst-case performance improvement for their sorted member lists.
- **Python** — powers the API monolith. While Elixir handles real-time, Python handles the REST API for general operations (fetching profiles, server info, sending messages via HTTP).
- **C++** — handles actual audio/video media streaming. Elixir acts as the control plane (signaling to establish connections), while C++ does the media transport, running across 1000+ nodes.

**Cloud**: Google Cloud Platform (GCP).

#### Message Storage — The Database Evolution
Discord's message storage story is one of the most instructive database migration case studies available:

**Phase 1 — MongoDB (2015)**: Discord started with a single MongoDB replica. By November 2015, with 100 million messages, data and indexes exceeded available RAM, causing unpredictable latency.

**Phase 2 — Cassandra (2017–2022)**: Migrated to Apache Cassandra for its distributed, write-optimized architecture. Grew from 12 nodes to 177 nodes storing trillions of messages by 2022. But problems emerged: Cassandra's LSM tree structure makes reads more expensive than writes; concurrent reads on large servers caused hot partitions; SSTable compaction degraded performance; and Java garbage collection pauses caused catastrophic latency spikes (40–125ms p99 read latency, 5–70ms p99 write latency). GC pauses were a huge source of on-call toil.

**Phase 3 — ScyllaDB (2022–present)**: Migrated to ScyllaDB, a Cassandra-compatible database written in C++ (no garbage collector). ScyllaDB uses a shard-per-core architecture that assigns each CPU core its own subset of data. Results after migration: cluster shrank from 177 nodes to 72 nodes (each with 9TB vs 4TB of disk). P99 read latency dropped to a steady 15ms (from 40–125ms). P99 write latency dropped to 5ms (from 5–70ms). The migration itself was done with a Rust-based data migrator that sent 3.2 million records per second, completing in 9 days.

#### The Data Services Layer — Rust as a Shield
Between the API monolith and the database, Discord introduced a **data services layer written in Rust**. This layer provides:

- **Request coalescing**: When hundreds of users request the same data simultaneously (e.g., everyone loading the same large server), the data service combines these into a single database query and fans out the result. This eliminates hot partition problems.
- **Consistent routing**: Requests for the same data always go to the same data service instance, maximizing cache hits.
- **Database shielding**: The API never talks directly to the database — the data service handles all query patterns, retries, and rate limiting.

#### Real-Time Architecture — How Messages Flow
Discord uses a concept of **guilds** (servers). Each guild has a dedicated Elixir process. When a message is sent:

1. The message arrives at the API (Python) via HTTP POST or WebSocket.
2. The API persists the message to ScyllaDB.
3. The guild's Elixir process receives the event and fans it out to all connected session processes.
4. Each online user has their own Elixir session process, which pushes the update over WebSocket to the client.

For the gateway, every client maintains a persistent WebSocket connection. Discord delivers 26+ million WebSocket events per second across all servers. Elixir services communicate between each other using Distributed Erlang.

**The 15-million member problem**: When MidJourney's server grew beyond 1 million concurrent users, Discord hit the limits of what a single Elixir guild process could handle — distributing messages to more users creates exponentially more work. They solved this with optimizations like only sending member list updates for the visible portion of the list (not all 15 million members), using the Rust-backed sorted sets for efficient member tracking.

#### What This Implies for RTS
- **Elixir/BEAM is purpose-built for real-time fan-out.** If RTS needs to push live operational state updates to thousands of connected executives and workers simultaneously, Elixir is worth serious consideration. Five engineers maintaining 20+ services and millions of concurrent users is an extraordinary leverage ratio.
- **Introduce a data services layer between your API and database.** Request coalescing alone can prevent the "hot tenant" problem where a large enterprise customer's activity creates database hot spots.
- **Don't fight garbage collection — avoid it.** Discord's move from JVM-based Cassandra to C++-based ScyllaDB eliminated their biggest source of on-call incidents. For RTS, prefer databases and runtimes without GC-related latency spikes.
- **Rust is the performance escape hatch.** When your primary language (Elixir, Python, Node) hits performance limits on specific data structures or I/O patterns, Rust can be surgically applied to those hot paths without rewriting everything.
- **Start with the simplest database, then migrate when forced.** MongoDB → Cassandra → ScyllaDB. Each migration happened because the previous system was genuinely failing at the new scale, not preemptively. For RTS MVP, Postgres is the right start.

---

### Superhuman — 100ms Rule and Perceived Speed

#### Core Idea
Superhuman applies the **100ms rule**: every interaction should complete in under 100 milliseconds so the product feels instantaneous. The idea is attributed to Paul Buchheit (Gmail creator).

#### How Superhuman Achieves This
Superhuman's approach combines two disciplines:

1. **Continuous performance measurement** — instrument the product, track latency metrics, and identify bottlenecks quickly.
2. **System + UX latency reduction** — apply technical best practices (e.g., local storage and caching) and interaction design choices that reduce navigation time and mental overhead.

A common question is how Superhuman can feel faster than Gmail while using the same underlying Gmail APIs. The key point is that Superhuman stores useful data locally and serves UI state from cache when possible, which can keep interactions feeling fast (including some offline scenarios) even if network calls are slow.

The business case is framed around cumulative time cost: many professionals spend roughly three hours per day in email, and Superhuman reports users saving meaningful time each week.

#### What This Implies for RTS
- **Adopt a hard interaction budget:** treat 100ms as the default target for high-frequency UI actions (open task, switch view, assign owner, update status).
- **Instrument first, optimize second:** define p50/p95/p99 latency SLOs per core workflow before feature expansion.
- **Local cache for perceived speed:** keep hot operational context (recent tasks, owners, blockers, priorities) locally available so the command view remains responsive during network jitter.
- **Speed is product strategy:** for RTS, speed should not be a polish step; it should be a core requirement tied to operator throughput and decision quality.
- **Design around time saved:** measure and communicate workflow time savings as a core product KPI.

---

### Figma — Deep Architecture Breakdown

#### Background and What Figma Is
Figma is a browser-based collaborative design tool where multiple people can simultaneously edit the same design file in real time — think Google Docs for design. It runs primarily on AWS, with over 4 million active users. Figma is relevant to RTS because it has two separate real-time sync systems solving different problems, and its approach to scaling Postgres is directly applicable.

#### The Tech Stack
- **Frontend**: React with Redux, running a WebAssembly (WASM) rendering engine compiled from C++/Rust for the design canvas. The WASM engine handles vector graphics rendering at 60fps.
- **Backend**: Ruby (original), with increasing Rust and TypeScript. The multiplayer server is written in Rust.
- **Database**: Amazon RDS PostgreSQL — Figma was one of AWS's largest database customers. They relied on a single Postgres instance for years before sharding.
- **Real-time**: WebSockets for both multiplayer file editing and LiveGraph data subscriptions.
- **Storage**: DynamoDB for the multiplayer write-ahead log. S3 for file storage.
- **Streaming**: Kafka for distributing database change events.
- **Cloud**: AWS.

#### Two Separate Sync Systems
This is the key architectural insight from Figma — they have **two completely different real-time systems** for different use cases:

**1. Multiplayer (Document Editing Sync)**
This handles real-time collaborative editing of design files. It uses a client/server architecture where each open document gets its own dedicated server process. The server holds the file state in memory, receives edits from connected clients at ~30fps, resolves conflicts, and broadcasts updates. Figma's approach to conflict resolution is inspired by CRDTs but doesn't use a pure CRDT implementation. The document is modeled as a two-level map: `Map<ObjectID, Map<Property, Value>>`. Last-writer-wins is used at the property level — if two users edit different properties of the same object simultaneously, both edits are preserved. If they edit the same property, the last write wins, ordered by the server.

The multiplayer server checkpoints the file to storage every 30–60 seconds and uses a write-ahead log (backed by DynamoDB) to ensure no edits are lost between checkpoints. For offline support, when a client reconnects, it downloads a fresh copy and reapplies any offline edits.

**2. LiveGraph (Metadata/Application Data Sync)**
This handles real-time sync for everything *outside* the document — comments, users, teams, projects, permissions, file metadata. LiveGraph is a data-fetching layer built on top of Postgres that lets frontend code subscribe to GraphQL-like queries and receive live updates when the underlying data changes.

LiveGraph works by subscribing to the Postgres write-ahead log (WAL) via Kafka. When a database write happens, the WAL event flows through Kafka to LiveGraph's invalidator services, which determine which active subscriptions are affected. The results are pushed to clients via WebSocket.

The system evolved significantly ("LiveGraph 100x" project): client sessions tripled since 2021, view requests grew 5x in one year. They decomposed it into independently scalable services — edge servers (handling client connections), cache services (query result caching), and invalidator services (processing WAL events). They introduced cache sharding and invalidator sharding as the database team added horizontal and vertical Postgres shards.

#### Postgres Scaling — Vertical Partitioning (Not Horizontal Sharding)
Figma's approach to Postgres scaling was different from Notion's. Instead of horizontal sharding (splitting the same table across many databases), Figma used **vertical partitioning** — putting different tables on different database servers based on workload isolation. They sampled `pg_stat_activity` at 10ms intervals to identify CPU waits by table, then moved the heaviest, most isolated tables to their own database servers. This avoided the application-level complexity of shard-aware queries while distributing load. The 18-month database upgrade left Figma "theoretically infinitely scalable" according to their VP of Engineering.

#### What This Implies for RTS
- **Separate your document sync from your metadata sync.** Figma uses two completely different systems for editing documents vs. syncing application metadata. For RTS, the real-time operational state rendering (dashboards, task status) might need a different sync mechanism than the messaging/communication layer.
- **LiveGraph's WAL-based approach is powerful for RTS.** Subscribing to the Postgres WAL via Kafka and pushing changes to client subscriptions is exactly how an RTS executive command view could work — subscribe to a query like "show me all critical tasks with missed deadlines" and get live updates whenever the underlying data changes, without polling.
- **Vertical partitioning before horizontal sharding.** If your tables are relatively independent (messages vs. tasks vs. users), put them on different database servers before doing complex horizontal sharding. This is simpler and may buy enough time.
- **WebAssembly for compute-heavy client rendering.** If RTS eventually needs complex real-time visualizations (3D operational state rendering as described in the RTS concept), WASM compiled from Rust/C++ is how Figma achieves 60fps canvas performance in a browser.

---

### Datadog — Deep Architecture Breakdown

#### Background and What Datadog Is
Datadog is a cloud observability and security platform that ingests, stores, and queries metrics, logs, traces, and events at massive scale — trillions of data points per day from thousands of enterprise customers. Datadog went public in 2019 (valued at $8.7B), was added to the S&P 500 in July 2025, and has ~6,500 employees across 33 countries. It is directly relevant to RTS because Datadog is essentially "RTS for infrastructure" — a real-time operational dashboard that ingests signals from everywhere, processes them, and surfaces alerts and visualizations. The architectural patterns are almost exactly what RTS needs.

#### The Tech Stack
- **Agent**: A Go-based agent (rewritten from Python in v6.0, 2018) installed on customer infrastructure to collect telemetry.
- **Backend**: Built using open and closed source technologies including PostgreSQL, Apache Cassandra, Kafka, and their custom storage engines.
- **Storage**: Three generations of storage systems — culminating in **Husky**, their third-gen event store, which decouples storage and compute.
- **Streaming**: Apache Kafka as the backbone for event ingestion and data movement.
- **Orchestration**: Temporal for automated pipeline provisioning.
- **Data Movement**: Debezium CDC (Change Data Capture) with Kafka Connect for data replication.
- **Additional**: FoundationDB for exactly-once deduplication, Spark for batch processing, ClickHouse for trace storage.

#### Multi-Tenant Ingestion Architecture (Husky)
Datadog's most architecturally interesting system is their ingestion pipeline for Husky:

**Shard Router**: The incoming stream of events is split into **shards per tenant**. Unlike typical routing where one tenant maps to one shard, Datadog allocates a *list of shards* to each tenant, then deterministically routes each event to a shard from that list based on event ID and timestamp. This ensures events are evenly distributed while keeping tenant data co-located enough for efficient deduplication.

**Autosharder**: Continuously monitors per-tenant throughput metrics and dynamically adjusts shard counts. If a tenant's traffic doubles, the autosharder adds more shards. Cost is measured in bytes ingested (not event count) since events vary dramatically in size.

**Write Workers**: Stateless workers that consume events from shards and persist them to Husky's storage engine. Because they're stateless, they can auto-scale and load-balance freely. Exactly-once semantics are ensured by inserting event IDs into FoundationDB in the same transaction as event metadata.

**Key design principle**: Each pipeline runs on its own isolated cluster rather than sharing a giant Hadoop cluster. This prevents noisy-neighbor problems and makes capacity planning per-pipeline.

#### Data Replication Platform
Datadog recently built an internal data replication platform that started as a fix for one slow search page and evolved into company-wide infrastructure:

- **CDC with Debezium**: Captures changes from Postgres WAL and publishes them to Kafka.
- **Kafka Connect**: Backbone for ingestion, with single-message transforms giving teams control over data shape.
- **Temporal**: Orchestrates pipeline provisioning — teams request a pipeline through the platform, and Temporal handles setup, monitoring, and error recovery automatically.
- **Schema Registry**: Multi-tenant Kafka Schema Registry configured for backward compatibility, preventing schema migration breakdowns.
- **Use cases expanded**: Postgres-to-Postgres replication (unwinding their monolithic database), Postgres-to-Iceberg (analytics), Cassandra replication, cross-region Kafka replication.

The platform moved search workloads off Postgres, reducing latency by up to 87%. The key lesson: stop forcing a database to do something it wasn't designed for (Postgres for full-text search) and replicate the data to the right system.

#### Batch Data Pipelines
Datadog processes trillions of data points daily through Spark batch jobs. Their reliability approach: each pipeline runs on its own cluster (no shared resources), all clusters are tagged and monitored via Datadog itself, custom metrics are emitted at each pipeline stage, and a lag-checking task runs every 5 minutes to report how fresh the data in S3 is.

#### What This Implies for RTS
- **RTS is essentially Datadog for business operations.** The architectural pattern — ingest signals from many sources, process them through multi-tenant pipelines, store them in optimized formats, query them for dashboards and alerts — is the same. Study Datadog's architecture as a direct blueprint.
- **Per-tenant shard routing with dynamic auto-scaling is the right multi-tenant ingestion pattern.** Datadog's Shard Router + Autosharder design handles the "hot tenant" problem (one large enterprise generating 100x the traffic of small customers) elegantly. RTS will face the same problem.
- **Build a data replication platform, not individual pipelines.** Datadog's evolution from one-off fixes to a managed platform for data movement is the mature pattern. RTS will eventually need to move data from the operational store to search indexes, analytics warehouses, AI context stores, and executive dashboards.
- **Exactly-once semantics matter for billing and alerting.** Duplicate events cause false positives in alerts and skew usage reporting. For RTS, where events drive task assignments, SLA tracking, and executive dashboards, deduplication must be built into the ingestion pipeline.
- **Decouple storage and compute.** Husky's architecture allows scaling query capacity independently of storage capacity. For RTS, this means the executive command view (query-heavy) can scale independently of the event ingestion layer (write-heavy).

---

### Notion — Deep Architecture Breakdown

#### Background and What Notion Is
Notion is an all-in-one workspace for notes, documents, databases, wikis, and project management. Everything in Notion is a "block" — a paragraph, a database row, an image, a toggle, a page. This uniform block-based data model is both Notion's product strength and its primary infrastructure challenge, because the blocks table became astronomically large. Notion is relevant to RTS because it's the clearest example of a startup going from a single Postgres database to a massively sharded architecture while maintaining product velocity, and their block-based data model is conceptually similar to how RTS might model operational entities.

#### The Tech Stack
- **Backend**: Node.js/TypeScript.
- **Database**: PostgreSQL on Amazon RDS — the entire product ran on a single Postgres instance for five years.
- **Data Lake**: Debezium CDC → Kafka → Apache Hudi → S3 → Snowflake (for analytics/ML).
- **Search**: Migrated from Postgres full-text search to Elasticsearch as block count grew into billions.
- **Real-time**: WebSocket-based collaboration engine for live editing.
- **Cloud**: AWS.

#### The Postgres Sharding Story
This is Notion's most important engineering story:

**The crisis (mid-2020)**: Notion's single Postgres instance was failing. The VACUUM process (which reclaims disk space from deleted rows) kept stalling. Transaction ID (TXID) wraparound was approaching — a Postgres safety mechanism that *stops all writes* to prevent data corruption. This was existential: if TXID wraparound hit, the entire product goes down.

**Phase 1 — Initial sharding (2021)**: They chose **workspace ID** as the shard key (all blocks within a workspace co-locate on the same shard). They created 480 logical shards across 32 physical databases (15 shards per database). Why 480? Because it's divisible by many numbers (2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 30, 32, 40, 48, etc.), giving maximum flexibility for future redistribution.

Migration used a double-write strategy: all new writes went to both old and new databases simultaneously. Historical data was backfilled using a script running on a 96-CPU AWS instance (took 3 days). Verification was done via random UUID sampling and "dark reads" (fetching from both databases and comparing results without affecting users). Final switchover took only a few minutes of downtime.

**Phase 2 — Re-sharding (2023)**: As growth continued, the 32 physical databases were again straining. They re-sharded from 32 to 96 physical databases (5 logical shards each, maintaining the 480 total). This time they used Postgres logical replication to copy data — they set up 3 publications per existing database, each covering 5 schemas, and created subscriptions on new databases. Key learning: skipping index creation during the copy and rebuilding indexes afterward reduced sync time from 3 days to 12 hours. The re-shard was done with zero downtime. CPU and IOPS utilization dropped from 90% to ~20% at peak traffic.

#### Data Lake Architecture
As the database grew, running analytics against production Postgres became unsustainable. Notion built a data lake:

- One Debezium CDC connector per Postgres host, deployed on AWS EKS.
- One Kafka topic per Postgres table (all 480 shards write to the same topic per table).
- Apache Hudi Deltastreamer consumes Kafka and replicates to S3 in Hudi table format (chosen over Iceberg/Delta Lake for better performance with update-heavy workloads).
- Data flows from S3 to Snowflake for analytics and ML.

This replaced 480 Fivetran connectors that were previously syncing each shard to Snowflake individually. The migration saved over $1 million per year and reduced end-to-end ingestion time from over a day to minutes.

#### The Block Data Model
Everything in Notion is a block. All blocks share the same schema on the backend. A page is a block. A paragraph is a block. A database row is a block. This means one table (the blocks table) contains essentially all user content — making it the largest and most critical table. The workspace ID shard key ensures all blocks within a workspace live on the same shard, avoiding cross-shard queries for typical user operations.

#### What This Implies for RTS
- **Shard by workspace/tenant ID from the start.** Notion's choice of workspace ID as the shard key worked because users primarily operate within one workspace. For RTS, `tenant_id` (company) is the natural shard key since all operational data for a company should co-locate.
- **Choose a shard count that's highly divisible.** 480 = 2^5 × 3 × 5. This gave Notion flexibility to redistribute shards across 24, 32, 40, 48, 60, 80, 96, or 120 physical databases without reshuffling data between logical shards. For RTS, pick a similar number when the time comes.
- **Don't wait until TXID wraparound to shard.** Notion's team explicitly said they should have sharded earlier. The longer you wait, the more constrained your migration options become because the database is already under heavy load.
- **Postgres logical replication is a powerful migration tool.** For re-sharding, Notion used built-in Postgres logical replication rather than custom scripts. Skip index creation during the copy phase — this alone gave them a 6x speedup.
- **Build a proper data lake when analytics contends with production.** Debezium CDC → Kafka → Hudi → S3 → Snowflake is the modern pattern. For RTS, this pipeline would power executive analytics, agent context, and operational reporting without touching the production database.

---

### Monday.com — Deep Architecture Breakdown

#### Background and What Monday.com Is
Monday.com is a work operating system (Work OS) used by over 225,000 organizations for project management, CRM, software development, and operational workflows. The platform experienced 3x annual customer growth, forcing constant infrastructure evolution. Monday.com is relevant to RTS because they built a custom database engine (mondayDB), implemented multi-regional architecture, and are actively moving to cell-based architecture — all patterns RTS will eventually need.

#### The Tech Stack
- **Backend**: Node.js/TypeScript microservices running on Kubernetes (EKS).
- **Database**: MySQL/RDS (primary OLTP), plus NoSQL databases.
- **Custom Engine**: mondayDB — a hybrid row/columnar data engine built in JavaScript.
- **Infrastructure**: AWS with Terraform (migrating to CDKTF for infrastructure-as-code), SQS, S3, Redis.
- **Observability**: OpenTelemetry for tracing, with custom ClickHouse-based trace storage.
- **Networking**: Ambassador (Envoy-based) API gateway for request routing.
- **CI/CD**: Custom in-house tools (Ensemble for Terraform, Conductor for release trains).

#### mondayDB — The Custom Data Engine
Monday.com's most significant technical investment is mondayDB, a custom data engine designed for their specific workload:

**The problem**: Monday.com's "boards" (the core UI entity) were originally rendered entirely client-side. The client downloaded all board data and did filtering, sorting, and aggregation in the browser. This worked up to ~20,000 items, then the browser crashed. They needed to move computation server-side without losing the instant feel.

**The architecture**: mondayDB stores board data in **both row-oriented and columnar formats simultaneously**. When a query comes in, the engine chooses which format to use based on the operation — row-based for point lookups and updates, columnar for aggregations, filters, and sorts across columns. This hybrid approach gives high throughput and low latency for any combination of queries.

**Key properties**: Schemaless (any data type can be stored, retrieved, and queried), real-time updates (changes are immediately queryable for automations and integrations), and the engine runs all the way through in JavaScript (shared filter/sort/aggregation logic between client and server). The team has discussed potentially moving hot paths to Rust or DuckDB for performance.

**Results**: Board load times for large boards improved dramatically. Boards now support far more items than the previous ~20,000 limit.

#### Multi-Regional Architecture
Monday.com built multi-regional infrastructure with key design principles:

- **Each region is independent**: equipped with all core infrastructure to function autonomously. Downtime in one region doesn't affect others.
- **Users can access regions directly**: for requests to a user's own subdomain, traffic goes directly to their data region.
- **Authentication is global**: auth metadata is replicated in real-time across all regions, so any request with a valid token can enter from any region and be verified at the edge.
- **Vendor-neutral routing**: They explicitly avoided chaining their routing to a single network provider (like Cloudflare). They wanted each region to be independently replicable.

Routing is handled by Ambassador (Envoy-based API gateway) on Kubernetes. When a request arrives, Ambassador evaluates routing rules to determine if the request should be proxied to a different region. If the request is in the wrong region, Ambassador proxies it to the correct region's Ambassador node.

#### Cell-Based Architecture (In Progress)
Monday.com is moving to a cell-based architecture where each set of customer accounts gets its own isolated environment with dedicated infrastructure. This is similar to Slack's cellular architecture and Okta's cell-based approach. Their CDKTF infrastructure treats each cell as a parameterized deployment — cluster configurations include type, environment, region, and cell, with each cluster getting its own Terraform state file.

#### Quarterly Scale Review Process
Monday.com runs a structured quarterly process:
1. **Database review**: Analyze slow queries, connection counts, CPU utilization, replication lag. Decide whether to optimize queries, add caching, move to read replicas, or create additional replicas.
2. **NoSQL review**: Same analysis for their NoSQL databases.
3. **Product review**: Look at feature-level growth trends (e.g., board loads over time, automation executions — which grew from 0 to 3M/day in one year). Assess what new features will impact scale.
4. Output: Clear infrastructure roadmap for the next quarter.

This proactive approach — reviewing scale trends before they become crises — prevented reactive firefighting.

#### What This Implies for RTS
- **A hybrid row/columnar data engine is how you make dashboards instant.** Monday.com's mondayDB uses row format for writes and point lookups, columnar format for aggregations and filters. For RTS executive command views that need to filter, sort, and aggregate across thousands of tasks/events, this hybrid pattern is worth studying.
- **Multi-regional architecture should be vendor-neutral and independently replicable.** Monday.com explicitly designed their regions to function without dependence on a single network provider. Each new region is a parameterized deployment of the same stack. This is the same principle as Linear's approach.
- **Cell-based architecture is the end-state for enterprise multi-tenancy.** Monday.com, Slack, and Okta have all converged on this pattern — isolated infrastructure per customer group. For RTS at enterprise scale, plan for cells even if you start with shared infrastructure.
- **Run quarterly scale reviews.** A structured process for reviewing database growth trends, product feature impact, and infrastructure readiness prevents the "everything is on fire" mode. For a startup building RTS, institute this early — even with a tiny team, spending 2 hours per quarter on scale trends pays dividends.
- **Move client-side computation to server-side before it breaks.** Monday.com's board rendering crashed at 20K items because all computation was client-side. For RTS, if the operational dashboard does any filtering/aggregation, do it server-side (or in a hybrid engine) from the start rather than sending all data to the browser.

---
