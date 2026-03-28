"""
ShelfTag — Data Models (Pydantic Schemas)
=====================================
Shared data models used across all microservices.
These schemas define the contract between frontend, backend services, and external APIs.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class PhotoMetadata(BaseModel):
    """
    Metadata sent alongside each photo from the frontend PWA.
    This data is NOT extracted by the LLM — it comes from the app itself.
    """
    user_name: str = Field(..., description="Name of the person taking the photo (from localStorage)")
    retailer: str = Field(..., description="Retail store name (from localStorage)")
    timestamp: str = Field(..., description="When the photo was taken, format: MM/DD/YYYY HH:MM")
    latitude: Optional[float] = Field(None, description="GPS latitude from phone geolocation")
    longitude: Optional[float] = Field(None, description="GPS longitude from phone geolocation")


class GeminiExtractionResult(BaseModel):
    """
    Structured output from Gemini Flash image analysis.
    These fields map directly to Airtable columns.
    
    The LLM extracts these by visually analyzing the product photo:
    - Reading the product packaging for name, brand, ingredients, weight
    - Reading the shelf price tag for retail price
    - Visually judging if it's a single unit or multi-pack (Type field)
    """
    flavor: Optional[str] = Field(None, description="Product/flavor name (e.g. 'Serenity Trail Mix')")
    brand: Optional[str] = Field(None, description="Brand/manufacturer (e.g. 'Southern Grove')")
    flavor_description: Optional[str] = Field(None, description="Comma-separated ingredients/flavors (e.g. 'Almonds, Walnuts, Raisins')")
    count: Optional[str] = Field(None, description="Weight/size as printed on package (e.g. '16oz', '8ct 1.75oz')")
    type: Optional[str] = Field(None, description="One of: 'Single Bag', 'Multi Box', 'Multi Bag'")
    nw_oz: Optional[float] = Field(None, description="Net weight in ounces as a number. For multi-packs, this is TOTAL weight.")
    retail_regular: Optional[float] = Field(None, description="Retail price from shelf tag as a number (e.g. 4.19)")


class AirtableRecord(BaseModel):
    """
    Complete record to be created in Airtable.
    Combines LLM extraction + app metadata + computed fields.
    
    Column names here must EXACTLY match the Airtable column headers.
    Note: 'IMage' is a known typo in the Airtable — the team is aware and may fix it.
    """
    # --- LLM-extracted fields ---
    Flavor: Optional[str] = None
    Brand: Optional[str] = None
    Flavor_Description: Optional[str] = Field(None, alias="Flavor Description")
    Count: Optional[str] = None
    Type: Optional[str] = None
    NW_oz: Optional[float] = Field(None, alias="NW oz")
    Retail_Regular: Optional[float] = Field(None, alias="Retail Regular")
    
    # --- Computed fields ---
    RT_oz: Optional[float] = Field(None, alias="RT/oz")
    FX_NW_oz: Optional[float] = Field(None, alias="FX NW oz")
    
    # --- Metadata fields (from app, not LLM) ---
    Date_of_Visit: Optional[str] = Field(None, alias="Date of Visit")
    Retailer: Optional[str] = None
    
    # --- Image attachment (R2 URL in production, local URL in prototype) ---
    IMage: Optional[list] = None  # NOTE: 'IMage' is a typo in Airtable. Team will fix to 'Image'.
    
    # --- Left blank by default ---
    Notes: Optional[str] = None  # Auto-populated with currency info if outside US
    # Category, NW g — left for manual entry in Airtable

    class Config:
        populate_by_name = True


class SyncRequest(BaseModel):
    """
    Request payload from the frontend when syncing a queued photo.
    Contains the base64-encoded image + all metadata.
    """
    image_base64: str = Field(..., description="Base64-encoded JPEG image data (full resolution, no compression)")
    metadata: PhotoMetadata


class SyncResponse(BaseModel):
    """
    Response sent back to the frontend after successful sync.
    """
    success: bool
    airtable_record_id: Optional[str] = None
    extracted_data: Optional[GeminiExtractionResult] = None
    error: Optional[str] = None
