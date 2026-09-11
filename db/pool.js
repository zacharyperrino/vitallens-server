// ─── PostgreSQL Connection Pool ─────────────────────────────
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/vitallens',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err);
});

/**
 * Execute a query against the pool.
 * @param {string} text — SQL query
 * @param {any[]} params — query parameters
 */
export async function query(text, params) {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
        console.warn(`[DB] Slow query (${duration}ms):`, text.slice(0, 120));
    }
    return result;
}

export default pool;
