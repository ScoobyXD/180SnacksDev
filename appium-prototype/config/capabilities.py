"""
Appium Capabilities Configuration
==================================
"Capabilities" tell Appium WHAT you want to automate.
Think of it like telling a taxi driver where to go —
the driver (Appium) figures out the route (which automation engine to use).

Each dictionary below configures Appium for a different target:
- Chrome browser (web apps like Deacom)
- Windows desktop apps (Notepad, Calculator, or a thick-client ERP)
- Android/iOS (future — for mobile apps)
"""

# ============================================================
# Appium server — runs locally on your machine
# ============================================================
APPIUM_SERVER_URL = "http://127.0.0.1:4723"


# ============================================================
# Chrome Browser — for web app automation (like Deacom)
# ============================================================
CHROME_CAPS = {
    "platformName": "Windows",           # OS you're running on
    "appium:automationName": "Chromium",  # Use the Chromium driver
    "browserName": "chrome",             # Automate Chrome specifically
    "appium:chromeOptions": {
        "args": [
            "--start-maximized",         # Full screen for consistent selectors
            # "--headless",              # Uncomment to run without visible browser
        ]
    }
}


# ============================================================
# Windows Desktop App — for thick-client / Win32 apps
# ============================================================

# Example: Automate Notepad
NOTEPAD_CAPS = {
    "platformName": "Windows",
    "appium:automationName": "Windows",       # Use WinAppDriver
    "appium:app": "C:\\Windows\\System32\\notepad.exe",
}

# Example: Automate Calculator
CALCULATOR_CAPS = {
    "platformName": "Windows",
    "appium:automationName": "Windows",
    "appium:app": "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
}

# Template: Automate any Windows desktop app
# Just change the app path to your target application
def desktop_app_caps(app_path: str) -> dict:
    """
    Generate capabilities for any Windows desktop application.
    
    Usage:
        caps = desktop_app_caps("C:\\Program Files\\YourERP\\erp.exe")
    """
    return {
        "platformName": "Windows",
        "appium:automationName": "Windows",
        "appium:app": app_path,
        "appium:ms:waitForAppLaunch": "25",  # Wait up to 25s for app to start
    }


# Template: Attach to an already-running Windows app
def attach_to_running_app(window_title: str) -> dict:
    """
    Attach to a Windows app that's already open.
    Useful for ERPs that are always running or have complex login flows
    you want to handle manually first.
    
    Usage:
        caps = attach_to_running_app("Deacom ERP")
    """
    return {
        "platformName": "Windows",
        "appium:automationName": "Windows",
        "appium:app": "Root",  # Connect to desktop root
        # After connecting, you'll find the window by title
        # and switch to it — see driver_manager.py
    }
