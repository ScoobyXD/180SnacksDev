import { spawn } from 'node:child_process';

type RunMode = 'recorded' | 'download';

function getMode(): RunMode {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = (modeArg?.split('=')[1] ?? 'recorded') as RunMode;

  if (!['recorded', 'download'].includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use --mode=recorded|download`);
  }

  return mode;
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function main(): Promise<void> {
  const mode = getMode();

  if (mode === 'download') {
    await runCommand('node', ['--loader', 'ts-node/esm', 'src/downloadFromAuth.ts']);
    return;
  }

  await runCommand('playwright', ['test', 'generated/cds.codegen.spec.ts', '--headed', '--workers=1']);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
