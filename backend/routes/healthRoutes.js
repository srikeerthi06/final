const express = require('express');
const router = express.Router();
const db = require('../config/db');
const QRCode = require('qrcode');

// ── POST /api/health/scan ─────────────────────────────────────────
// Record a new health scan for a user.
// MUST be defined before GET /:userId to avoid route conflict.
router.post('/scan', async (req, res) => {
    try {
        const { userId, heartRate, temperature, spo2 } = req.body;

        if (!userId || heartRate === undefined || temperature === undefined || spo2 === undefined) {
            return res.status(400).json({ error: 'Please provide userId, heartRate, temperature, and spo2' });
        }

        const [users] = await db.query('SELECT userId FROM users WHERE userId = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isHrNormal    = heartRate >= 60 && heartRate <= 100;
        const isTempNormal  = temperature >= 36.0 && temperature <= 37.5;
        const isSpo2Normal  = spo2 >= 95;
        const isHrCritical   = heartRate < 50 || heartRate >= 120;
        const isTempCritical = temperature < 35.0 || temperature >= 39.0;
        const isSpo2Critical = spo2 < 90;

        let status = 'Normal';
        if (isHrCritical || isTempCritical || isSpo2Critical) status = 'Critical';
        else if (!isHrNormal || !isTempNormal || !isSpo2Normal) status = 'Risk';

        await db.query(
            'INSERT INTO health_records (userId, heartRate, temperature, spo2, status) VALUES (?, ?, ?, ?, ?)',
            [userId, heartRate, temperature, spo2, status]
        );

        console.log(`[SCAN] userId:${userId} | HR:${heartRate} Temp:${temperature} SpO2:${spo2} → ${status}`);
        res.status(201).json({ message: 'Scan recorded successfully', status });

    } catch (err) {
        console.error('POST /api/health/scan error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /api/health/:userId ───────────────────────────────────────
// Get dashboard data for a user. Auto-creates user if accessed via QR scan.
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const host    = req.headers['x-forwarded-host'] || req.get('host');
        const baseUrl = `${req.protocol}://${host}`;

        const [users] = await db.query(
            'SELECT u.userId, u.name, q.qrData AS qr_code, u.created_at FROM users u LEFT JOIN qr_codes q ON u.userId = q.userId WHERE u.userId = ?',
            [userId]
        );

        let user;

        if (users.length === 0) {
            // Auto-create user when accessed via QR scan URL
            const name     = 'Patient ' + userId;
            const qrCode   = await QRCode.toDataURL(`${baseUrl}/user/${userId}`);
            const genUser  = 'patient.' + userId.toLowerCase();
            const genPass  = Math.random().toString(36).substring(2, 8).toUpperCase();

            await db.query(
                'INSERT IGNORE INTO users (userId, name, username, password) VALUES (?, ?, ?, ?)',
                [userId, name, genUser, genPass]
            );
            await db.query('INSERT IGNORE INTO qr_codes (userId, qrData) VALUES (?, ?)', [userId, qrCode]);

            user = { userId, name, qr_code: qrCode };
        } else {
            user = users[0];
            // Auto-repair placeholder or missing QR code
            if (!user.qr_code || user.qr_code === 'placeholder') {
                user.qr_code = await QRCode.toDataURL(`${baseUrl}/user/${userId}`);
                const [hasQr] = await db.query('SELECT id FROM qr_codes WHERE userId = ?', [userId]);
                if (hasQr.length > 0) {
                    await db.query('UPDATE qr_codes SET qrData = ? WHERE userId = ?', [user.qr_code, userId]);
                } else {
                    await db.query('INSERT INTO qr_codes (userId, qrData) VALUES (?, ?)', [userId, user.qr_code]);
                }
            }
        }

        const [history] = await db.query(
            'SELECT heartRate, temperature, spo2, status, created_at FROM health_records WHERE userId = ? ORDER BY created_at DESC',
            [userId]
        );

        const latest = history.length > 0 ? history[0] : null;

        res.json({ user, latest, history });
    } catch (err) {
        console.error('GET /api/health/:userId error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
