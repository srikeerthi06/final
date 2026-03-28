const express = require('express');
const router = express.Router();
const db = require('../config/db');
const QRCode = require('qrcode');


// ── POST /api/health/scan ─────────────────────────────────────────
router.post('/scan', async (req, res) => {
    try {
        const { userId, heartRate, temperature, spo2 } = req.body;

        if (!userId || heartRate == null || temperature == null || spo2 == null) {
            return res.status(400).json({ error: 'Provide userId, heartRate, temperature, spo2' });
        }

        const [users] = await db.query(
            'SELECT userId FROM users WHERE userId = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Status logic
        const isHrNormal   = heartRate >= 60 && heartRate <= 100;
        const isTempNormal = temperature >= 36.0 && temperature <= 37.5;
        const isSpo2Normal = spo2 >= 95;

        const isCritical =
            heartRate < 50 || heartRate >= 120 ||
            temperature < 35.0 || temperature >= 39.0 ||
            spo2 < 90;

        let status = 'Normal';
        if (isCritical) status = 'Critical';
        else if (!isHrNormal || !isTempNormal || !isSpo2Normal) status = 'Risk';

        await db.query(
            `INSERT INTO health_records 
            (userId, heartRate, temperature, spo2, status) 
            VALUES (?, ?, ?, ?, ?)`,
            [userId, heartRate, temperature, spo2, status]
        );

        res.status(201).json({
            message: 'Scan recorded',
            status
        });

    } catch (err) {
        console.error('SCAN ERROR:', err);
        res.status(500).json({ error: 'Server error' });
    }
});


// ── GET /api/health/:userId ───────────────────────────────────────
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const host = req.headers['x-forwarded-host'] || req.get('host');
        const baseUrl = "https://69c7c2e731c80ca6905f9b38--iridescent-pika-b7e89b.netlify.app";

        // Get user
        const [users] = await db.query(
            `SELECT u.userId, u.name, q.qrData AS qr_code 
             FROM users u 
             LEFT JOIN qr_codes q ON u.userId = q.userId 
             WHERE u.userId = ?`,
            [userId]
        );

        let user;

        // Auto-create user if not exists
        if (users.length === 0) {
            const name = `Patient ${userId}`;
            const qrCode = await QRCode.toDataURL(`${baseUrl}/user/${userId}`);

            await db.query(
                'INSERT INTO users (userId, name) VALUES (?, ?)',
                [userId, name]
            );

            await db.query(
                'INSERT INTO qr_codes (userId, qrData) VALUES (?, ?)',
                [userId, qrCode]
            );

            user = { userId, name, qr_code: qrCode };

        } else {
            user = users[0];

            // Fix missing QR
            if (!user.qr_code) {
                const qrCode = await QRCode.toDataURL(`${baseUrl}/user/${userId}`);

                await db.query(
                    'INSERT INTO qr_codes (userId, qrData) VALUES (?, ?) ON DUPLICATE KEY UPDATE qrData = ?',
                    [userId, qrCode, qrCode]
                );

                user.qr_code = qrCode;
            }
        }

        // Get health history
        const [history] = await db.query(
            `SELECT heartRate, temperature, spo2, status, created_at 
             FROM health_records 
             WHERE userId = ? 
             ORDER BY created_at DESC`,
            [userId]
        );

        const latest = history.length > 0 ? history[0] : null;

        res.json({
            user,
            latest,
            history
        });

    } catch (err) {
        console.error('GET ERROR:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;