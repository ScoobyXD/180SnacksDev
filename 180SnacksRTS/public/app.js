const runButton = document.getElementById('runButton');
const statusText = document.getElementById('statusText');
const stepsList = document.getElementById('steps');
const logsEl = document.getElementById('logs');
const clockEl = document.getElementById('clock');
const branchTree = document.getElementById('branchTree');
const canvas = document.getElementById('canvas');
const world = document.getElementById('world');

let currentRunId = null;
let pollTimer = null;

const pan = {
  x: -4900,
  y: -4400,
  dragging: false,
  startMouseX: 0,
  startMouseY: 0,
  startX: 0,
  startY: 0
};

function applyPan() {
  world.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
}

function setStatus(text) {
  statusText.textContent = text;
}

function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString();
}

function showRuntimeWidgets() {
  branchTree.classList.remove('hidden');
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
    showRuntimeWidgets();
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
    const response = await fetch('/api/runs', { method: 'POST' });
    const payload = await response.json();

    if (!response.ok) {
      const message = payload?.error || 'Could not start run';
      throw new Error(message);
    }

    currentRunId = payload.id;
    showRuntimeWidgets();
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

canvas.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('.widget')) {
    return;
  }

  pan.dragging = true;
  pan.startMouseX = event.clientX;
  pan.startMouseY = event.clientY;
  pan.startX = pan.x;
  pan.startY = pan.y;
  canvas.classList.add('panning');
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!pan.dragging) {
    return;
  }

  pan.x = pan.startX + (event.clientX - pan.startMouseX);
  pan.y = pan.startY + (event.clientY - pan.startMouseY);
  applyPan();
});

function stopPan(event) {
  if (!pan.dragging) {
    return;
  }

  pan.dragging = false;
  canvas.classList.remove('panning');
  canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener('pointerup', stopPan);
canvas.addEventListener('pointercancel', stopPan);

runButton.addEventListener('click', startRun);
setInterval(tickClock, 1000);
applyPan();
tickClock();
