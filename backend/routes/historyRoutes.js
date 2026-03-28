const express = require('express');
const router = express.Router();
const db = require('../config/db');

// @route   GET /api/history/:userId
// @desc    Get all health records for user (including spo2)
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const [history] = await db.query(
            'SELECT heartRate, temperature, spo2, status, created_at FROM health_records WHERE userId = ? ORDER BY created_at DESC',
            [userId]
        );

        res.json(history);

    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
