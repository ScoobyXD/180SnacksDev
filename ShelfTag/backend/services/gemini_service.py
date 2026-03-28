"""
ShelfTag — Gemini Flash Extraction Service
=======================================
Microservice responsible for sending product photos to Google Gemini Flash
and receiving structured product data back.

This service:
1. Takes a base64-encoded image
2. Sends it to Gemini Flash with a carefully crafted extraction prompt
3. Uses JSON structured output mode to guarantee parseable responses
4. Returns a GeminiExtractionResult with all extracted fields

Cost: ~$0.0001 per photo (~$0.005 for 50 photos)
"""

import json
import logging
import httpx
from typing import Optional
from models.schemas import GeminiExtractionResult

logger = logging.getLogger(__name__)

# ============================================================================
# EXTRACTION PROMPT
# ============================================================================
# This prompt is the core of the data extraction pipeline.
# It tells Gemini Flash exactly what to look for in each product photo.
# 
# IMPORTANT: This prompt will need iteration as we test with real store photos.
# Known edge cases to handle:
#   - Multi-packs (e.g. Costco boxes with 24 individual bags)
#   - Partially obscured price tags
#   - Multiple products in frame (pick the centered/primary one)
#   - International products with weights in grams
#   - Price tags that show sale price AND regular price (we want regular)
# ============================================================================

EXTRACTION_PROMPT = """You are analyzing a photo of a snack product on a retail store shelf.
Your job is to extract specific product information from the packaging and price tag visible in the image.

Extract the following fields:

1. **flavor**: The product name or flavor name as written on the packaging (e.g. "Serenity Trail Mix", "Keto Chocolate Trail Mix", "Deluxe Mixed Nuts"). 
   - This is the specific product variant, NOT the brand name.

2. **brand**: The manufacturer or brand name (e.g. "Southern Grove", "Power Up", "Planters Nutrition", "Great Value").
   - Usually appears as a logo or prominent text on the package.

3. **flavor_description**: A comma-separated list of the key ingredients or flavors visible on the packaging.
   - Example: "Almonds, Walnuts, Raisins, Dried Cranberries, Hazelnuts, Pecans"
   - Look for ingredient callouts on the front of the package, NOT the nutrition facts panel.

4. **count**: The weight or size exactly as printed on the package (e.g. "16oz", "8ct 1.75oz", "1 LB 454g").
   - Copy this exactly as written on the package.

5. **type**: Classify the product packaging as ONE of these three options:
   - "Single Bag" — a single bag/pouch/container sold individually
   - "Multi Box" — a box containing multiple individual bags/pouches (common at Costco, warehouse stores)
   - "Multi Bag" — multiple bags bundled/wrapped together as one purchasable unit
   - Look at the physical packaging to determine this. If you see "8ct" or similar count indicators, it's likely Multi Box.

6. **nw_oz**: The total net weight in OUNCES as a decimal number.
   - For single items: just the weight in oz (convert from grams if needed: grams ÷ 28.3495)
   - For multi-packs: multiply count × per-unit weight (e.g. 8 × 1.75oz = 14.0)
   - Return as a number, not a string.

7. **retail_regular**: The regular retail price from the shelf tag or price label.
   - Look for the price tag on the shelf, NOT on the product packaging.
   - If both a sale price and regular price are shown, use the REGULAR price.
   - Return as a number without the dollar sign (e.g. 4.19, not "$4.19").

IMPORTANT RULES:
- If you cannot determine a field from the image, set it to null. Do NOT guess.
- If multiple products are visible, extract data for the product that is most prominent/centered in the image.
- Focus on the FRONT of the package and the SHELF PRICE TAG.
- For the price, look at price stickers, shelf labels, or digital price displays below/near the product.

Respond with valid JSON only."""


# JSON schema for Gemini's structured output mode.
# This forces the model to return exactly these fields in valid JSON format.
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "flavor": {"type": "string", "nullable": True},
        "brand": {"type": "string", "nullable": True},
        "flavor_description": {"type": "string", "nullable": True},
        "count": {"type": "string", "nullable": True},
        "type": {
            "type": "string",
            "nullable": True,
            "enum": ["Single Bag", "Multi Box", "Multi Bag"]
        },
        "nw_oz": {"type": "number", "nullable": True},
        "retail_regular": {"type": "number", "nullable": True},
    },
    "required": ["flavor", "brand", "flavor_description", "count", "type", "nw_oz", "retail_regular"]
}


async def extract_product_data(
    image_base64: str,
    api_key: str,
    model: str = "gemini-flash-lite-latest"
) -> GeminiExtractionResult:
    """
    Send a product photo to Gemini Flash and get structured extraction results.
    
    Args:
        image_base64: Base64-encoded JPEG image (full resolution)
        api_key: Google AI Studio API key
        model: Gemini model to use (default: gemini-flash-lite-latest)
    
    Returns:
        GeminiExtractionResult with extracted product data
    
    Raises:
        Exception: If the API call fails or returns unparseable data
    """
    
    # ---- Build the Gemini API request ----
    # We use the generateContent endpoint with inline image data
    # and structured output mode (response_mime_type: application/json)
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        # Send the image as inline base64 data
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": image_base64
                        }
                    },
                    {
                        # The extraction prompt telling the model what to look for
                        "text": EXTRACTION_PROMPT
                    }
                ]
            }
        ],
        "generationConfig": {
            # Force JSON output matching our schema — eliminates parsing failures
            "response_mime_type": "application/json",
            "response_schema": RESPONSE_SCHEMA,
            "temperature": 0.1,  # Low temperature for consistent, factual extraction
        }
    }
    
    # ---- Make the API call ----
    logger.info("Sending image to Gemini Flash for extraction...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            params={"key": api_key},
            json=payload
        )
    
    if response.status_code != 200:
        error_detail = response.text
        logger.error(f"Gemini API error {response.status_code}: {error_detail}")
        raise Exception(f"Gemini API error {response.status_code}: {error_detail}")
    
    # ---- Parse the structured response ----
    result = response.json()
    
    try:
        # The response text should be valid JSON thanks to structured output mode
        content_text = result["candidates"][0]["content"]["parts"][0]["text"]
        extracted = json.loads(content_text)
        
        logger.info(f"Extraction successful: {extracted.get('flavor', 'unknown')} by {extracted.get('brand', 'unknown')}")
        
        return GeminiExtractionResult(**extracted)
        
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        logger.error(f"Failed to parse Gemini response: {e}")
        logger.error(f"Raw response: {result}")
        raise Exception(f"Failed to parse Gemini extraction response: {e}")
