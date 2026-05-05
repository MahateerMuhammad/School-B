const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('connect', () => {
  console.log('✅ Connected to Supabase ');
});

pool.on('error', (err) => {
  // Supabase transaction pooler drops idle connections — this is normal.
  // The pool will automatically create a new connection on the next query.
  console.error('⚠️  Database pool connection dropped (will auto-reconnect):', err.message);
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection test failed:', err);
  } else {
    console.log('✅ Database connection test successful');
  }
});

module.exports = pool;
