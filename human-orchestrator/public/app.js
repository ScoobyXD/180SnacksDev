const runButton = document.getElementById('runButton');
const statusText = document.getElementById('statusText');
const stepsList = document.getElementById('steps');
const logsEl = document.getElementById('logs');

let currentRunId = null;
let pollTimer = null;

function setStatus(text) {
  statusText.textContent = text;
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

function renderLogs(logs = []) {
  if (!logs.length) {
    logsEl.textContent = 'No logs yet.';
    return;
  }

  logsEl.textContent = logs
    .slice(-200)
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
