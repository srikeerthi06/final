const mysql = require('mysql2/promise');
require('dotenv').config();

// Create the connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'roots',
    database: process.env.DB_NAME || 'vitalsense_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test and handle connection errors proactively
pool.getConnection()
    .then(connection => {
        console.log('Successfully connected to the MySQL database pool.');
        connection.release(); // release it back to the pool
    })
    .catch(err => {
        console.error('Error connecting to the MySQL database:', err.message);
        console.error('Please ensure your MySQL server is running and credentials are correct.');
    });

module.exports = pool;
