const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const healthRoutes = require('./routes/healthRoutes');
const historyRoutes = require('./routes/historyRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
//const PORT = process.env.PORT || 3000;
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── API Routes (MUST be before express.static) ───────────────────
// Registering API routes first ensures they are never intercepted
// by the static file server or the SPA catch-all below.
app.use('/api/health', healthRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/user', userRoutes);

// ── Static Frontend Files ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── SPA Catch-all (only for non-API GET requests) ─────────────────
// Handles client-side routes like /user/:userId from QR scans.
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Global Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong on the server' });
});

// ── 404 for unmatched API routes ──────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ── Hardware Simulation ───────────────────────────────────────────
const { startSimulation } = require('./simulator');
startSimulation();

app.listen(PORT, () => {
    console.log(`VitalSense API Server running on port ${PORT}`);
    console.log(`Open: http://localhost:${PORT}`);
});
