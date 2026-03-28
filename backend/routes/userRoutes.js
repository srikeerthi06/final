const express = require('express');
const router = express.Router();
const db = require('../config/db');
const QRCode = require('qrcode');

function buildBaseUrl(req) {
    const origin = (req.body && req.body.origin) ? req.body.origin : null;
    if (origin) return origin;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${req.protocol}://${host}`;
}

// ── POST /api/user/auto-generate ─────────────────────────────────
// Kept for backward compatibility — generates a new user
router.post('/auto-generate', async (req, res) => {
    try {
        const userId   = `USR${Math.floor(Math.random() * 90000) + 10000}`;
        const name     = `Patient ${userId}`;
        const username = `patient.${userId.toLowerCase()}`;
        const password = Math.random().toString(36).substring(2, 8).toUpperCase();

        const baseUrl      = buildBaseUrl(req);
        const qrCodeBase64 = await QRCode.toDataURL(`${baseUrl}/user/${userId}`);

        await db.query(
            'INSERT IGNORE INTO users (userId, name, username, password) VALUES (?, ?, ?, ?)',
            [userId, name, username, password]
        );
        await db.query('INSERT IGNORE INTO qr_codes (userId, qrData) VALUES (?, ?)', [userId, qrCodeBase64]);

        res.status(201).json({ userId, name, username, password, qr_code: qrCodeBase64 });
    } catch (err) {
        console.error('auto-generate error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── POST /api/user ────────────────────────────────────────────────
// Create a new user. If userId already exists, return existing data.
router.post('/', async (req, res) => {
    try {
        const { userId, name } = req.body;

        if (!userId || !name) {
            return res.status(400).json({ error: 'Please provide userId and name' });
        }

        const baseUrl = buildBaseUrl(req);

        // Check if user already exists — return their data instead of erroring
        const [existing] = await db.query(
            'SELECT u.userId, u.name, q.qrData AS qr_code FROM users u LEFT JOIN qr_codes q ON u.userId = q.userId WHERE u.userId = ?',
            [userId]
        );

        if (existing.length > 0) {
            let qr_code = existing[0].qr_code;
            // Fix placeholder QR codes
            if (!qr_code || qr_code === 'placeholder') {
                qr_code = await QRCode.toDataURL(`${baseUrl}/user/${userId}`);
                const [hasQr] = await db.query('SELECT id FROM qr_codes WHERE userId = ?', [userId]);
                if (hasQr.length > 0) {
                    await db.query('UPDATE qr_codes SET qrData = ? WHERE userId = ?', [qr_code, userId]);
                } else {
                    await db.query('INSERT INTO qr_codes (userId, qrData) VALUES (?, ?)', [userId, qr_code]);
                }
            }
            return res.status(200).json({
                userId: existing[0].userId,
                name: existing[0].name,
                qr_code
            });
        }

        // Create new user
        const qrCodeBase64 = await QRCode.toDataURL(`${baseUrl}/user/${userId}`);
        const username = name.replace(/\s+/g, '.').toLowerCase() + Math.floor(Math.random() * 1000);
        const password = Math.random().toString(36).substring(2, 8).toUpperCase();

        await db.query(
            'INSERT INTO users (userId, name, username, password) VALUES (?, ?, ?, ?)',
            [userId, name, username, password]
        );
        await db.query('INSERT INTO qr_codes (userId, qrData) VALUES (?, ?)', [userId, qrCodeBase64]);

        res.status(201).json({ userId, name, username, password, qr_code: qrCodeBase64 });
    } catch (err) {
        console.error('POST /api/user error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── GET /api/user/:userId ─────────────────────────────────────────
// Get user profile and QR code. Auto-repairs placeholder QR codes.
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const [users] = await db.query(
            'SELECT u.userId, u.name, q.qrData AS qr_code, u.created_at FROM users u LEFT JOIN qr_codes q ON u.userId = q.userId WHERE u.userId = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        let user = users[0];

        // Auto-repair placeholder or missing QR code
        if (!user.qr_code || user.qr_code === 'placeholder') {
            const host = req.headers['x-forwarded-host'] || req.get('host');
            const baseUrl = `${req.protocol}://${host}`;
            user.qr_code = await QRCode.toDataURL(`${baseUrl}/user/${userId}`);
            const [hasQr] = await db.query('SELECT id FROM qr_codes WHERE userId = ?', [userId]);
            if (hasQr.length > 0) {
                await db.query('UPDATE qr_codes SET qrData = ? WHERE userId = ?', [user.qr_code, userId]);
            } else {
                await db.query('INSERT INTO qr_codes (userId, qrData) VALUES (?, ?)', [userId, user.qr_code]);
            }
        }

        res.json(user);
    } catch (err) {
        console.error('GET /api/user/:userId error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
