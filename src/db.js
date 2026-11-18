const { Pool } = require('pg');
require('dotenv').config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'devops_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgrespassword',
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS || '4000', 10),
};

const pool = new Pool(DB_CONFIG);

let isConnected = false;
let lastError = null;
let reconnectTimer = null;
let schemaInitialized = false;

// Fallback in-memory task storage for when PostgreSQL is unreachable or starting up
let fallbackTasks = [
  {
    id: 1,
    title: 'Welcome to DevOpsFlow Portal! (Initial Task)',
    completed: false,
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    title: 'Explore Kubernetes Pods, Services & Rolling Updates',
    completed: true,
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    title: 'Deploy automated Jenkins CI/CD pipeline',
    completed: false,
    created_at: new Date().toISOString()
  }
];
let fallbackNextId = 4;

/**
 * Initialize database schema and seed default data
 */
async function initSchema(client) {
  if (schemaInitialized) return;

  await client.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
  `);

  const countRes = await client.query('SELECT COUNT(*) FROM tasks');
  if (parseInt(countRes.rows[0].count, 10) === 0) {
    await client.query(`
      INSERT INTO tasks (title, completed) VALUES 
      ('Welcome to DevOpsFlow Portal! (Stored in PostgreSQL)', false),
      ('Explore Kubernetes Pods, Services & Rolling Updates', true),
      ('Deploy automated Jenkins CI/CD pipeline to cluster', false);
    `);
    console.log('📝 Seeded initial tasks into PostgreSQL database.');
  }

  schemaInitialized = true;
  console.log('✅ PostgreSQL database schema initialized successfully.');
}

/**
 * Connect to PostgreSQL with retries and exponential backoff
 */
async function initDB(maxRetries = 5, initialDelay = 1000) {
  let attempts = 0;
  let delay = initialDelay;

  while (attempts < maxRetries) {
    attempts++;
    try {
      console.log(`🔄 [DB Attempt ${attempts}/${maxRetries}] Connecting to PostgreSQL at ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}...`);
      const client = await pool.connect();
      isConnected = true;
      lastError = null;
      console.log('✅ Successfully connected to PostgreSQL database!');

      await initSchema(client);
      client.release();

      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
      return true;
    } catch (err) {
      isConnected = false;
      lastError = err.message;
      console.warn(`⚠️ [DB Attempt ${attempts}/${maxRetries}] Failed to connect: ${err.message}`);

      if (attempts < maxRetries) {
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 8000);
      }
    }
  }

  console.warn('ℹ️ PostgreSQL is currently unreachable. The application will operate with in-memory fallback and automatically reconnect once PostgreSQL is ready.');
  startBackgroundReconnect();
  return false;
}

/**
 * Background retry worker to automatically re-establish connection when PostgreSQL starts
 */
function startBackgroundReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(async () => {
    if (isConnected) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
      return;
    }
    try {
      const client = await pool.connect();
      isConnected = true;
      lastError = null;
      console.log('✅ Reconnected to PostgreSQL database from background worker!');
      await initSchema(client);
      client.release();
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    } catch (err) {
      lastError = err.message;
    }
  }, 10000);
  if (reconnectTimer.unref) reconnectTimer.unref();
}

/**
 * Health check probe with latency measurement
 */
async function checkHealth() {
  const startTime = Date.now();
  try {
    const res = await pool.query('SELECT 1 AS alive');
    isConnected = true;
    lastError = null;
    const latencyMs = Date.now() - startTime;
    return {
      connected: res.rows[0]?.alive === 1,
      latencyMs,
      host: DB_CONFIG.host,
      database: DB_CONFIG.database
    };
  } catch (err) {
    isConnected = false;
    lastError = err.message;
    return {
      connected: false,
      latencyMs: null,
      host: DB_CONFIG.host,
      database: DB_CONFIG.database,
      error: err.message
    };
  }
}

/**
 * Fetch all tasks
 */
async function getAllTasks() {
  if (isConnected) {
    try {
      const res = await pool.query('SELECT * FROM tasks ORDER BY id DESC LIMIT 100');
      return { success: true, source: 'postgres', data: res.rows };
    } catch (err) {
      console.warn('Postgres query error, falling back to in-memory:', err.message);
    }
  }
  return { success: true, source: 'in-memory-fallback', data: fallbackTasks };
}

/**
 * Create a new task
 */
async function createTask(title) {
  if (isConnected) {
    try {
      const res = await pool.query(
        'INSERT INTO tasks (title, completed) VALUES ($1, false) RETURNING *',
        [title]
      );
      return { success: true, source: 'postgres', data: res.rows[0] };
    } catch (err) {
      console.warn('Postgres insert error, falling back to in-memory:', err.message);
    }
  }

  const newTask = {
    id: fallbackNextId++,
    title,
    completed: false,
    created_at: new Date().toISOString()
  };
  fallbackTasks.unshift(newTask);
  return { success: true, source: 'in-memory-fallback', data: newTask };
}

/**
 * Toggle task completed status
 */
async function toggleTask(id) {
  const numId = parseInt(id, 10);
  if (isConnected) {
    try {
      const res = await pool.query(
        'UPDATE tasks SET completed = NOT completed, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [numId]
      );
      if (res.rows.length > 0) {
        return { success: true, source: 'postgres', data: res.rows[0] };
      }
      return { success: false, error: 'Task not found' };
    } catch (err) {
      console.warn('Postgres toggle error, falling back to in-memory:', err.message);
    }
  }

  const task = fallbackTasks.find((t) => t.id === numId);
  if (task) {
    task.completed = !task.completed;
    return { success: true, source: 'in-memory-fallback', data: task };
  }
  return { success: false, error: 'Task not found' };
}

/**
 * Delete a task
 */
async function deleteTask(id) {
  const numId = parseInt(id, 10);
  if (isConnected) {
    try {
      const res = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [numId]);
      if (res.rows.length > 0) {
        return { success: true, source: 'postgres', id: numId };
      }
      return { success: false, error: 'Task not found' };
    } catch (err) {
      console.warn('Postgres delete error, falling back to in-memory:', err.message);
    }
  }

  const index = fallbackTasks.findIndex((t) => t.id === numId);
  if (index !== -1) {
    fallbackTasks.splice(index, 1);
    return { success: true, source: 'in-memory-fallback', id: numId };
  }
  return { success: false, error: 'Task not found' };
}

/**
 * Get pool diagnostics and table count
 */
async function getStats() {
  const health = await checkHealth();
  let taskCount = fallbackTasks.length;

  if (health.connected) {
    try {
      const countRes = await pool.query('SELECT COUNT(*) FROM tasks');
      taskCount = parseInt(countRes.rows[0].count, 10);
    } catch (_) {}
  }

  return {
    database: {
      connected: health.connected,
      latencyMs: health.latencyMs,
      host: DB_CONFIG.host,
      database: DB_CONFIG.database,
      user: DB_CONFIG.user,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      },
      lastError
    },
    taskCount
  };
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initDB,
  checkHealth,
  getStatus: () => isConnected,
  getAllTasks,
  createTask,
  toggleTask,
  deleteTask,
  getStats,
  resetFallback: () => {
    fallbackTasks = [];
    fallbackNextId = 1;
  }
};
