"""
ShelfTag — Storage Service
======================
Microservice responsible for storing product images and returning accessible URLs.

LOCAL PROTOTYPE: Saves images to disk and serves them via the FastAPI static files.
PRODUCTION: This will be replaced with Cloudflare R2 (S3-compatible object storage).

The key contract this service fulfills:
  - Accept a base64-encoded image
  - Store it somewhere accessible via URL
  - Return that URL so Airtable can download and store its own copy

Production notes:
  - R2 presigned URLs are preferred (expire after ~1 hour for security)
  - Zero egress fees on R2 means Airtable downloading images costs nothing
  - See Context.md for full R2 migration plan
"""

import base64
import uuid
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Local storage directory — only used in prototype
# In production, this is replaced by R2 bucket operations
UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


async def store_image(
    image_base64: str,
    base_url: str = "http://localhost:8000"
) -> dict:
    """
    Store a base64-encoded image and return an accessible URL.
    
    LOCAL PROTOTYPE: Saves to disk, returns localhost URL.
    PRODUCTION: Would upload to R2, return presigned URL.
    
    Args:
        image_base64: Base64-encoded JPEG image data (full resolution, no compression)
        base_url: The base URL where the backend is running (for constructing image URLs)
    
    Returns:
        dict with:
            - file_path: Local path to the saved image
            - url: Publicly accessible URL for the image
            - filename: Just the filename
    """
    
    # Generate a unique filename to avoid collisions
    filename = f"{uuid.uuid4().hex}.jpg"
    file_path = UPLOAD_DIR / filename
    
    # Decode base64 and write to disk
    try:
        image_bytes = base64.b64decode(image_base64)
        file_path.write_bytes(image_bytes)
        
        logger.info(f"Image saved: {filename} ({len(image_bytes) / 1024:.1f} KB)")
        
        # Construct the URL where this image can be accessed
        # In prototype: served by FastAPI's static file handler
        # In production: this would be an R2 presigned URL
        url = f"{base_url}/uploads/{filename}"
        
        return {
            "file_path": str(file_path),
            "url": url,
            "filename": filename
        }
    
    except Exception as e:
        logger.error(f"Failed to store image: {e}")
        raise Exception(f"Image storage failed: {e}")


async def delete_image(filename: str) -> bool:
    """
    Delete a stored image (cleanup after Airtable has downloaded its copy).
    
    Args:
        filename: The filename to delete
    
    Returns:
        True if deleted, False if not found
    """
    file_path = UPLOAD_DIR / filename
    if file_path.exists():
        file_path.unlink()
        logger.info(f"Deleted image: {filename}")
        return True
    return False
