"""
Windows Desktop App Automation Demo
=====================================
This is the thing Playwright CANNOT do.

This demo automates Windows Notepad — a native Win32 desktop app.
The same approach works for any Windows application:
- Legacy ERPs with thick clients
- Excel (the actual desktop app, not web Excel)
- Any Windows program with a UI

What this demo does:
1. Launches Notepad via Appium + WinAppDriver
2. Types text into the editor
3. Reads the text back
4. Uses menu navigation (File → Save As)
5. Closes the app

PREREQUISITES:
  - Windows 10/11 only
  - Developer Mode enabled (Settings → For Developers)
  - WinAppDriver installed: https://github.com/microsoft/WinAppDriver/releases
  - Appium server running: `appium`
  - Windows driver installed: `appium driver install --source=npm appium-windows-driver`
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.driver_manager import DriverManager
from utils.wait_helpers import wait_and_click, wait_and_type, wait_for_element, pause
from config.capabilities import NOTEPAD_CAPS, CALCULATOR_CAPS


def run_notepad_demo():
    """
    Automate Windows Notepad.
    
    This shows the EXACT same Appium API you use for web automation,
    but targeting a native desktop application instead.
    """
    print("=" * 60)
    print("APPIUM DESKTOP AUTOMATION DEMO — NOTEPAD")
    print("Same API as web automation, but driving a Win32 app")
    print("=" * 60)
    
    with DriverManager(NOTEPAD_CAPS) as driver:
        
        # ---- Step 1: Type into Notepad ----
        print("\n[Step 1] Typing text into Notepad...")
        
        # In desktop apps, you find elements by "name" (accessibility name)
        # Use Windows Inspect.exe tool to discover element names
        # Notepad's text area has the name "Text editor" (Windows 11)
        # or no name on older versions — fall back to class name
        try:
            editor = wait_for_element(driver, "name", "Text editor")
        except Exception:
            # Fallback for older Windows versions
            editor = wait_for_element(driver, "class_name", "Edit")
        
        editor.send_keys("Hello from Appium!\n")
        editor.send_keys("This is automating a DESKTOP app, not a browser.\n")
        editor.send_keys("Same Python API. Same Appium server. Different target.\n")
        editor.send_keys("\n")
        editor.send_keys("If this works for Notepad, it works for any Windows app.\n")
        editor.send_keys("Including legacy ERP thick clients like Deacom.\n")
        
        pause(1, "Let text render")
        
        # ---- Step 2: Read the text back ----
        print("[Step 2] Reading text from Notepad...")
        text_content = editor.text
        print(f"  Notepad contains: {text_content[:80]}...")
        
        # ---- Step 3: Navigate menus ----
        print("[Step 3] Navigating File menu...")
        
        # Keyboard shortcut approach (more reliable for menus)
        from selenium.webdriver.common.keys import Keys
        
        # Ctrl+A to select all text
        editor.send_keys(Keys.CONTROL, 'a')
        pause(0.5, "Selection animation")
        
        # ---- Step 4: Take a screenshot ----
        screenshot_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..", "screenshot_desktop.png"
        )
        driver.save_screenshot(screenshot_path)
        print(f"\n[Step 4] Screenshot saved to: {screenshot_path}")
        
        # ---- Step 5: Close without saving ----
        print("[Step 5] Closing Notepad...")
        
        # Send Alt+F4 to close
        editor.send_keys(Keys.ALT, Keys.F4)
        pause(1, "Close dialog appearing")
        
        # Click "Don't Save" on the dialog
        try:
            wait_and_click(driver, "name", "Don\u2019t Save")
        except Exception:
            try:
                wait_and_click(driver, "name", "Don't Save")
            except Exception:
                print("  (Close dialog not found — app may have closed already)")
    
    print("\n" + "=" * 60)
    print("Desktop demo complete! Notepad closed.")
    print("=" * 60)


def run_calculator_demo():
    """
    Automate Windows Calculator.
    
    Shows how to interact with buttons, read display values,
    and verify results — useful patterns for any app with
    buttons and data fields.
    """
    print("=" * 60)
    print("APPIUM DESKTOP AUTOMATION DEMO — CALCULATOR")
    print("=" * 60)
    
    with DriverManager(CALCULATOR_CAPS) as driver:
        
        pause(2, "Calculator loading")
        
        # ---- Calculate 180 * 5 ----
        print("\n[Step 1] Calculating 180 × 5...")
        
        # Calculator buttons can be found by their automation names
        # Use Inspect.exe or Accessibility Insights to find these
        wait_and_click(driver, "name", "One")
        wait_and_click(driver, "name", "Eight")
        wait_and_click(driver, "name", "Zero")
        wait_and_click(driver, "name", "Multiply by")
        wait_and_click(driver, "name", "Five")
        wait_and_click(driver, "name", "Equals")
        
        pause(1, "Calculation completing")
        
        # ---- Read the result ----
        print("[Step 2] Reading result...")
        try:
            # The display element contains the result
            result = wait_for_element(driver, "xpath",
                "//*[contains(@AutomationId, 'CalculatorResults')]"
            )
            print(f"  Result: {result.text}")
        except Exception as e:
            print(f"  Could not read result: {e}")
        
        # ---- Screenshot ----
        screenshot_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..", "screenshot_calculator.png"
        )
        driver.save_screenshot(screenshot_path)
        print(f"\n[Step 3] Screenshot saved to: {screenshot_path}")
    
    print("\n" + "=" * 60)
    print("Calculator demo complete!")
    print("=" * 60)


if __name__ == "__main__":
    print("Which demo would you like to run?")
    print("  1. Notepad (text editing)")
    print("  2. Calculator (button clicking)")
    
    choice = input("\nEnter 1 or 2: ").strip()
    
    if choice == "1":
        run_notepad_demo()
    elif choice == "2":
        run_calculator_demo()
    else:
        print("Running both...")
        run_notepad_demo()
        run_calculator_demo()
