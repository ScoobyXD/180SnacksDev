"""
Web Browser Automation Demo
============================
This demonstrates Appium automating Chrome — the same kind of work
you're currently doing with Playwright for Deacom.

What this demo does:
1. Opens Chrome via Appium
2. Navigates to Google
3. Searches for "180 Snacks"
4. Reads the results
5. Takes a screenshot
6. Closes the browser

Compare this to your Playwright code — same outcome, different syntax.
The advantage: this same Appium driver style works for desktop apps too.

PREREQUISITE: 
  - Appium server running: `appium`
  - Chromium driver installed: `appium driver install chromium`
"""

import sys
import os

# Add project root to path so imports work when running as module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.driver_manager import DriverManager
from utils.wait_helpers import wait_and_click, wait_and_type, wait_for_element, pause
from config.capabilities import CHROME_CAPS


def run_web_demo():
    """
    Automate a Google search via Chrome.
    This is intentionally simple — the point is to show the pattern,
    not to build a production automation.
    """
    print("=" * 60)
    print("APPIUM WEB AUTOMATION DEMO")
    print("Automating Chrome browser — like Playwright but cross-platform")
    print("=" * 60)
    
    with DriverManager(CHROME_CAPS) as driver:
        
        # ---- Step 1: Navigate to Google ----
        print("\n[Step 1] Navigating to Google...")
        driver.get("https://www.google.com")
        pause(1, "Let page fully render")
        
        # ---- Step 2: Type a search query ----
        print("[Step 2] Searching for '180 Snacks'...")
        # Google's search box can be found by name="q"
        wait_and_type(driver, "name", "q", "180 Snacks")
        
        # Press Enter to search
        from selenium.webdriver.common.keys import Keys
        search_box = wait_for_element(driver, "name", "q")
        search_box.send_keys(Keys.ENTER)
        
        pause(2, "Wait for search results to load")
        
        # ---- Step 3: Read some results ----
        print("[Step 3] Reading search results...")
        try:
            # Google's result titles are in h3 tags
            results = driver.find_elements("css selector", "h3")
            for i, result in enumerate(results[:5]):
                print(f"  Result {i+1}: {result.text}")
        except Exception as e:
            print(f"  Could not read results: {e}")
        
        # ---- Step 4: Take a screenshot ----
        screenshot_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), 
            "..", "screenshot_web.png"
        )
        driver.save_screenshot(screenshot_path)
        print(f"\n[Step 4] Screenshot saved to: {screenshot_path}")
        
        # ---- Step 5: Get page info ----
        print(f"\n[Info] Page title: {driver.title}")
        print(f"[Info] Current URL: {driver.current_url}")
        
    print("\n" + "=" * 60)
    print("Web demo complete! Browser closed.")
    print("=" * 60)


# ---- Deacom-style example (template for your actual work) ----

def deacom_login_template():
    """
    TEMPLATE: How a Deacom web login would look in Appium.
    
    This is pseudo-code — you'd replace the selectors with real ones
    from Deacom's UI. Compare to your existing Playwright version.
    
    NOTE: This is just to show the pattern. Don't run this as-is.
    """
    with DriverManager(CHROME_CAPS) as driver:
        
        # Navigate to Deacom
        driver.get("https://your-deacom-instance.com")
        
        # Login
        wait_and_type(driver, "id", "username-field", "your_username")
        wait_and_type(driver, "id", "password-field", "your_password")
        wait_and_click(driver, "id", "login-button")
        
        # Wait for dashboard to load
        pause(3, "Deacom dashboard loading")
        
        # Navigate to PO Receiving (using Deacom's data-cmd selectors)
        # In Playwright you used: page.locator('[data-cmd="PO_RECEIVING"]')
        # In Appium it's:
        wait_and_click(driver, "css_selector", '[data-cmd="PO_RECEIVING"]')
        
        # Fill in PO number
        wait_and_type(driver, "css_selector", '[data-field="po_number"]', "PO-12345")
        
        # Click receive
        wait_and_click(driver, "css_selector", '[data-cmd="RECEIVE"]')
        
        # Verify success
        from utils.wait_helpers import wait_for_text
        success = wait_for_text(driver, "css_selector", ".status-message", "Received")
        print(f"PO received successfully: {success}")


if __name__ == "__main__":
    run_web_demo()
