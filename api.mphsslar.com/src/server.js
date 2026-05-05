const app = require('./app');
const config = require('./config/env');
const pool = require('./config/db');

const PORT = config.port;

// Start server
const server = app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════════════╗
  ║                                                    ║
  ║   🎓 School Management System API Server           ║
  ║                                                    ║
  ║   Environment: ${config.nodeEnv.padEnd(35)}║
  ║   Port: ${PORT.toString().padEnd(42)}║
  ║   Database: Connected ✅                           ║
  ║                                                    ║
  ║   Local: http://localhost:${PORT}                  ║
  ║   Health: http://localhost:${PORT}/health          ║
  ║                                                    ║
  ╚════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    console.log('🛑 HTTP server closed');
    await pool.end();
    console.log('🛑 Database pool closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT signal received: closing HTTP server');
  server.close(async () => {
    console.log('🛑 HTTP server closed');
    await pool.end();
    console.log('🛑 Database pool closed');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  server.close(async () => {
    await pool.end();
    process.exit(1);
  });
});
