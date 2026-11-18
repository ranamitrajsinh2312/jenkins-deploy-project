const express = require('express');
const os = require('os');
const db = require('./db');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const APP_NAME = process.env.APP_NAME || 'DevOpsFlow Portal';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const NODE_ENV = process.env.NODE_ENV || 'production';
const START_TIME = new Date();

// ==========================================
// API Routes
// ==========================================

/**
 * Health Check Endpoint
 * Used by Kubernetes Liveness & Readiness Probes and Docker HEALTHCHECK
 */
app.get('/health', async (req, res) => {
  const dbHealth = await db.checkHealth();
  const uptimeSeconds = Math.floor((Date.now() - START_TIME.getTime()) / 1000);

  const healthData = {
    status: 'UP',
    app: APP_NAME,
    version: APP_VERSION,
    environment: NODE_ENV,
    uptimeSeconds,
    pod: os.hostname(),
    database: {
      status: dbHealth.connected ? 'CONNECTED' : 'DEGRADED',
      latencyMs: dbHealth.latencyMs,
      host: dbHealth.host,
      database: dbHealth.database
    },
    timestamp: new Date().toISOString()
  };

  res.status(200).json(healthData);
});

/**
 * System and Environment Metadata
 */
app.get('/api/info', (req, res) => {
  res.json({
    app: APP_NAME,
    version: APP_VERSION,
    environment: NODE_ENV,
    hostname: os.hostname(),
    platform: `${process.platform} (${os.arch()})`,
    nodeVersion: process.version,
    memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    systemCpus: os.cpus().length,
    startedAt: START_TIME.toISOString(),
  });
});

/**
 * Database Diagnostic Stats
 */
app.get('/api/db/stats', async (req, res) => {
  const stats = await db.getStats();
  res.json({ success: true, ...stats });
});

/**
 * Get all tasks
 */
app.get('/api/tasks', async (req, res) => {
  const result = await db.getAllTasks();
  res.json(result);
});

/**
 * Create a new task
 */
app.post('/api/tasks', async (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Task title is required' });
  }

  const result = await db.createTask(title.trim());
  res.status(201).json(result);
});

/**
 * Toggle task completed status
 */
app.patch('/api/tasks/:id/toggle', async (req, res) => {
  const { id } = req.params;
  const result = await db.toggleTask(id);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
});

/**
 * Delete a task
 */
app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.deleteTask(id);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
});

// ==========================================
// Web UI Dashboard (Minimal & Simple)
// ==========================================
app.get('/', async (req, res) => {
  const dbHealth = await db.checkHealth();
  const hostname = os.hostname();
  const uptimeMinutes = Math.floor((Date.now() - START_TIME.getTime()) / 60000);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
    body { background: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; justify-content: center; align-items: flex-start; padding: 2.5rem 1rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; width: 100%; max-width: 580px; padding: 1.5rem; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
    header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 1.25rem; }
    h1 { font-size: 1.3rem; font-weight: 700; color: #38bdf8; }
    .badge { padding: 0.3rem 0.65rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge.green { background: #065f46; color: #34d399; }
    .badge.amber { background: #78350f; color: #fbbf24; }
    .meta { font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.25rem; line-height: 1.5; }
    .links { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .links a { color: #38bdf8; text-decoration: none; font-size: 0.8rem; background: #0f172a; border: 1px solid #334155; padding: 0.3rem 0.65rem; border-radius: 6px; }
    .links a:hover { border-color: #38bdf8; }
    form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    input[type="text"] { flex: 1; padding: 0.65rem 0.8rem; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #f8fafc; font-size: 0.9rem; outline: none; }
    input[type="text"]:focus { border-color: #38bdf8; }
    button.submit-btn { padding: 0.65rem 1.1rem; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
    button.submit-btn:hover { background: #0369a1; }
    ul { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
    li { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 0.65rem 0.8rem; display: flex; justify-content: space-between; align-items: center; }
    li.done span { text-decoration: line-through; color: #64748b; }
    .del-btn { background: transparent; border: none; color: #ef4444; font-weight: bold; cursor: pointer; padding: 0.2rem 0.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <header>
      <h1>${APP_NAME} <span style="font-size:0.8rem; color:#94a3b8; font-weight:normal;">v${APP_VERSION}</span></h1>
      <span class="badge ${dbHealth.connected ? 'green' : 'amber'}">${dbHealth.connected ? '● DB Connected' : '○ DB Offline'}</span>
    </header>

    <div class="meta">
      <strong>Host:</strong> ${hostname} &nbsp;|&nbsp; <strong>Uptime:</strong> ${uptimeMinutes}m &nbsp;|&nbsp; <strong>Env:</strong> ${NODE_ENV}
    </div>

    <div class="links">
      <a href="/health" target="_blank">Health Check (/health)</a>
      <a href="/api/info" target="_blank">System Info (/api/info)</a>
      <a href="/api/tasks" target="_blank">Tasks JSON (/api/tasks)</a>
    </div>

    <form id="taskForm">
      <input type="text" id="title" placeholder="Add a test task to verify DB..." required autocomplete="off" />
      <button type="submit" class="submit-btn">+ Add</button>
    </form>

    <ul id="taskList"><li>Loading tasks...</li></ul>
  </div>

  <script>
    async function loadTasks() {
      try {
        const res = await fetch('/api/tasks');
        const json = await res.json();
        const list = document.getElementById('taskList');
        list.innerHTML = '';
        (json.data || []).forEach(t => {
          const li = document.createElement('li');
          if (t.completed) li.className = 'done';
          li.innerHTML = \`
            <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
              <input type="checkbox" \${t.completed ? 'checked' : ''} onchange="toggleTask(\${t.id})" />
              <span>\${t.title}</span>
            </label>
            <button class="del-btn" onclick="deleteTask(\${t.id})">✕</button>
          \`;
          list.appendChild(li);
        });
        if (!json.data || json.data.length === 0) list.innerHTML = '<li style="color:#64748b;">No tasks yet.</li>';
      } catch (err) {
        console.error('Failed to load tasks', err);
      }
    }

    async function toggleTask(id) {
      await fetch('/api/tasks/' + id + '/toggle', { method: 'PATCH' });
      loadTasks();
    }

    async function deleteTask(id) {
      await fetch('/api/tasks/' + id, { method: 'DELETE' });
      loadTasks();
    }

    document.getElementById('taskForm').onsubmit = async (e) => {
      e.preventDefault();
      const inp = document.getElementById('title');
      if (!inp.value.trim()) return;
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: inp.value.trim() })
      });
      inp.value = '';
      loadTasks();
    };

    loadTasks();
  </script>
</body>
</html>`;

  res.send(html);
});

module.exports = app;
