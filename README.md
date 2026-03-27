# Deacom ERP Automation — 180 Snacks
## Purchasing → Order Reporting

### Quick Start

1. **Install dependencies:**
   ```bash
   pip install playwright
   playwright install chromium
   ```

2. **Set your credentials** (pick one method):

   **Option A — Environment variables:**
   ```bash
   export DEACOM_USER='your_username'
   export DEACOM_PASS='your_password'
   ```

   **Option B — Edit the script:**
   Open `deacom_purchasing.py` and fill in the `CREDENTIALS` dict at the top.

3. **Run it:**
   ```bash
   python deacom_purchasing.py
   ```

### What it does (step by step)

| Step | Action | Selector Used |
|------|--------|---------------|
| 1 | Navigate to `http://192.168.1.7:8081` | — |
| 2 | Fill **Username** | `#raUXiDlzOyVf9Ofr_Input` |
| 3 | Fill **Password** | `#rpKwhXEgvTwSBG4F_Input` |
| 4 | Select **Company** → `D180Snacks` | `#r3Cs0OzPE6OltRvs_Input` |
| 5 | Click **Continue** | `.LoginDialog button:has-text('Continue')` |
| 6 | Click **Purchasing** menu | `#Menu_Purchasing` |
| 7 | Click **Order Reporting** | `span.MenuLink[data-cmd="purman"]` |

### Configuration

| Env Variable | Default | Description |
|---|---|---|
| `DEACOM_URL` | `http://192.168.1.7:8081` | Deacom server URL |
| `DEACOM_USER` | *(empty)* | Login username |
| `DEACOM_PASS` | *(empty)* | Login password |
| `DEACOM_COMPANY` | `D180Snacks` | Company code |

### Notes
- Runs in **headed mode** (visible browser) by default — change `headless=False` → `True` once you've confirmed it works.
- `slow_mo=300` adds a 300ms pause between actions so you can follow along. Remove it for speed.
- The browser stays open after completion so you can inspect. Press Enter in the terminal to close.