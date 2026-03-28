# Snap — 180 Snacks Product Photo Scanner

## Purpose of This Document

This is the single source of truth for the Snap project. It serves three audiences simultaneously:

1. **Field reps / office workers** — how to install, use, and troubleshoot the app (start at [User Manual](#user-manual))
2. **Engineers** — technical architecture, codebase walkthrough, how to run and extend the system (start at [Engineer Manual](#engineer-manual))
3. **LLM instances / future developers** — every architectural decision, why it was made, what was rejected and why, known quirks, and open items (the entire document, but especially [Architecture Decisions & Rationale](#architecture-decisions--rationale) and [Known Quirks & Edge Cases](#known-quirks--edge-cases))

**If you are an LLM picking up this project: read the entire document before making changes. Every architectural decision was made through deliberate discussion — don't change things without understanding why they were chosen.**

---

## Table of Contents

- [User Manual](#user-manual)
  - [What is Snap?](#what-is-snap)
  - [First-Time Setup](#first-time-setup)
  - [Daily Use](#daily-use)
  - [Tips & Troubleshooting](#tips--troubleshooting)
  - [How Updates Work](#how-updates-work)
- [Engineer Manual](#engineer-manual)
  - [The Business Problem](#the-business-problem)
  - [System Architecture](#system-architecture)
  - [Data Flow](#data-flow)
  - [Tech Stack](#tech-stack)
  - [Project Structure](#project-structure)
  - [Microservice Responsibilities](#microservice-responsibilities)
  - [Airtable Integration](#airtable-integration)
  - [Gemini Flash Extraction](#gemini-flash-extraction)
  - [Offline Architecture](#offline-architecture)
  - [Currency Detection via Geolocation](#currency-detection-via-geolocation)
  - [PWA Behavior & Distribution](#pwa-behavior--distribution)
  - [Security Rules](#security-rules)
  - [Prerequisites & Installation](#prerequisites--installation)
  - [Running the Prototype](#running-the-prototype)
  - [Phone Camera Access](#phone-camera-access)
  - [Production Migration Path](#production-migration-path)
- [Architecture Decisions & Rationale](#architecture-decisions--rationale)
  - [Why Gemini Flash (not Claude, GPT-4o, or open-source OCR)](#why-gemini-flash)
  - [Why Cloudflare (not Vercel, AWS, Supabase)](#why-cloudflare)
  - [Why No Image Compression](#why-no-image-compression)
  - [Why Vanilla JS (no React, no build step)](#why-vanilla-js)
  - [Why localStorage + IndexedDB (not browser cache)](#why-localstorage--indexeddb)
- [Known Quirks & Edge Cases](#known-quirks--edge-cases)
- [Open Items / TODOs](#open-items--todos)

---

# User Manual

## What is Snap?

Snap is a camera app on your phone that replaces manual data entry. Instead of writing down product names, prices, and weights and then typing them into Airtable later, you just take photos. Snap reads the photo, pulls out all the information, and puts it directly into Airtable for you.

## First-Time Setup

This takes about 5 minutes.

**1. Open the link on your phone.** You'll receive a URL or QR code from your manager (something like `snap.180snacks.com` or a localhost link for testing).

**2. Allow camera access.** When the app asks for camera permission, tap "Allow." This is required — the whole app is a camera.

**3. Allow location access (optional).** If prompted for location, tap "Allow." This helps the app detect when you're shopping internationally so it can note the local currency. The app works fine without it.

**4. Add to your Home Screen:**
- **iPhone:** Tap the Share button (square with arrow) → scroll down → tap "Add to Home Screen" → tap "Add"
- **Android:** Chrome will show a banner saying "Add Snap to Home Screen" → tap "Install"
- Now you have a Snap icon on your home screen that opens like a regular app

**5. Enter your name.** Tap the small box in the bottom-right corner of the camera view. Type your name in the "Name" field.

**6. Enter the retailer.** In the same box, type the store name (e.g., "Walmart", "Costco", "Marshalls").

**7. You're done.** Your name and retailer are saved automatically. Next time you open the app, they'll still be there.

## Daily Use

1. **Open Snap** from your home screen.
2. **Update the retailer name** if you're at a different store than last time. Your name stays the same — just change the retailer.
3. **Point your phone at a product** on the shelf. Make sure you can see the product name and brand on the package, the price tag on the shelf below or beside it, and the weight/size on the package.
4. **Tap the white shutter button** to take the photo. You'll see a brief flash — that means it worked.
5. **Keep going.** Take photos of as many products as you need. Each photo is saved automatically.
6. **Photos sync automatically.** When your phone has a good connection (Wi-Fi or cell signal), photos upload in the background. The red number badge in the top-right shows how many photos are waiting to upload. When it disappears, everything is synced.
7. **Check Airtable.** Within a few minutes of syncing, new rows appear in the Store Visits Database with all the product data filled in automatically.

## Tips & Troubleshooting

**Bad signal in a store?** No problem. Photos are saved on your phone and will upload as soon as you get signal again — even if you close the app.

**Changing retailers?** Just tap the retailer name in the bottom-right box and type the new store name.

**Red badge won't go away?** Make sure you have a good internet connection. The badge shows how many photos are still waiting to upload. If it persists, check that the backend server is running (for prototype testing).

**Camera shows black screen?** Make sure you allowed camera permission. Check that no other app is using the camera. On iPhone, make sure you're using Safari (Chrome on iOS has limited camera API support for PWAs).

**"Camera permission denied" error?** Go to your phone's Settings → Browser → Camera and enable access. Or clear the site data and reload.

**App not opening?** Try opening the URL in your browser again and re-adding to your home screen.

**Airtable shows no new rows?** Check the terminal logs for error messages. Verify your `.env` file has valid API keys with the correct scopes.

**App doesn't work offline?** The app must be loaded at least once with a good connection to cache files. After that first load, it works offline. If it still doesn't work, open DevTools → Application → Service Workers and verify the service worker is registered.

**Gemini returns null for fields?** The photo might not clearly show the product name, price tag, or weight. Make sure the photo includes both the product packaging and the shelf price tag. Hold the phone steady to avoid blur.

**App behaving oddly after an update?** Close it completely and reopen it. See below.

## How Updates Work

The app updates itself automatically. When the team pushes a new version, the next time you open Snap it will quietly download the update in the background. You don't need to do anything — no App Store, no update button.

If the app seems stuck on an old version: close it completely, reopen it, and wait a few seconds. If that doesn't work, clear the site data in your browser settings and reload from the URL. As a last resort, remove the home screen icon, revisit the URL, and re-add to home screen.

---

# Engineer Manual

## The Business Problem

180 Snacks is a medium-sized snack manufacturer that sells to Costco, TJX group, and similar retailers. To track competitor pricing, they send field reps to retail stores (Costco, Walmart, Marshalls, Aldi, Food4Less, etc.) to photograph competitor products and record data: product name, brand, price, weight, flavor description, packaging type. This data goes into an Airtable called "Store Visits Database" for competitive pricing analysis.

Currently this is 100% manual — reps take photos, then later sit down and type everything into Airtable by hand. Snap automates this: take a photo, AI extracts the data, row appears in Airtable automatically.

## System Architecture

```
Phone (PWA)                    Backend (FastAPI)               External APIs
─────────────                  ─────────────────               ─────────────
Camera capture                 storage_service.py
  ↓                              → stores image locally
IndexedDB queue                    (R2 in production)
  ↓ (when online)                  → returns URL
POST /api/sync                 gemini_service.py               → Google Gemini Flash
  ↓                              → sends image + prompt
                                   → gets structured JSON
                               airtable_service.py             → Airtable REST API
                                 → creates record with
                                   extracted fields +
                                   image URL + metadata
                               ─────────────────
                               main.py orchestrates
                               all three services
```

### UI Spec

- Fullscreen camera viewfinder (looks exactly like the native phone camera)
- Bottom-right corner: small semi-transparent box with two fields — user's name and retailer name
- These fields persist via localStorage (survive app close, phone restart, etc.)
- First time opening: fields are empty, user taps to type
- Subsequent opens: fields are pre-filled from last session
- Large circular shutter button centered at the bottom
- Red sync badge (top-right) shows count of photos waiting to upload
- Green/red connectivity dot (top-left) shows online/offline status
- Camera flash effect on capture for visual feedback
- Toast notification ("Photo captured!") on successful capture

## Data Flow

Step by step, what happens when a user takes a photo:

1. User takes photo → full resolution JPEG captured via `getUserMedia` API
2. Photo + metadata (user name, retailer, timestamp MM/DD/YYYY HH:MM, GPS coords) stored in IndexedDB
3. Sync module detects connectivity (`navigator.onLine` + backend health ping)
4. When online: POST `{ image_base64, metadata }` to `/api/sync`
5. Backend stores image locally → gets a URL
6. Backend sends image to Gemini Flash with extraction prompt → gets structured JSON
7. Backend computes `RT/oz = Retail Regular / NW oz`
8. Backend creates Airtable record via REST API with all fields + image URL
9. Airtable downloads the image from the URL and stores its own copy
10. Backend responds success → frontend marks photo as synced → deletes local copy from IndexedDB

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS PWA | No build step, no framework overhead, works offline |
| Backend (prototype) | FastAPI (Python) | Quick to prototype, async, serves frontend too |
| Backend (production) | Cloudflare Workers | Serverless, scales automatically, free tier |
| Image storage (prototype) | Local disk (`/uploads/`) | Simple for testing |
| Image storage (production) | Cloudflare R2 | Zero egress fees (critical since Airtable downloads each image) |
| AI extraction | Google Gemini 2.0 Flash | Cheapest reliable multimodal LLM (~$0.0001/photo) |
| Database | Airtable (existing) | Already in use by the team, REST API |
| Local persistence | localStorage + IndexedDB | Standard browser APIs, no dependencies |

## Project Structure

```
snap/
├── Context.md                    # Architecture decisions and notes
├── README.md                     # This document (or a version of it)
├── .gitignore
│
├── backend/
│   ├── .venv/                    # Python virtual environment (git-ignored, created during setup)
│   ├── .env                      # API keys (git-ignored, created from .env.example)
│   ├── requirements.txt          # fastapi, uvicorn, httpx, pydantic, python-dotenv
│   ├── main.py                   # FastAPI app: routes, CORS, static files, pipeline orchestration
│   ├── __init__.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py            # Pydantic models: SyncRequest, SyncResponse,GeminiExtractionResult
│   └── services/
│       ├── __init__.py
│       ├── gemini_service.py     # Gemini Flash API: image → structured JSON
│       ├── storage_service.py    # Image storage: local disk (R2 in production)
│       └── airtable_service.py   # Airtable API: create records, compute RT/oz, currency detection
│
├── docs/
│   └── LLM.md                    # Documentation
│
├── frontend/
│   ├── index.html                # Main PWA page (fullscreen camera UI)
│   ├── manifest.json             # PWA manifest (standalone mode, icons)
│   ├── sw.js                     # Service worker (offline caching, auto-updates)
│   ├── css/
│   │   └── styles.css            # Camera app styles (dark theme, native camera feel)
│   ├── js/
│   │   ├── app.js                # Main: init all modules, UI logic, event handlers
│   │   ├── camera.js             # getUserMedia, viewfinder, full-res photo capture
│   │   ├── storage.js            # IndexedDB (photo queue) + localStorage (user prefs)
│   │   ├── sync.js               # Sync queue: connectivity detection, sequential upload
│   │   └── geo.js                # Geolocation: watchPosition, getCurrentPosition
│   └── icons/
│       ├── icon-192.png          # PWA home screen icon
│       └── icon-512.png          # PWA splash screen icon
│
└── uploads/                      # Local image storage (prototype only, git-ignored)
```

## Microservice Responsibilities

| Service | File | Responsibility | External Dependency |
|---|---|---|---|
| Gemini Service | `backend/services/gemini_service.py` | Image → structured product data | Google Gemini Flash API |
| Storage Service | `backend/services/storage_service.py` | Image storage + URL generation | Local disk (R2 in production) |
| Airtable Service | `backend/services/airtable_service.py` | Record creation in Airtable | Airtable REST API |
| Orchestrator | `backend/main.py` | Routes, CORS, static files, pipeline | FastAPI |

## Airtable Integration

### Credentials

- **Personal Access Token (PAT):** generated at airtable.com/create/tokens
- **Required scopes:** `data.records:write`, `data.records:read`
- **Base ID:** `appb7454UmfsMhkaJ`
- **Table ID:** `tblytCTkc8gfNMWh8`
- All stored as environment variables in backend — NEVER in frontend code

### API

`POST https://api.airtable.com/v0/{baseId}/{tableId}` with Bearer token auth. Image attachments are passed as `[{"url": "..."}]` — Airtable downloads and stores its own copy. Field names in the JSON body must EXACTLY match Airtable column names.

### Column Mapping (confirmed from screenshots, left to right)

| Airtable Column | Source | Notes |
|---|---|---|
| **Flavor** | Gemini Flash | Product/flavor name (e.g. "Serenity Trail Mix") |
| **Date of Visit** | App metadata | MM/DD/YYYY format |
| **IMage** | R2 URL | Photo attachment. **KNOWN TYPO** — should be "Image". Team is aware and will fix. Code uses "IMage" to match current column name. |
| **Retailer** | App metadata | User-entered store name from the app |
| **Brand** | Gemini Flash | Manufacturer (e.g. "Southern Grove", "Power Up") |
| **Flavor Description** | Gemini Flash | Comma-separated ingredients from package front |
| **Count** | Gemini Flash | As printed on package (e.g. "16oz", "8ct 1.75oz") |
| **Type** | Gemini Flash | One of: "Single Bag", "Multi Box", "Multi Bag" — visual judgment |
| **NW oz** | Gemini Flash | Total net weight in ounces (number). For multi-packs: count × per-unit weight. |
| **Retail Regular** | Gemini Flash | Shelf price (number, no dollar sign) |
| **RT/oz** | Computed server-side | = Retail Regular / NW oz (rounded to 2 decimal places). If either value is null, RT/oz is null. |
| **Notes** | Auto or blank | Blank unless outside US → auto-populated with currency info via geolocation |
| **NW g** | Manual | User fills in Airtable (used for international products with gram-based weights) |
| **FX NW oz** | Duplicated from NW oz | **Currently duplicates NW oz data.** Team will clarify intended purpose. For now, code copies NW oz value into this column. |
| **Category** | Manual | User fills in Airtable |

## Gemini Flash Extraction

### API Details

- **Model:** `gemini-2.0-flash` (structured output mode)
- **Endpoint:** `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- **Auth:** API key as query parameter
- **Cost:** ~$0.10 input / $0.40 output per 1M tokens. One image ≈ 250–500 tokens + ~100 token prompt. Roughly **$0.0001 per photo** (50 photos ≈ half a penny).

### Key Configuration

- `response_mime_type: "application/json"` + JSON schema → forces structured output, guaranteed valid JSON, no parsing failures
- `temperature: 0.1` → consistent factual extraction, not creative
- Image sent as inline base64 data with `mime_type: "image/jpeg"`
- Model returns `null` for fields it can't determine (better than hallucinating)

### Extraction Prompt

Located in `backend/services/gemini_service.py`. Instructs the model to extract: flavor, brand, flavor_description, count, type, nw_oz, retail_regular. Handles multi-packs by computing total weight (count × per-unit weight). Picks the most prominent product if multiple are in frame. Uses regular price if both sale and regular are visible.

### JSON Schema (for structured output mode)

```json
{
  "type": "object",
  "properties": {
    "flavor": { "type": "string", "nullable": true },
    "brand": { "type": "string", "nullable": true },
    "flavor_description": { "type": "string", "nullable": true },
    "count": { "type": "string", "nullable": true },
    "type": { "type": "string", "nullable": true, "enum": ["Single Bag", "Multi Box", "Multi Bag"] },
    "nw_oz": { "type": "number", "nullable": true },
    "retail_regular": { "type": "number", "nullable": true }
  },
  "required": ["flavor", "brand", "flavor_description", "count", "type", "nw_oz", "retail_regular"]
}
```

### Edge Cases Requiring Prompt Iteration

These will surface during real-world testing with store photos:

- **Multi-packs:** Costco boxes containing 24 individual bags — LLM must compute total net weight across all bags, not just read one bag's label. This is the trickiest extraction task.
- **Partially obscured price tags:** common in cluttered shelf displays.
- **Multiple products in frame:** LLM must identify the primary/centered product.
- **International products with gram-only weights:** NW oz conversion needed, or leave for manual entry.
- **Sale price vs regular price:** LLM should use regular price when both are visible.
- **"Overview" rows in Airtable:** some existing rows (1, 6, 16) are section headers, not products. The app should not create these.

## Offline Architecture

The app is designed for stores with poor or no connectivity:

1. **Service worker** caches ALL app files on first load — app opens from local cache with zero network needed.
2. **IndexedDB** stores full-resolution photos + metadata locally. Capacity is typically GB-scale on modern phones.
3. **Sync module** monitors connectivity via `navigator.onLine` + backend health check ping.
4. When online, sync module drains the queue **sequentially** (one photo at a time to avoid overwhelming the backend).
5. If connectivity drops mid-sync, it stops and retries when signal returns.
6. A **30-second periodic retry** acts as a safety net.

## Currency Detection via Geolocation

- Geolocation API pings on app open + `watchPosition` for continuous updates
- Backend checks coordinates against US bounding boxes (continental + Alaska + Hawaii)
- If outside US: populates Airtable "Notes" column with `"International (lat: XX.XX, lon: YY.YY) — confirm currency"`
- **Production improvement:** integrate a reverse geocoding API (Google Maps or OpenCage) for exact country → currency mapping
- GPS can be flaky indoors — this is best-effort, app works fine without it
- No reliance on reading currency symbols from price tags (they often aren't there)

## PWA Behavior & Distribution

**Distribution:** No app store needed. Users visit the URL (e.g. `snap.180snacks.com`) in their phone browser and tap "Add to Home Screen." Can share via QR code.

**Session behavior:** Tapping the home screen icon reopens the same context, not a new tab. State is restored from localStorage/IndexedDB if the OS kills the process. The `manifest.json` uses `"display": "standalone"` mode.

**Updates:** Service worker caches all app files locally so the app works fully offline after first load. When code is updated on Cloudflare Pages (or the backend in prototype), the service worker detects the change on next app open and pulls new files silently. No user action needed.

## Security Rules

- API keys (Gemini, Airtable, R2) are ONLY stored in backend environment variables
- Frontend NEVER has direct access to any API key
- Phone only talks to the backend endpoint
- R2 presigned URLs expire after ~1 hour (just enough for Airtable to download the image)
- `.env` and `.venv/` are git-ignored; `.env.example` is committed as a template

## Prerequisites & Installation

### Software Requirements

| Software | Version | Purpose |
|---|---|---|
| Python | 3.10–3.13 (**not 3.14** — pydantic-core fails to build) | Backend server |
| pip | (bundled) | Package manager |
| Git | Any recent | Version control |
| Modern browser | Chrome/Safari/Firefox | Testing the PWA |

### API Keys Required

**1. Google Gemini Flash API Key**
- Go to aistudio.google.com/apikey
- Sign in with a Google account
- Click "Create API Key"
- Copy the key

**2. Airtable Personal Access Token (PAT)**
- Go to airtable.com/create/tokens
- Click "Create new token"
- Name it "Snap"
- Add scopes: `data.records:write` and `data.records:read`
- Under "Access", add the "Store Visits Database" base
- Click "Create token" and copy it

## Running the Prototype

### Step 1: Create a virtual environment (Python 3.13)

Python 3.14 is incompatible with pydantic-core. Use 3.13 explicitly:

**Windows:**
```bash
cd snap/backend
py -3.13 -m venv .venv
.\.venv\Scripts\activate
python --version              # Should show 3.13.x
```

**macOS / Linux:**
```bash
cd snap/backend
python3.13 -m venv .venv
source .venv/bin/activate
python --version              # Should show 3.13.x
```

### Step 2: Install dependencies and configure

```bash
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and fill in your actual keys:

```
GEMINI_API_KEY=your_actual_gemini_key_here
AIRTABLE_PAT=your_actual_airtable_pat_here
AIRTABLE_BASE_ID=appb7454UmfsMhkaJ
AIRTABLE_TABLE_ID=tblytCTkc8gfNMWh8
BASE_URL=http://localhost:8000
```

Start the server:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Open `http://localhost:8000` on your computer or `http://<your-local-ip>:8000` on your phone (same Wi-Fi network). (!! Look at Phone Camera Access section if camera doesn't work on phone)

### Testing

1. Allow camera access when prompted
2. Enter your name and a retailer name
3. Point the camera at a snack product and tap the shutter button
4. Watch the terminal for logs showing image stored → Gemini extraction → Airtable record created
5. Check Airtable — a new row should appear with all fields populated

## Phone Camera Access

Browsers require HTTPS for camera access (except localhost). For phone testing over LAN:

**Option A (easiest):** Chrome on phone → `chrome://flags` → search "Insecure origins treated as secure" → add your laptop's URL (e.g. `http://192.168.1.100:8000`).

**Option B (proper):** Use [mkcert](https://github.com/FiloSottile/mkcert) to create a local HTTPS certificate.

## Production Migration Path

| Prototype | Production |
|---|---|
| FastAPI on localhost | Cloudflare Worker |
| Images in `/uploads/` | Cloudflare R2 with presigned URLs |
| Frontend served by FastAPI | Cloudflare Pages (separate deployment) |
| `.env` file for secrets | Cloudflare Worker environment variables |
| Localhost URLs for images | R2 presigned URLs (expire after ~1 hour) |

### Cloudflare Pricing

Free tier covers this use case entirely: Pages (unlimited sites), Workers (100k requests/day), R2 (10GB storage, 10M reads/month, 1M writes/month, zero egress). If scaling: Workers Pro = $5/month for 10M requests, R2 beyond free = $0.015/GB/month storage. Zero egress on R2 is critical since Airtable downloads every image.

---

# Architecture Decisions & Rationale

This section exists so that future engineers and LLM instances understand *why* things are the way they are. These decisions were made through deliberate back-and-forth discussion and should not be changed without understanding the reasoning.

## Why Gemini Flash

**Rejected alternatives and why:**

- **Claude / GPT-4o:** More expensive for no quality gain on this specific task. The extraction is straightforward (read text off a package, identify a price tag) — it doesn't need frontier-model reasoning. Jonathan also pushed back on the initial recommendation of Claude Vision due to potential bias toward Anthropic's own products, which led to an open evaluation of all options.
- **Open-source OCR (Tesseract, PaddleOCR):** These only extract raw text. They cannot understand context — which text is the brand vs the flavor vs the ingredients. They cannot judge whether a product is a single bag or a multi-pack. They cannot identify which of several price tags belongs to which product. The extraction task requires multimodal understanding, not just character recognition.
- **Why Gemini Flash wins:** Multimodal (understands images natively), structured output mode (guaranteed valid JSON — no parsing failures), extremely cheap (~$0.0001/photo, 50 photos for half a penny). The structured output mode is the key differentiator — instead of hoping the model formats its response correctly, you tell the API "respond as JSON matching this exact schema" and Gemini enforces it at the model level.

## Why Cloudflare

**Rejected alternatives and why:**

- **Vercel / AWS / Supabase:** All charge egress fees. Since Airtable downloads every image from our storage, egress costs would add up. R2's zero egress is the deciding factor.
- **Why Cloudflare wins:** R2 has zero egress fees. Pages + Workers + R2 are all in one ecosystem. Free tier covers the entire use case. Simple to deploy and manage.

## Why No Image Compression

This was explicitly debated and decided:

- JPEG compression is lossy and irreversible — you cannot "decompress" a JPEG to get the original quality back. (Jonathan initially suggested compressing for upload then "decompressing" on the backend — this was clarified as not possible.)
- Accuracy of AI extraction is the priority. A lower-quality image risks the model misreading a price tag, misspelling a brand name, or failing to identify multi-pack details.
- Compression will ONLY be revisited if upload speeds become a real problem in practice.
- If revisited: an empirical quality sweep must be run first — test Gemini Flash extraction accuracy at various resolutions and JPEG quality levels before locking in any settings. Do NOT sacrifice extraction quality to save storage or bandwidth.

## Why Vanilla JS

No React, Vue, or any framework. No build step (no webpack, vite, etc.).

- The frontend is a camera viewfinder with two text fields, a button, and a sync badge. It doesn't need component libraries or state management.
- No build step means the service worker caches exactly what's on disk — no compilation artifacts, no source maps, no cache-busting complexity.
- Any engineer can read the code without knowing a framework.

## Why localStorage + IndexedDB

Jonathan initially asked why we don't just use "browser cache." The distinction:

- **Browser cache** is controlled by the browser's eviction policies — the browser can delete cached data whenever it needs space, and you can't store structured data in it. It's for HTTP response caching, not application state.
- **localStorage** is a simple key-value store that persists until explicitly cleared. Perfect for user preferences (name, retailer). Survives app close, phone restart, browser updates. ~5MB limit, which is fine for two text fields.
- **IndexedDB** is a full database in the browser. Stores structured data and binary blobs (like full-resolution photos). Capacity is typically GB-scale. Perfect for the offline photo queue.

---

# Known Quirks & Edge Cases

**Python 3.14 breaks pydantic-core:** As of this writing, `pydantic-core` (a compiled dependency of Pydantic, which FastAPI depends on) fails to build on Python 3.14. Always use Python 3.10–3.13. The project is developed and tested on 3.13.x. Use a venv (`py -3.13 -m venv .venv`) to isolate from any system-level 3.14 installation.

**"IMage" column typo:** The Airtable column is literally named "IMage" (capital M). The team is aware and will fix it. Until then, code uses "IMage" to match. When they rename it to "Image", the code must be updated in `airtable_service.py`.

**"FX NW oz" column purpose unknown:** Currently duplicates the NW oz value. The team will clarify what this column is actually for. Code copies NW oz into it for now.

**iPhone + Chrome PWA limitation:** Chrome on iOS has limited `getUserMedia` support for PWAs. Field reps using iPhones should use Safari.

**GPS indoors:** Geolocation can be flaky inside stores. Currency detection is best-effort — the app works fine without GPS. The primary use is simply detecting whether the user is outside the US.

**Airtable "overview" rows:** Some existing rows in the Airtable (rows 1, 6, 16 in screenshots) appear to be section headers, not product entries. The app should not create these — they're manually managed.

**Airtable image download timing:** When the backend creates a record with an image URL, Airtable asynchronously downloads the image. R2 presigned URLs are set to expire after ~1 hour, which is more than enough time for Airtable to fetch the image.

**Service worker update behavior:** When new code is deployed, the service worker detects changes on the next app open and downloads updated files. However, the new version doesn't activate until the user closes and reopens the app (this is standard service worker lifecycle behavior). If a user reports they're on an old version, tell them to fully close and reopen.

---

# Open Items / TODOs

- [ ] Airtable PAT generation (scopes: `data.records:write`, `data.records:read`)
- [ ] Gemini Flash API key (from Google AI Studio)
- [ ] Cloudflare account setup (for production deployment)
- [ ] Custom domain setup (e.g. `snap.180snacks.com`)
- [ ] Extraction prompt iteration with real store photos (especially multi-packs, obscured price tags)
- [ ] Image compression quality sweep (ONLY if upload speeds become a problem — run accuracy tests first)
- [ ] Reverse geocoding for exact country → currency mapping (production improvement)
- [ ] Clarify "FX NW oz" column purpose with the team
- [ ] Wait for team to rename "IMage" column to "Image", then update `airtable_service.py`
- [ ] Review 180 Snacks' Deacom contract for any restrictive automation clauses (low risk, but prudent)
