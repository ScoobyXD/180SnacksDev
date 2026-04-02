# 180SnacksRTS

Human-operated runtime UI for the Costco reports pipeline.

## What it runs

1. `IRIDev` extraction (`npm run run -- --mode=download`)
2. `ExcelToAirtableDev` sync (`npm run run`)

## Run

```bash
cd 180SnacksRTS
npm install
npm start
```

Open `http://localhost:4010` and click **Run Pipeline**.

## Behavior

- Sequential run with live status + logs.
- One active run at a time.
- On successful completion, old `.xlsx` artifacts are auto-pruned:
  - `IRIDev/artifacts/downloads`: keep latest 3
  - `ExcelToAirtableDev/artifacts`: keep latest 5

## Important

The IRIDev step requires an existing auth state at:
`IRIDev/playwright/.auth/iri.json`
