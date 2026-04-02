# Human Orchestrator UI

Simple human-first UI to run the current 2-step pipeline:

1. IRIDev extraction (`npm run run -- --mode=download`)
2. ExcelToAirtable processing (`npm run run`)

## Run

```bash
cd human-orchestrator
npm start
```

Open `http://localhost:4010` and click:

**Extract Costco reports to Airtable**

## Notes

- Runs are sequential and show live status/logs in the UI.
- Only one run can be active at a time.
- The IRIDev step uses your existing auth setup from `IRIDev/playwright/.auth/iri.json`.
- This is intentionally a human-ops MVP and can later be replaced with queue-backed orchestration.
