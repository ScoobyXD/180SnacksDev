import process from 'node:process';
import { syncWorkbookToAirtable } from './airtableSync.js';

function getArg(name: string): string | undefined {
  const pref = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(pref));
  return found ? found.slice(pref.length) : undefined;
}

async function main(): Promise<void> {
  const input = getArg('input');
  const result = await syncWorkbookToAirtable(input);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
