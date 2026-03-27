"""
Deacom ERP Automation — 180 Snacks
Login → Purchasing → Order Reporting

Uses STABLE selectors (data-* attributes, labels, structure)
instead of session-generated IDs that change on every login.

Prerequisites:
    pip install playwright python-dotenv
    playwright install chromium

Setup:
    1. Copy .env.example → .env
    2. Fill in your credentials in .env
    3. python deacom_purchasing.py

Environment variables (loaded from .env):
    DEACOM_URL      — base URL  (default: http://192.168.1.7:8081)
    DEACOM_USER     — your Deacom username
    DEACOM_PASS     — your Deacom password
    DEACOM_COMPANY  — company code (default: D180Snacks)
"""

import os
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# ── Load .env file ───────────────────────────────────────────────────────────
load_dotenv()

# ── Configuration (all values come from .env) ────────────────────────────────
CREDENTIALS = {
    "url":      os.getenv("DEACOM_URL",     "http://192.168.1.7:8081"),
    "username": os.getenv("DEACOM_USER",     ""),
    "password": os.getenv("DEACOM_PASS",     ""),
    "company":  os.getenv("DEACOM_COMPANY",  "D180Snacks"),
}

TIMEOUT = 30_000  # ms


# ── Selector Strategy ────────────────────────────────────────────────────────
# Deacom generates RANDOM element IDs every session (e.g. #raUXiDlzOyVf9Ofr).
# But these attributes are STABLE across sessions:
#
#   LOGIN PAGE:
#     - Labels:  title="Username", title="Password", title="Company"
#     - Container: .LoginDialog, .DeacomInputBox
#     - Button text: "Continue"
#
#   MAIN APP:
#     - Menu IDs:     #Menu_Purchasing                         (stable)
#     - Sub-menu IDs: #Menu_Links_Purchasing                   (stable)
#     - Menu items:   data-cmd="purman"                        (stable)
#     - Form fields:  data-controlsource="purchaseorder"       (stable)
#     - Form names:   data-internalname="freight"              (stable)
#     - Tab identity:  data-internalid="purman"                (stable)
# ─────────────────────────────────────────────────────────────────────────────


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, slow_mo=300)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()
        page.set_default_timeout(TIMEOUT)

        # ═════════════════════════════════════════════════════════════════════
        # STEP 1 — Navigate to Login Page
        # ═════════════════════════════════════════════════════════════════════
        print("[1/5] Navigating to Deacom login …")
        page.goto(CREDENTIALS["url"], wait_until="domcontentloaded")

        # Wait for login dialog
        page.wait_for_selector(".LoginDialog", state="visible")
        print("       Login dialog visible ✓")

        # ═════════════════════════════════════════════════════════════════════
        # STEP 2 — Fill Username
        #   STABLE selector: label[title="Username"] → sibling input
        # ═════════════════════════════════════════════════════════════════════
        print("[2/5] Entering credentials …")
        username_input = page.locator(
            '.LoginDialog .DeacomInputBox:has(label[title="Username"]) input[type="text"]'
        )
        username_input.click()
        username_input.fill(CREDENTIALS["username"])

        # ═════════════════════════════════════════════════════════════════════
        # STEP 3 — Fill Password
        #   STABLE selector: label[title="Password"] → sibling input
        # ═════════════════════════════════════════════════════════════════════
        password_input = page.locator(
            '.LoginDialog .DeacomInputBox:has(label[title="Password"]) input[type="password"]'
        )
        password_input.click()
        password_input.fill(CREDENTIALS["password"])

        # ═════════════════════════════════════════════════════════════════════
        # STEP 4 — Select Company
        #   STABLE selector: label[title="Company"] → sibling select
        # ═════════════════════════════════════════════════════════════════════
        company_select = page.locator(
            '.LoginDialog .DeacomInputBox:has(label[title="Company"]) select'
        )
        company_select.select_option(value=CREDENTIALS["company"])
        print(f"       Company set to: {CREDENTIALS['company']} ✓")

        # ═════════════════════════════════════════════════════════════════════
        # STEP 5 — Click "Continue" to log in
        #   STABLE selector: button text inside .LoginDialog
        # ═════════════════════════════════════════════════════════════════════
        print("[3/5] Clicking Continue …")
        continue_btn = page.locator(
            '.LoginDialog .DialogButtonset button:has-text("Continue")'
        )
        continue_btn.click()

        # Wait for main menu to load (login overlay disappears)
        print("       Waiting for main page …")
        page.wait_for_selector("#Menu_Purchasing", state="visible", timeout=60_000)
        print("       Logged in ✓")

        # ═════════════════════════════════════════════════════════════════════
        # STEP 6 — Click "Purchasing" in the top menu bar
        #   STABLE selector: #Menu_Purchasing (confirmed across 3 HTML dumps)
        # ═════════════════════════════════════════════════════════════════════
        print("[4/5] Opening Purchasing menu …")
        page.locator("#Menu_Purchasing").click()

        # The sub-menu animates in (opacity 0→1, display none→block).
        # Wait for it to exist in DOM, then let the CSS animation finish.
        page.wait_for_selector("#Menu_Links_Purchasing", state="attached")
        page.wait_for_timeout(500)  # CSS opacity transition
        print("       Purchasing menu open ✓")

        # ═════════════════════════════════════════════════════════════════════
        # STEP 7 — Click "Order Reporting" inside the Purchasing sub-menu
        #   STABLE selector: data-cmd="purman" (Deacom internal command)
        # ═════════════════════════════════════════════════════════════════════
        print("[5/5] Clicking Order Reporting …")
        order_reporting = page.locator(
            '#Menu_Links_Purchasing span.MenuLink[data-cmd="purman"]'
        )
        # force=True bypasses opacity/visibility checks during animation
        order_reporting.click(force=True)

        # Wait for the form to load
        page.wait_for_timeout(3000)
        print("       Order Reporting opened ✓")

        # ═════════════════════════════════════════════════════════════════════
        # VERIFY — confirm we landed on the right page
        # ═════════════════════════════════════════════════════════════════════
        try:
            tab_text = page.locator(".ActiveTab .TabLink").inner_text(timeout=5000)
            print(f"       Active tab: '{tab_text}' ✓")
        except PWTimeout:
            print("       (could not read tab name, but navigation completed)")

        print("\n✅  Done! Browser will stay open for you to inspect.")
        print("   Press Enter in this terminal to close the browser …")
        input()

        context.close()
        browser.close()


if __name__ == "__main__":
    if not CREDENTIALS["username"] or not CREDENTIALS["password"]:
        print("⚠️  No credentials set!")
        print("   Either edit CREDENTIALS in the script or set env vars:")
        print("     export DEACOM_USER='your_username'")
        print("     export DEACOM_PASS='your_password'")
        print()
        resp = input("Run anyway (you can type creds manually)? [y/N] ")
        if resp.lower() != "y":
            exit(0)

    run()
