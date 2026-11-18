const app = require('./app');
const db = require('./db');

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  // Initialize Database connection & table
  console.log('🔄 Initializing database connection...');
  await db.initDB();

  // Start HTTP listener
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running smoothly on http://0.0.0.0:${PORT}`);
    console.log(`🩺 Health check accessible at http://0.0.0.0:${PORT}/health`);
  });

  // Graceful shutdown on SIGTERM / SIGINT (critical for Kubernetes pod termination)
  const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('🔒 HTTP server closed.');
      try {
        await db.pool.end();
        console.log('📦 Database pool closed.');
      } catch (err) {
        console.error('Error closing database pool:', err.message);
      }
      process.exit(0);
    });

    // Force shutdown if taking longer than 10s
    setTimeout(() => {
      console.error('⚠️ Forcing immediate termination after timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
