const db = require('./config/db');

const INTERVAL_MS = 5000;

function getRandomValue(min, max) {
    return Math.random() * (max - min) + min;
}

function calculateStatus(heartRate, temperature, spo2) {
    const isHrNormal    = heartRate >= 60 && heartRate <= 100;
    const isTempNormal  = temperature >= 36.0 && temperature <= 37.5;
    const isSpo2Normal  = spo2 >= 95;

    const isHrCritical   = heartRate < 50 || heartRate >= 120;
    const isTempCritical = temperature < 35.0 || temperature >= 39.0;
    const isSpo2Critical = spo2 < 90;

    if (isHrCritical || isTempCritical || isSpo2Critical) return 'Critical';
    if (!isHrNormal || !isTempNormal || !isSpo2Normal) return 'Risk';
    return 'Normal';
}

function startSimulation() {
    console.log(`[SIMULATOR] Starting background simulation (Tick: ${INTERVAL_MS}ms)`);

    setInterval(async () => {
        try {
            const [users] = await db.query('SELECT userId FROM users');
            if (users.length === 0) return;

            for (const user of users) {
                const heartRate  = Math.floor(getRandomValue(55, 130));
                const temperature = parseFloat(getRandomValue(35.0, 39.5).toFixed(1));
                const spo2       = Math.floor(getRandomValue(88, 100));
                const status     = calculateStatus(heartRate, temperature, spo2);

                await db.query(
                    'INSERT INTO health_records (userId, heartRate, temperature, spo2, status) VALUES (?, ?, ?, ?, ?)',
                    [user.userId, heartRate, temperature, spo2, status]
                );
            }

            console.log(`[SIMULATOR] Inserted new biometric data for ${users.length} user(s).`);
        } catch (error) {
            console.error('[SIMULATOR] DB error:', error.message);
        }
    }, INTERVAL_MS);
}

module.exports = { startSimulation };
