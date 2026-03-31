"""
Wait Helpers
============
The #1 cause of flaky automation is timing — trying to click an element
that hasn't loaded yet. These helpers solve that.

Appium's implicit wait handles most cases, but for tricky UIs
(like Deacom's dynamic content), you need explicit waits.
"""

import time
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By


def wait_and_click(driver, locator_type: str, locator_value: str, timeout: int = 15):
    """
    Wait for an element to be clickable, then click it.
    
    This is the most common action in any automation script.
    Instead of just clicking (which fails if the element isn't ready),
    this waits up to `timeout` seconds for it to appear and be interactive.
    
    Args:
        driver: Appium driver instance
        locator_type: How to find the element — "id", "xpath", "name", 
                      "accessibility_id", "class_name", "css_selector"
        locator_value: The actual selector string
        timeout: Max seconds to wait (default 15)
    
    Usage:
        wait_and_click(driver, "id", "submit-button")
        wait_and_click(driver, "xpath", "//button[@text='Save']")
        wait_and_click(driver, "accessibility_id", "SaveButton")  # Desktop apps
    """
    by = _resolve_locator(locator_type)
    element = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((by, locator_value))
    )
    element.click()
    return element


def wait_and_type(driver, locator_type: str, locator_value: str, text: str, 
                  clear_first: bool = True, timeout: int = 15):
    """
    Wait for an input field, optionally clear it, then type text.
    
    Args:
        driver: Appium driver instance
        locator_type: How to find the element
        locator_value: The actual selector string
        text: What to type
        clear_first: Whether to clear existing text before typing (default True)
        timeout: Max seconds to wait
    
    Usage:
        wait_and_type(driver, "id", "search-box", "180 Snacks")
        wait_and_type(driver, "name", "Text editor", "Hello from Appium!")  # Notepad
    """
    by = _resolve_locator(locator_type)
    element = WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, locator_value))
    )
    if clear_first:
        element.clear()
    element.send_keys(text)
    return element


def wait_for_element(driver, locator_type: str, locator_value: str, timeout: int = 15):
    """
    Wait for an element to be present in the UI tree.
    Returns the element without clicking or typing.
    
    Useful for reading text, checking if something appeared, etc.
    
    Usage:
        el = wait_for_element(driver, "xpath", "//span[@class='price']")
        print(el.text)  # Read the price
    """
    by = _resolve_locator(locator_type)
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, locator_value))
    )


def wait_for_text(driver, locator_type: str, locator_value: str, 
                  expected_text: str, timeout: int = 15) -> bool:
    """
    Wait until an element contains specific text.
    
    Useful for confirming a page loaded, a status changed, etc.
    
    Usage:
        success = wait_for_text(driver, "id", "status", "Complete")
    """
    by = _resolve_locator(locator_type)
    try:
        WebDriverWait(driver, timeout).until(
            EC.text_to_be_present_in_element((by, locator_value), expected_text)
        )
        return True
    except Exception:
        return False


def pause(seconds: float, reason: str = ""):
    """
    Explicit pause. Use sparingly — prefer wait_for_element instead.
    But sometimes you need it (animations, page transitions, etc).
    
    Always provide a reason so future you knows why the pause is there.
    
    Usage:
        pause(2, "Deacom sub-menu animation needs time to complete")
    """
    if reason:
        print(f"[Wait] Pausing {seconds}s — {reason}")
    time.sleep(seconds)


def _resolve_locator(locator_type: str) -> str:
    """Convert friendly locator names to Selenium By constants."""
    mapping = {
        "id": By.ID,
        "xpath": By.XPATH,
        "name": By.NAME,
        "class_name": By.CLASS_NAME,
        "css_selector": By.CSS_SELECTOR,
        "tag_name": By.TAG_NAME,
        "link_text": By.LINK_TEXT,
        # Appium-specific — these work for desktop and mobile apps
        "accessibility_id": By.XPATH,  # Mapped via Appium's AccessibilityId
    }
    
    result = mapping.get(locator_type.lower())
    if not result:
        raise ValueError(
            f"Unknown locator type: '{locator_type}'. "
            f"Use one of: {list(mapping.keys())}"
        )
    return result
