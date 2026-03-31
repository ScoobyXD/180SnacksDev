# Appium Cross-Platform Automation Prototype

## What This Is

A working prototype showing how **one framework (Appium)** can automate:
- **Web browsers** (Chrome) — like your current Playwright/Deacom work
- **Windows desktop apps** (Notepad, Calculator) — for legacy thick-client ERPs
- **Both in the same script** — the holy grail of "one tool"

This is R&D for evaluating Appium as the automation engine for 180 Snacks workflows
and potentially the core engine for a broader product.

## How Appium Works (Simple Version)

```
Your Python Script
    ↓ (HTTP request)
Appium Server (Node.js, runs locally on your machine)
    ↓ (routes to correct driver)
┌─────────────────────────────────────────┐
│  ChromeDriver  │  WinAppDriver  │  etc  │
│  (for web)     │  (for desktop) │       │
└─────────────────────────────────────────┘
    ↓
The actual app gets automated
```

You write ONE style of code. Appium figures out which driver to use based on
the "capabilities" you pass in.

## Prerequisites

### 1. Install Node.js (required for Appium server)
Download from: https://nodejs.org/ (LTS version)

### 2. Install Appium Server
```bash
npm install -g appium
```

### 3. Install Appium Drivers
```bash
# For web browser automation (Chrome)
appium driver install chromium

# For Windows desktop automation
appium driver install --source=npm appium-windows-driver
```

### 4. Install WinAppDriver (for desktop automation only)
Download from: https://github.com/microsoft/WinAppDriver/releases
- Install the .msi
- Enable Developer Mode in Windows Settings → For Developers

### 5. Install Python Dependencies
```bash
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # Mac/Linux

pip install -r requirements.txt
```

### 6. Chrome Browser
Make sure Chrome is installed. ChromeDriver will be managed automatically.

## Running

### Start Appium Server (keep this terminal open)
```bash
appium
```

### Run the demos
```bash
# Web browser automation demo
python -m automations.web_demo

# Windows desktop automation demo (Windows only)
python -m automations.desktop_demo

# Combined cross-platform demo
python -m automations.cross_platform_demo
```

## Project Structure

```
appium-prototype/
├── README.md                  ← You are here
├── requirements.txt           ← Python dependencies
├── config/
│   ├── __init__.py
│   └── capabilities.py        ← Device/browser configurations
├── automations/
│   ├── __init__.py
│   ├── web_demo.py            ← Chrome browser automation
│   ├── desktop_demo.py        ← Windows desktop app automation
│   └── cross_platform_demo.py ← Both in one script
├── utils/
│   ├── __init__.py
│   ├── driver_manager.py      ← Handles Appium session lifecycle
│   └── wait_helpers.py        ← Smart waiting utilities
└── tests/
    ├── __init__.py
    └── test_smoke.py           ← Basic smoke tests
```

## Key Differences from Playwright

| Aspect | Playwright | Appium |
|--------|-----------|--------|
| Web automation | Excellent, very fast | Good, slower (HTTP overhead) |
| Desktop apps | Cannot do this | Yes, via WinAppDriver |
| Mobile apps | No | Yes (iOS + Android) |
| Speed | Fast (direct protocol) | Slower (HTTP round-trips) |
| API style | Async Python | Sync Python (WebDriver) |
| Element finding | CSS/XPath selectors | Same + AccessibilityId, Name, ClassName |

## Verdict After Prototype

Use this prototype to answer:
1. Can Appium automate Deacom's web UI reliably? Compare to your Playwright scripts.
2. Can Appium automate Deacom's desktop client (if one exists)?
3. Is the speed acceptable for your workflows?
4. Is the code readable enough that an LLM could generate it?
