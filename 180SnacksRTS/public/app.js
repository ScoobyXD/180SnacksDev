const runButton = document.getElementById('runButton');
const statusText = document.getElementById('statusText');
const stepsList = document.getElementById('steps');
const logsEl = document.getElementById('logs');
const clockEl = document.getElementById('clock');
const servicesWidget = document.getElementById('servicesWidget');
const logsWidget = document.getElementById('logsWidget');

let currentRunId = null;
let pollTimer = null;

function setStatus(text) {
  statusText.textContent = text;
}

function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString();
}

function showRuntimeWidgets() {
  servicesWidget.classList.remove('hidden');
  logsWidget.classList.remove('hidden');
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
    const response = await fetch('/api/runs', {
      method: 'POST'
    });

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeWidgetDraggable(widget) {
  const handle = widget.querySelector('.drag-handle');
  if (!handle) {
    return;
  }

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener('pointerdown', (event) => {
    dragging = true;
    widget.style.zIndex = String(Date.now());
    const rect = widget.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragging) {
      return;
    }

    const maxX = window.innerWidth - widget.offsetWidth - 8;
    const maxY = window.innerHeight - widget.offsetHeight - 8;
    const nextX = clamp(event.clientX - offsetX, 8, Math.max(8, maxX));
    const nextY = clamp(event.clientY - offsetY, 8, Math.max(8, maxY));

    widget.style.left = `${nextX}px`;
    widget.style.top = `${nextY}px`;
  });

  const stopDragging = (event) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    handle.releasePointerCapture(event.pointerId);
  };

  handle.addEventListener('pointerup', stopDragging);
  handle.addEventListener('pointercancel', stopDragging);
}

runButton.addEventListener('click', startRun);
document.querySelectorAll('.draggable').forEach(makeWidgetDraggable);
setInterval(tickClock, 1000);
tickClock();
