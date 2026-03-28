const mysql = require('mysql2/promise');
require('dotenv').config();

// 🚨 FORCE USE ENV VARIABLES (NO FALLBACK)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    // ✅ REQUIRED FOR RAILWAY CONNECTION
    ssl: {
        rejectUnauthorized: false
    }
});

// 🔍 Test connection on startup
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to Railway MySQL');
        connection.release();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
    }
})();

module.exports = pool;