"""
ShelfTag — Airtable Service
========================
Microservice responsible for creating records in the 180 Snacks Airtable.

This service:
1. Takes extracted product data (from Gemini) + metadata (from app) + image URL
2. Computes derived fields (RT/oz, currency notes)
3. Creates a new row in the "Store Visits Database" Airtable via REST API

Airtable API docs: https://airtable.com/developers/web/api/introduction

Authentication:
  - Uses a Personal Access Token (PAT) generated at airtable.com/create/tokens
  - Required scopes: data.records:write, data.records:read
  - PAT is stored as an environment variable, NEVER in frontend code

Known Airtable column quirks:
  - "IMage" is a typo (should be "Image") — team is aware, may fix later
  - "FX NW oz" currently duplicates "NW oz" data — team will clarify purpose
"""

import logging
import httpx
from typing import Optional
from models.schemas import GeminiExtractionResult, PhotoMetadata

logger = logging.getLogger(__name__)

# Airtable API base URL
AIRTABLE_API_URL = "https://api.airtable.com/v0"


def _compute_rt_oz(retail_regular: Optional[float], nw_oz: Optional[float]) -> Optional[float]:
    """
    Compute the retail price per ounce.
    
    RT/oz = Retail Regular / NW oz
    Returns None if either input is None or zero.
    """
    if retail_regular is not None and nw_oz is not None and nw_oz > 0:
        return round(retail_regular / nw_oz, 2)
    return None


def _detect_currency_from_coords(lat: Optional[float], lon: Optional[float]) -> Optional[str]:
    """
    Determine if coordinates are outside the US and return currency info.
    
    Uses a simple bounding box check for the continental US + Alaska + Hawaii.
    If outside, we'd need reverse geocoding for exact country/currency — 
    for the prototype, we just flag "International" and let the user fill in details.
    
    Production improvement: Use a reverse geocoding API to get country → currency code.
    """
    if lat is None or lon is None:
        return None
    
    # Continental US rough bounding box
    # Latitude: 24.5 (southern tip of FL) to 49.4 (northern border)
    # Longitude: -124.8 (western WA) to -66.9 (eastern ME)
    continental_us = (24.5 <= lat <= 49.4) and (-124.8 <= lon <= -66.9)
    
    # Alaska rough bounding box
    alaska = (51.0 <= lat <= 71.5) and (-180.0 <= lon <= -129.0)
    
    # Hawaii rough bounding box
    hawaii = (18.5 <= lat <= 22.5) and (-160.5 <= lon <= -154.5)
    
    if continental_us or alaska or hawaii:
        return None  # Inside US — leave Notes blank
    
    # Outside US — flag as international
    # In production, reverse geocode to get actual country + currency
    return f"International (lat: {lat:.2f}, lon: {lon:.2f}) — confirm currency"


async def create_record(
    extraction: GeminiExtractionResult,
    metadata: PhotoMetadata,
    image_url: str,
    airtable_pat: str,
    base_id: str,
    table_id: str,
) -> dict:
    """
    Create a new record in the Airtable Store Visits Database.
    
    Args:
        extraction: Product data extracted by Gemini Flash
        metadata: Photo metadata from the app (user, retailer, timestamp, geo)
        image_url: URL to the product image (R2 presigned URL in prod, localhost in prototype)
        airtable_pat: Airtable Personal Access Token
        base_id: Airtable Base ID (starts with 'app')
        table_id: Airtable Table ID (starts with 'tbl')
    
    Returns:
        dict with the created record ID and details
    
    Raises:
        Exception: If the Airtable API call fails
    """
    
    # ---- Compute derived fields ----
    rt_oz = _compute_rt_oz(extraction.retail_regular, extraction.nw_oz)
    currency_note = _detect_currency_from_coords(metadata.latitude, metadata.longitude)
    
    # ---- Build the Airtable record ----
    # Field names must EXACTLY match Airtable column headers
    fields = {}
    
    # LLM-extracted fields (only include if not None to avoid overwriting blanks)
    if extraction.flavor is not None:
        fields["Flavor"] = extraction.flavor
    if extraction.brand is not None:
        fields["Brand"] = extraction.brand
    if extraction.flavor_description is not None:
        fields["Flavor Description"] = extraction.flavor_description
    if extraction.count is not None:
        fields["Count"] = extraction.count
    if extraction.type is not None:
        fields["Type"] = extraction.type
    if extraction.nw_oz is not None:
        fields["NW oz"] = extraction.nw_oz
    if extraction.retail_regular is not None:
        fields["Retail Regular"] = extraction.retail_regular
    
    # Computed fields
    if rt_oz is not None:
        fields["RT/oz"] = rt_oz
    
    # FX NW oz — currently duplicates NW oz (team will clarify purpose)
    if extraction.nw_oz is not None:
        fields["FX NW oz"] = extraction.nw_oz
    
    # Metadata fields from the app
    fields["Date of Visit"] = metadata.timestamp.split(" ")[0]  # Just the date part: MM/DD/YYYY
    fields["Retailer"] = metadata.retailer
    
    # Image attachment — Airtable expects an array of objects with 'url' key
    # Airtable will download the image from this URL and store its own copy
    fields["IMage"] = [{"url": image_url}]  # NOTE: "IMage" is a typo in Airtable
    
    # Currency notes (only if outside US)
    if currency_note:
        fields["Notes"] = currency_note
    
    # ---- Send to Airtable API ----
    url = f"{AIRTABLE_API_URL}/{base_id}/{table_id}"
    
    headers = {
        "Authorization": f"Bearer {airtable_pat}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "records": [
            {
                "fields": fields
            }
        ]
    }
    
    logger.info(f"Creating Airtable record: {extraction.flavor} at {metadata.retailer}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, headers=headers, json=payload)
    
    if response.status_code != 200:
        error_detail = response.text
        logger.error(f"Airtable API error {response.status_code}: {error_detail}")
        raise Exception(f"Airtable API error {response.status_code}: {error_detail}")
    
    result = response.json()
    
    try:
        record_id = result["records"][0]["id"]
        logger.info(f"Airtable record created: {record_id}")
        return {
            "record_id": record_id,
            "fields": fields
        }
    except (KeyError, IndexError) as e:
        logger.error(f"Unexpected Airtable response format: {result}")
        raise Exception(f"Unexpected Airtable response: {e}")
