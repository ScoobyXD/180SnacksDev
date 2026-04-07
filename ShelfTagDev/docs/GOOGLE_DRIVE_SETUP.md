# Google Drive Upload Setup (One-Time, Admin Only)

This app supports **consumer sign-in to their own Google Drive**.
End users should only tap **Photos → Google Drive** and sign in.
They should **never** edit infrastructure or Cloudflare config.

---

## 1) What this integration does

Upload flow for Drive images:

1. User taps **Google Drive** in the app.
2. User signs in with their own Google account.
3. User selects up to 30 images in Picker.
4. App sends Drive file IDs + short-lived user token to Worker.
5. Worker fetches image bytes from that user’s Drive.
6. Worker stores to R2, runs extraction, writes Airtable row.

So the account used is always the **consumer’s Google account**, not the app owner’s account.

---

## 2) Google Cloud project setup (once by your team)

Create/use one Google Cloud project for your app.

### Enable APIs
- Google Drive API
- Google Picker API

### OAuth consent screen
- User type: **External**
- App name/support email/privacy policy as required
- Add scope: `.../auth/drive.readonly`
- Add authorized domain(s) for production host
- Publish app when ready for general users

> If consent screen is in Testing mode, only listed test users can sign in.

### OAuth Client ID (Web application)
- Create OAuth client credentials for Web
- Add authorized JavaScript origins:
  - Local/dev origin (if used)
  - Production app origin (exact scheme + host)

### API key (for Picker)
- Create API key
- Restrict key to:
  - Google Picker API
  - Google Drive API
- Restrict HTTP referrers to your app domains

### App ID
- Use your Google Cloud **project number** as Picker `app_id`

---

## 3) Cloudflare Worker configuration (once by your team)

Set these as Worker secrets/vars in deployment environment:

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_DEVELOPER_KEY`
- `GOOGLE_DRIVE_APP_ID`

Example:

```bash
npx wrangler secret put GOOGLE_DRIVE_CLIENT_ID
npx wrangler secret put GOOGLE_DRIVE_DEVELOPER_KEY
npx wrangler secret put GOOGLE_DRIVE_APP_ID
```

Then deploy:

```bash
npx wrangler deploy
```

---

## 4) Verification checklist

1. Open app and tap **Photos → Google Drive**.
2. Confirm Google account chooser appears.
3. Sign in with a non-owner account.
4. Select ≤30 images.
5. Confirm queue increments and sync completes.
6. Confirm images appear in R2 and Airtable record is created.

---

## 5) Troubleshooting

### “Google Drive upload is unavailable right now”
- Missing Worker Drive config values.
- `/api/google-drive/config` should return `success: true`.

### OAuth popup blocked/cancelled
- Browser blocked popups or user cancelled sign-in.

### “Access blocked” or consent errors
- Consent screen not published or user not in Test Users.

### 403 from Drive or Picker
- API key restrictions/origins mismatch.
- Drive API or Picker API not enabled.

### Works in dev, fails in prod
- Production origin missing in OAuth allowed origins.
- Referrer restriction on API key missing production host.

---

## 6) Security notes

- Client IDs and Picker API keys are expected to be public.
- Restrict keys by API + referrer.
- Use least-privilege scope (`drive.readonly`).
- Keep server secrets (Gemini/Airtable) in Worker secrets.
