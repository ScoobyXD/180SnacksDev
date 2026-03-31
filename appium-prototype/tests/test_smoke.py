"""
Smoke Tests
============
Run these first to verify your Appium setup is working.
If these pass, your environment is correctly configured.

Usage:
    python -m tests.test_smoke
"""

import sys
import os
import subprocess
import shutil

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_node_installed():
    """Check that Node.js is installed (required for Appium server)."""
    print("[Test] Node.js installed...", end=" ")
    result = subprocess.run(["node", "--version"], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"PASS ({result.stdout.strip()})")
        return True
    else:
        print("FAIL — Install Node.js from https://nodejs.org/")
        return False


def test_appium_installed():
    """Check that Appium CLI is installed globally."""
    print("[Test] Appium installed...", end=" ")
    result = subprocess.run(["appium", "--version"], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"PASS ({result.stdout.strip()})")
        return True
    else:
        print("FAIL — Run: npm install -g appium")
        return False


def test_appium_drivers():
    """Check which Appium drivers are installed."""
    print("[Test] Appium drivers...", end=" ")
    result = subprocess.run(["appium", "driver", "list", "--installed"], 
                          capture_output=True, text=True)
    if result.returncode == 0:
        output = result.stdout + result.stderr  # Appium sometimes uses stderr for output
        print(f"PASS")
        print(f"  Installed drivers: {output.strip()}")
        
        if "chromium" not in output.lower() and "chrome" not in output.lower():
            print("  WARNING: No Chromium driver. Run: appium driver install chromium")
        if "windows" not in output.lower():
            print("  WARNING: No Windows driver. Run: appium driver install --source=npm appium-windows-driver")
        return True
    else:
        print("FAIL — Could not list drivers")
        return False


def test_python_deps():
    """Check that Python dependencies are installed."""
    print("[Test] Python dependencies...", end=" ")
    try:
        import appium
        print(f"PASS (Appium-Python-Client installed)")
        return True
    except ImportError:
        print("FAIL — Run: pip install Appium-Python-Client")
        return False


def test_winappdriver():
    """Check if WinAppDriver is installed (Windows only)."""
    print("[Test] WinAppDriver installed...", end=" ")
    
    if sys.platform != "win32":
        print("SKIP (not on Windows)")
        return True
    
    wad_path = r"C:\Program Files (x86)\Windows Application Driver\WinAppDriver.exe"
    if os.path.exists(wad_path):
        print(f"PASS (found at {wad_path})")
        return True
    else:
        print("FAIL — Download from https://github.com/microsoft/WinAppDriver/releases")
        return False


def test_chrome_installed():
    """Check if Chrome browser is available."""
    print("[Test] Chrome installed...", end=" ")
    
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "/usr/bin/google-chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    
    for path in chrome_paths:
        if os.path.exists(path):
            print(f"PASS")
            return True
    
    if shutil.which("google-chrome") or shutil.which("chrome"):
        print("PASS")
        return True
    
    print("FAIL — Install Chrome browser")
    return False


def run_all_tests():
    """Run all smoke tests and report results."""
    print("=" * 60)
    print("APPIUM PROTOTYPE — SMOKE TESTS")
    print("=" * 60)
    print()
    
    tests = [
        test_node_installed,
        test_appium_installed,
        test_appium_drivers,
        test_python_deps,
        test_chrome_installed,
        test_winappdriver,
    ]
    
    results = []
    for test in tests:
        try:
            results.append(test())
        except Exception as e:
            print(f"  ERROR: {e}")
            results.append(False)
    
    print()
    print("=" * 60)
    passed = sum(1 for r in results if r)
    total = len(results)
    print(f"Results: {passed}/{total} passed")
    
    if all(results):
        print("\nAll checks passed! You're ready to run the demos.")
        print("  1. Start Appium server:  appium")
        print("  2. Run web demo:         python -m automations.web_demo")
        print("  3. Run desktop demo:     python -m automations.desktop_demo")
        print("  4. Run cross-platform:   python -m automations.cross_platform_demo")
    else:
        print("\nSome checks failed. Fix the issues above before running demos.")
    
    print("=" * 60)


if __name__ == "__main__":
    run_all_tests()
