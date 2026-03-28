"""
ShelfTag — Backend API Server
==========================
FastAPI application that orchestrates the sync pipeline:
  Phone → Image Storage → Gemini Flash Extraction → Airtable Record Creation

LOCAL PROTOTYPE:
  - Serves the frontend PWA as static files
  - Stores images locally in /uploads directory
  - Connects to real Gemini Flash API and Airtable API

PRODUCTION (Cloudflare):
  - Frontend served by Cloudflare Pages (separate deployment)
  - This becomes a Cloudflare Worker
  - Images stored in R2 with presigned URLs
  - Same Gemini + Airtable integration

Run with: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from models.schemas import SyncRequest, SyncResponse
from services import gemini_service, airtable_service, storage_service

# ============================================================================
# CONFIGURATION
# ============================================================================

# Load environment variables from .env file
load_dotenv()

# Required API keys and IDs — stored in .env, NEVER hardcoded
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
AIRTABLE_PAT = os.getenv("AIRTABLE_PAT")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID", "appb7454UmfsMhkaJ")
AIRTABLE_TABLE_ID = os.getenv("AIRTABLE_TABLE_ID", "tblytCTkc8gfNMWh8")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger("shelftag")

# ============================================================================
# APP INITIALIZATION
# ============================================================================

app = FastAPI(
    title="ShelfTag — 180 Snacks",
    description="Product photo → structured data → Airtable pipeline",
    version="0.1.0"
)

# CORS — allow the frontend to talk to the backend
# In prototype: both run on localhost but potentially different ports
# In production: restrict to your actual domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict in production to shelftag.180snacks.com
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# STATIC FILE SERVING
# ============================================================================

# Serve uploaded images (so Airtable can download them)
uploads_dir = Path(__file__).parent.parent / "uploads"
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Serve frontend PWA files
frontend_dir = Path(__file__).parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="frontend")


@app.get("/")
async def serve_frontend():
    """Serve the main PWA page."""
    return FileResponse(str(frontend_dir / "index.html"))


@app.get("/manifest.json")
async def serve_manifest():
    """Serve the PWA manifest."""
    return FileResponse(str(frontend_dir / "manifest.json"), media_type="application/json")


@app.get("/sw.js")
async def serve_service_worker():
    """
    Serve the service worker from the root path.
    Service workers MUST be served from the root (or the scope they control).
    They cannot be served from a subdirectory like /static/sw.js.
    """
    return FileResponse(str(frontend_dir / "sw.js"), media_type="application/javascript")


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/api/health")
async def health_check():
    """
    Health check endpoint.
    The frontend uses this to determine if the backend is reachable (online detection).
    Returns the configuration status so you can verify API keys are loaded.
    """
    return {
        "status": "ok",
        "gemini_configured": GEMINI_API_KEY is not None,
        "airtable_configured": AIRTABLE_PAT is not None,
        "base_id": AIRTABLE_BASE_ID,
        "table_id": AIRTABLE_TABLE_ID,
    }


@app.post("/api/sync", response_model=SyncResponse)
async def sync_photo(request: SyncRequest):
    """
    Main sync endpoint — processes a single queued photo.
    
    Pipeline:
    1. Store the image locally (R2 in production)
    2. Send to Gemini Flash for structured data extraction
    3. Create an Airtable record with extracted data + metadata + image URL
    4. Return success with the extracted data
    
    The frontend calls this for each queued photo when connectivity is available.
    """
    
    # ---- Validate configuration ----
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured. Add it to your .env file.")
    if not AIRTABLE_PAT:
        raise HTTPException(status_code=500, detail="AIRTABLE_PAT not configured. Add it to your .env file.")
    
    try:
        # ---- Step 1: Store the image ----
        logger.info(f"Processing photo from {request.metadata.user_name} at {request.metadata.retailer}")
        
        storage_result = await storage_service.store_image(
            image_base64=request.image_base64,
            base_url=BASE_URL
        )
        image_url = storage_result["url"]
        logger.info(f"Image stored: {image_url}")
        
        # ---- Step 2: Extract product data with Gemini Flash ----
        extraction = await gemini_service.extract_product_data(
            image_base64=request.image_base64,
            api_key=GEMINI_API_KEY
        )
        logger.info(f"Extracted: {extraction.flavor} | {extraction.brand} | ${extraction.retail_regular}")
        
        # ---- Step 3: Create Airtable record ----
        airtable_result = await airtable_service.create_record(
            extraction=extraction,
            metadata=request.metadata,
            image_url=image_url,
            airtable_pat=AIRTABLE_PAT,
            base_id=AIRTABLE_BASE_ID,
            table_id=AIRTABLE_TABLE_ID,
        )
        logger.info(f"Airtable record created: {airtable_result['record_id']}")
        
        # ---- Return success ----
        return SyncResponse(
            success=True,
            airtable_record_id=airtable_result["record_id"],
            extracted_data=extraction
        )
    
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        return SyncResponse(
            success=False,
            error=str(e)
        )
