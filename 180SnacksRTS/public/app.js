const runButton = document.getElementById('runButton');
const statusText = document.getElementById('statusText');
const stepsList = document.getElementById('steps');
const logsEl = document.getElementById('logs');
const metaEl = document.getElementById('meta');
const clockEl = document.getElementById('clock');

let currentRunId = null;
let pollTimer = null;

function setStatus(text) {
  statusText.textContent = text;
}

function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString();
}

function renderSteps(steps = []) {
  stepsList.innerHTML = '';
  for (const step of steps) {
    const li = document.createElement('li');
    li.className = 'step';

    const label = document.createElement('span');
    label.textContent = step.label;

    const badge = document.createElement('span');
    badge.className = `badge ${step.status}`;
    badge.textContent = step.status;

    li.append(label, badge);
    stepsList.appendChild(li);
  }
}

function renderMeta(run) {
  const entries = [
    ['Run ID', run.id],
    ['Status', run.status],
    ['Started', run.startedAt || '—'],
    ['Finished', run.finishedAt || '—'],
    ['Cleanup Removed', String(run.cleanup?.removed?.length ?? 0)]
  ];

  metaEl.innerHTML = '';
  for (const [key, value] of entries) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = value;
    metaEl.append(dt, dd);
  }
}

function renderLogs(logs = []) {
  if (!logs.length) {
    logsEl.textContent = 'No logs yet.';
    return;
  }

  logsEl.textContent = logs
    .slice(-250)
    .map((entry) => `[${entry.at}] [${entry.stepId}] [${entry.level}] ${entry.message}`)
    .join('\n');

  logsEl.scrollTop = logsEl.scrollHeight;
}

async function fetchRun(runId) {
  const response = await fetch(`/api/runs/${runId}`);
  if (!response.ok) {
    throw new Error('Could not load run status');
  }
  return response.json();
}

async function refreshRun() {
  if (!currentRunId) {
    return;
  }

  try {
    const run = await fetchRun(currentRunId);
    setStatus(`Run ${run.id} is ${run.status}.`);
    renderSteps(run.steps);
    renderMeta(run);
    renderLogs(run.logs);

    const finished = run.status === 'completed' || run.status === 'failed';
    runButton.disabled = !finished;

    if (finished && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

async function startRun() {
  runButton.disabled = true;
  setStatus('Starting pipeline run...');

  try {
    const response = await fetch('/api/runs', {
      method: 'POST'
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error || 'Could not start run';
      throw new Error(message);
    }

    currentRunId = payload.id;
    renderSteps(payload.steps);
    renderMeta(payload);
    renderLogs(payload.logs);
    setStatus(`Run ${payload.id} started.`);

    if (pollTimer) {
      clearInterval(pollTimer);
    }

    pollTimer = setInterval(refreshRun, 1500);
    await refreshRun();
  } catch (error) {
    runButton.disabled = false;
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

runButton.addEventListener('click', startRun);
setInterval(tickClock, 1000);
tickClock();
