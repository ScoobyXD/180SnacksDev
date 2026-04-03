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
- At the end of every run (success or failure), `.xlsx` artifacts are deleted:
  - `IRIDev/artifacts/downloads`: remove all `.xlsx`
  - `ExcelToAirtableDev/artifacts`: remove all `.xlsx`

## Important

The IRIDev step requires an existing auth state at:
`IRIDev/playwright/.auth/iri.json`
