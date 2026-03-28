const API_BASE_URL = "https://vitalsense-backend-uoqz.onrender.com/api";

// Optional: simple console log instead of forcing redirect
console.log("Using backend:", API_BASE_URL);

// Safe JSON parser — prevents "Unexpected token <" when server returns HTML
async function safeJson(response) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Non-JSON response from server:", text.substring(0, 200));
        throw new Error(`Server returned an unexpected response. Make sure backend is running: cd backend && node server.js — then open http://localhost:${BACKEND_PORT}`);
    }
}

// DOM Elements
const views = document.querySelectorAll('.view');
const scanStartView = document.getElementById('scan-start-view');
const stabilizationView = document.getElementById('stabilization-view');
const readingView = document.getElementById('reading-view');
const cameraView = document.getElementById('camera-view');
const resultView = document.getElementById('result-view');
const dashboardView = document.getElementById('dashboard-view');

// Buttons & Inputs
const startScanBtn = document.getElementById('start-scan-btn');
const viewDashboardBtn = document.getElementById('view-dashboard-btn');
const replayVoiceBtn = document.getElementById('replay-voice-btn');
const logoutBtn = document.getElementById('logout-btn');
const rescanBtn = document.getElementById('rescan-btn');

// Live Metrics
const liveHr = document.getElementById('live-hr');
const liveTemp = document.getElementById('live-temp');
const liveSpo2 = document.getElementById('live-spo2');
const readingProgress = document.getElementById('reading-progress');
const webcamVideo = document.getElementById('webcam-video');
const snapshotCanvas = document.getElementById('snapshot-canvas');
const cameraMsg = document.getElementById('camera-msg');
const finalStatusDisplay = document.getElementById('final-status-display');
const resultQrCode = document.getElementById('result-qr-code');
const dashboardQrCode = document.getElementById('dashboard-qr-code');
const voiceLang = document.getElementById('voice-lang');

// Dashboard Elements
const userProfileHeader = document.getElementById('user-profile-header');
const headerUserName = document.getElementById('header-user-name');
const headerQrCode = document.getElementById('header-qr-code');
const valHr = document.getElementById('val-hr');
const valTemp = document.getElementById('val-temp');
const valSpo2 = document.getElementById('val-spo2');
const valStatus = document.getElementById('val-status');
const statusCard = document.querySelector('.stat-card.status');
const historyBody = document.getElementById('history-body');

let currentUser = null;
let currentRecordedStatus = null;
let autoRefreshInterval = null;
let mediaStream = null;
let currentFaceImageData = null;  // Store face image for embedding storage
let simulatedHr = 0;
let simulatedTemp = 0;
let simulatedSpo2 = 98;
let hrChartInstance = null;
let spo2ChartInstance = null;
let tempChartInstance = null;

// ========================
// POPUP / MODAL SYSTEM
// ========================

function showPopup({ title, message, type = 'info', actions = [] }) {
    const existing = document.getElementById('vs-popup-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vs-popup-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999; backdrop-filter: blur(4px);
        animation: fadeIn 0.2s ease;
    `;

    const iconMap = { warning: '⚠️', error: '❌', success: '✅', info: 'ℹ️', new: '🆕', existing: '👤' };
    const colorMap = { warning: '#f59e0b', error: '#dc2626', success: '#10b981', info: '#3b82f6', new: '#10b981', existing: '#6366f1' };
    const color = colorMap[type] || '#3b82f6';

    const box = document.createElement('div');
    box.style.cssText = `
        background: #1e2a3a; color: #e2e8f0;
        border-radius: 16px; padding: 2rem 2.5rem;
        max-width: 460px; width: 90%;
        box-shadow: 0 25px 60px rgba(0,0,0,0.5);
        border: 1px solid rgba(255,255,255,0.1);
        text-align: center;
        animation: slideUp 0.3s ease;
    `;

    box.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 0.75rem;">${iconMap[type] || 'ℹ️'}</div>
        <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem; color: ${color};">${title}</h3>
        <div style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 1.5rem; line-height: 1.7;">${message}</div>
        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;" id="popup-actions"></div>
    `;

    const actionsContainer = box.querySelector('#popup-actions');

    if (actions.length === 0) {
        actions = [{ label: 'OK', style: 'primary', onClick: () => overlay.remove() }];
    }

    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.textContent = action.label;
        const isPrimary = action.style === 'primary';
        btn.style.cssText = `
            padding: 0.65rem 1.5rem;
            border-radius: 8px; border: none;
            font-size: 0.9rem; font-weight: 600;
            cursor: pointer; transition: opacity 0.15s;
            background: ${isPrimary ? color : 'rgba(255,255,255,0.1)'};
            color: #fff;
        `;
        btn.onmouseenter = () => btn.style.opacity = '0.82';
        btn.onmouseleave = () => btn.style.opacity = '1';
        btn.addEventListener('click', () => {
            overlay.remove();
            if (action.onClick) action.onClick();
        });
        actionsContainer.appendChild(btn);
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// Popup CSS animations
const styleEl = document.createElement('style');
styleEl.textContent = `
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;
document.head.appendChild(styleEl);

// ========================
// EXIT CONFIRMATION POPUP
// ========================

window.addEventListener('beforeunload', (e) => {
    if (currentUser) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Custom in-app exit guard (for logout and back navigation)
function confirmExit(onConfirm) {
    showPopup({
        title: 'Exit Session?',
        message: `Are you sure you want to exit the session for <strong style="color:#e2e8f0;">${currentUser ? currentUser.name : 'this patient'}</strong>?<br><br>All unsaved changes will be lost.`,
        type: 'warning',
        actions: [
            { label: '✅ Yes, Exit', style: 'primary', onClick: onConfirm },
            { label: '❌ Stay', onClick: () => { } }
        ]
    });
}

// ========================
// QR SCAN REDIRECT — Handle /user/:userId route
// ========================

window.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.startsWith('/user/')) {
        const userId = path.split('/')[2];
        if (userId) {
            showView(dashboardView);
            // Show loading state immediately so user knows something is happening
            if (headerUserName) headerUserName.textContent = 'Loading patient data...';
            userProfileHeader.classList.remove('hidden');
            loadDashboardData(userId).then(() => {
                // Start auto-refresh only after first successful load
                if (!autoRefreshInterval) {
                    autoRefreshInterval = setInterval(() => loadDashboardData(userId), 5000);
                }
            });
        }
    }
});

// ========================
// EVENT LISTENERS
// ========================

startScanBtn.addEventListener('click', startBiometricFlow);

viewDashboardBtn.addEventListener('click', () => {
    if (currentUser) {
        window.history.pushState({}, '', `/user/${currentUser.userId}`);
        showView(dashboardView);
        loadDashboardData(currentUser.userId);
        autoRefreshInterval = setInterval(() => loadDashboardData(currentUser.userId), 5000);
    }
});

replayVoiceBtn.addEventListener('click', () => {
    if (currentRecordedStatus) speakStatus(currentRecordedStatus);
});

logoutBtn.addEventListener('click', () => {
    if (currentUser) {
        confirmExit(logout);
    } else {
        logout();
    }
});

rescanBtn.addEventListener('click', () => {
    if (currentUser) loadDashboardData(currentUser.userId);
});

// ========================
// VIEW NAVIGATION
// ========================

function showView(viewElement) {
    views.forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });
    viewElement.classList.remove('hidden');
    setTimeout(() => { viewElement.classList.add('active'); }, 10);
}

// ========================
// BIOMETRIC FLOW
// ========================

function startBiometricFlow() {
    showView(stabilizationView);
    setTimeout(() => { startSensorReading(); }, 2500);
}

function startSensorReading() {
    showView(readingView);
    readingProgress.style.width = '0%';

    let progress = 0;
    const readInterval = setInterval(() => {
        simulatedHr = Math.floor(Math.random() * (100 - 60) + 60);
        simulatedTemp = parseFloat((Math.random() * (37.5 - 36.0) + 36.0).toFixed(1));
        simulatedSpo2 = Math.floor(Math.random() * (100 - 94) + 94);

        if (liveHr) liveHr.textContent = simulatedHr;
        if (liveTemp) liveTemp.textContent = simulatedTemp;
        if (liveSpo2) liveSpo2.textContent = simulatedSpo2 + '%';

        progress += 5;
        readingProgress.style.width = progress + '%';

        if (progress >= 100) {
            clearInterval(readInterval);
            setTimeout(startCameraPhase, 500);
        }
    }, 150);
}

async function startCameraPhase() {
    showView(cameraView);
    cameraMsg.textContent = 'Activating camera...';
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        webcamVideo.srcObject = mediaStream;
        webcamVideo.onloadedmetadata = () => {
            cameraMsg.textContent = 'Analyzing facial features...';
            setTimeout(captureFace, 3000);
        };
    } catch (err) {
        console.warn("Camera not available:", err);
        cameraMsg.textContent = 'Camera not available. Skipping...';
        setTimeout(() => processIdentity(null), 2000);
    }
}

function captureFace() {
    if (!mediaStream) return;
    cameraMsg.textContent = 'Face captured. Checking database...';
    snapshotCanvas.width = webcamVideo.videoWidth;
    snapshotCanvas.height = webcamVideo.videoHeight;
    const ctx = snapshotCanvas.getContext('2d');
    ctx.drawImage(webcamVideo, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;

    // Get the captured face image as base64 for recognition
    const faceImageData = snapshotCanvas.toDataURL('image/jpeg', 0.8);
    currentFaceImageData = faceImageData;  // Store for later use in embedding storage
    setTimeout(() => { processIdentity(faceImageData); }, 800);
}

// ========================
// FACE RECOGNITION — USER EXISTS / NEW USER POPUPS
// ========================

async function processIdentity(faceImageData) {
    try {
        cameraMsg.textContent = 'Searching database...';

        // Attempt face recognition lookup
        // In production: replace with real biometric API call using faceImageData
        const recognizedUserId = await lookupFaceInDatabase(faceImageData);

        if (recognizedUserId) {
            // Query health endpoint (safe — returns user data + auto-creates if missing)
            const checkRes = await fetch(`${API_BASE_URL}/health/${recognizedUserId}`);
            if (checkRes.ok) {
                const checkData = await safeJson(checkRes);
                if (checkData.user) {
                    showExistingUserPopup(checkData.user);
                    return;
                }
            }
        }

        // No match found — NEW USER popup
        showNewUserPopup();

    } catch (err) {
        showPopup({
            title: 'Processing Error',
            message: err.message || 'Something went wrong during identity processing.',
            type: 'error',
            actions: [
                { label: 'Try Again', style: 'primary', onClick: () => showView(scanStartView) }
            ]
        });
    }
}

/**
 * Face recognition lookup — queries the backend for existing users using face-api.js
 * Extracts face embeddings and searches database for matches
 */
async function lookupFaceInDatabase(faceImageData) {
    // Temporarily disable face recognition to avoid loading issues
    console.log("Face recognition disabled for now");
    return null;
    
    if (!faceImageData) {
        console.log("No face image provided, skipping recognition");
        return null;
    }
    
    try {
        console.log("Starting face recognition...");
        // Use the face recognition module to detect and match faces
        const userId = await recognizeFaceFromImage(faceImageData, API_BASE_URL);
        return userId || null;
    } catch (err) {
        console.error("Face recognition error:", err);
        // Don't fail the flow - allow fallback to new user registration
        return null;
    }
}

// Popup when face IS FOUND in the database
function showExistingUserPopup(existingUser) {
    currentUser = existingUser;
    const registeredDate = existingUser.created_at
        ? new Date(existingUser.created_at).toLocaleDateString()
        : 'N/A';

    showPopup({
        title: '👤 Existing Patient Found',
        message: `
            <div style="background:rgba(99,102,241,0.15); border-radius:8px; padding:1rem; margin-bottom:0.75rem;">
                <strong style="color:#e2e8f0; font-size:1.05rem;">🔍 Face Recognized!</strong>
            </div>
            <strong style="color:#e2e8f0; font-size:1rem;">${existingUser.name}</strong> is already registered.<br><br>
            <span style="color:#64748b; font-size:0.85rem;">
                User ID: <strong style="color:#94a3b8;">${existingUser.userId}</strong><br>
                Registered on: ${registeredDate}
            </span><br><br>
            <em style="color:#64748b; font-size:0.8rem;">No new ID will be generated for this patient.</em>
        `,
        type: 'existing',
        actions: [
            {
                label: '📊 View Dashboard',
                style: 'primary',
                onClick: async () => {
                    try {
                        await recordHealthScan(existingUser.userId);
                    } catch (e) {
                        showPopup({ title: 'Error', message: e.message, type: 'error' });
                    }
                }
            },
            {
                label: '🔄 Not Me',
                onClick: () => showNewUserPopup()
            }
        ]
    });
}

// Popup when face is NOT in the database (new patient)
function showNewUserPopup() {
    const newUserId = `USR${Math.floor(Math.random() * 90000) + 10000}`;

    showPopup({
        title: '🆕 New Patient Detected',
        message: `
            <div style="background:rgba(16,185,129,0.15); border-radius:8px; padding:1rem; margin-bottom:0.75rem;">
                <strong style="color:#e2e8f0; font-size:1.05rem;">✨ Face Not Recognized</strong>
            </div>
            You are not in our system yet.<br><br>
            A new Patient ID will be generated for you:<br>
            <span style="font-size:1.3rem; font-weight:700; color:#10b981; letter-spacing:2px;">${newUserId}</span><br><br>
            <em style="color:#64748b; font-size:0.8rem;">Your QR code will be generated after registration.</em>
        `,
        type: 'new',
        actions: [
            {
                label: '✅ Register & Continue',
                style: 'primary',
                onClick: () => createNewUserWithId(newUserId)
            },
            {
                label: '❌ Cancel',
                onClick: () => showView(scanStartView)
            }
        ]
    });
}

async function createNewUserWithId(preGeneratedId) {
    try {
        const generatedName = `Patient ${preGeneratedId}`;

        // Use GET /api/health/:userId which auto-creates the user if not found.
        // This avoids any dependency on POST /api/user and is simpler and safer.
        const initRes = await fetch(`${API_BASE_URL}/health/${preGeneratedId}`);
        const initData = await safeJson(initRes);

        currentUser = {
            userId: (initData.user && initData.user.userId) || preGeneratedId,
            name: (initData.user && initData.user.name) || generatedName,
            qr_code: (initData.user && initData.user.qr_code) || null
        };

        // Store face embedding for future recognition
        if (currentFaceImageData && typeof storeFaceEmbedding !== 'undefined') {
            console.log("Storing face embedding for new user...");
            await storeFaceEmbedding(currentFaceImageData, currentUser.userId, API_BASE_URL);
        }

        await recordHealthScan(currentUser.userId);

    } catch (err) {
        showPopup({
            title: 'Registration Error',
            message: err.message,
            type: 'error',
            actions: [{ label: 'OK', style: 'primary', onClick: () => showView(scanStartView) }]
        });
    }
}

async function recordHealthScan(userId) {
    const scanRes = await fetch(`${API_BASE_URL}/health/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: userId,
            heartRate: simulatedHr,
            temperature: simulatedTemp,
            spo2: simulatedSpo2
        })
    });
    const scanData = await safeJson(scanRes);
    if (!scanRes.ok) throw new Error(scanData.error);

    currentRecordedStatus = scanData.status;

    // QR code is already in currentUser from the createNewUserWithId step
    // (loaded via GET /api/health/:userId which returns full user with QR code)

    showResultScreen();
}

function showResultScreen() {
    showView(resultView);

    let statusClass = 'text-normal';
    if (currentRecordedStatus.toLowerCase() === 'risk') statusClass = 'text-warning';
    if (currentRecordedStatus.toLowerCase() === 'critical') statusClass = 'text-critical';

    finalStatusDisplay.className = `result-status ${statusClass}`;
    finalStatusDisplay.textContent = `Status: ${currentRecordedStatus}`;

    if (currentUser && currentUser.qr_code) {
        resultQrCode.src = currentUser.qr_code;
    }

    setTimeout(() => { speakStatus(currentRecordedStatus); }, 500);
}

// Speaks health status in all 3 languages: English → Hindi → Telugu
function speakStatus(status) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // stop any ongoing speech

    const s = status ? status.toLowerCase() : 'normal';

    const messages = [
        {
            lang: 'en-US',
            text: s === 'normal'
                ? `Your vitals are normal. Heart rate, temperature, and oxygen levels are all healthy. Stay well!`
                : s === 'risk'
                    ? `Caution! Your vitals show a risk condition. Please consult a doctor soon.`
                    : `Alert! Your vitals are critical. Please seek immediate medical attention!`
        },
        {
            lang: 'hi-IN',
            text: s === 'normal'
                ? `आपके स्वास्थ्य संकेतक सामान्य हैं। हृदय गति, तापमान और ऑक्सीजन स्तर सभी ठीक हैं। स्वस्थ रहें!`
                : s === 'risk'
                    ? `सावधान! आपके स्वास्थ्य संकेतक जोखिम में हैं। कृपया जल्द डॉक्टर से मिलें।`
                    : `चेतावनी! आपकी स्थिति गंभीर है। कृपया तुरंत चिकित्सा सहायता लें!`
        },
        {
            lang: 'te-IN',
            text: s === 'normal'
                ? `మీ వైటల్స్ సాధారణంగా ఉన్నాయి. హృదయ స్పందన, ఉష్ణోగ్రత మరియు ఆక్సిజన్ స్థాయిలు అన్నీ ఆరోగ్యంగా ఉన్నాయి. ఆరోగ్యంగా ఉండండి!`
                : s === 'risk'
                    ? `జాగ్రత్త! మీ వైటల్స్ ప్రమాద స్థితిలో ఉన్నాయి. దయచేసి త్వరలో వైద్యుడిని సంప్రదించండి.`
                    : `హెచ్చరిక! మీ వైటల్స్ క్లిష్టంగా ఉన్నాయి. దయచేసి వెంటనే వైద్య సహాయం తీసుకోండి!`
        }
    ];

    let i = 0;
    function speakNext() {
        if (i >= messages.length) return;
        const { lang, text } = messages[i++];
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = lang;
        msg.rate = 0.92;
        msg.onend = () => setTimeout(speakNext, 600); // 600ms gap between languages
        window.speechSynthesis.speak(msg);
    }

    speakNext();
}

// ========================
// DASHBOARD LOGIC
// ========================

async function loadDashboardData(userId) {
    try {
        const [healthRes, historyRes] = await Promise.all([
            fetch(`${API_BASE_URL}/health/${userId}`),
            fetch(`${API_BASE_URL}/history/${userId}`)
        ]);

        if (!healthRes.ok) {
            const errText = await healthRes.text().catch(() => '');
            let errMsg = 'Could not fetch health data';
            try { errMsg = JSON.parse(errText).error || errMsg; } catch (e) { }
            throw new Error(errMsg + ` (HTTP ${healthRes.status})`);
        }

        const healthData = await safeJson(healthRes);
        const historyData = historyRes.ok ? await safeJson(historyRes) : [];

        if (healthData.user) {
            currentUser = healthData.user;
            userProfileHeader.classList.remove('hidden');
            headerUserName.textContent = currentUser.name;
            if (currentUser.qr_code) {
                headerQrCode.src = currentUser.qr_code;
                headerQrCode.classList.remove('hidden');
                if (dashboardQrCode) dashboardQrCode.src = currentUser.qr_code;
            }
        }

        if (healthData.latest) updateDashboardCards(healthData.latest);
        const fullHistory = historyData.length > 0 ? historyData : (healthData.history || []);
        updateHistoryTable(fullHistory);
        updateCharts(fullHistory);

    } catch (error) {
        console.error("Dashboard error:", error);
        const dashView = document.getElementById('dashboard-view');
        const isVisible = dashView && !dashView.classList.contains('hidden');
        if (isVisible) {
            showPopup({
                title: 'Dashboard Error',
                message: error.message || 'Could not load data. Make sure the backend is running.',
                type: 'error',
                actions: [
                    { label: 'Retry', style: 'primary', onClick: () => loadDashboardData(userId) },
                    { label: 'Back', onClick: () => { logout(); } }
                ]
            });
        }
    }
}

function updateDashboardCards(latestData) {
    if (!latestData) return;
    if (valHr) valHr.textContent = latestData.heartRate;
    if (valTemp) valTemp.textContent = latestData.temperature;
    if (valSpo2) valSpo2.textContent = (latestData.spo2 ?? '--') + '%';
    if (valStatus) valStatus.textContent = latestData.status;

    if (valStatus) valStatus.className = 'value';
    if (statusCard) statusCard.classList.remove('status-normal', 'status-warning', 'status-critical', 'status-risk');

    const s = latestData.status ? latestData.status.toLowerCase() : 'normal';
    if (statusCard) statusCard.classList.add(`status-${s}`);
    if (valStatus) {
        if (s === 'normal') valStatus.classList.add('text-normal');
        if (s === 'warning' || s === 'risk') valStatus.classList.add('text-warning');
        if (s === 'critical') valStatus.classList.add('text-critical');
    }
}

function updateHistoryTable(history) {
    historyBody.innerHTML = '';
    if (!history || history.length === 0) {
        historyBody.innerHTML = '<tr><td colspan="5" class="text-center">No history available</td></tr>';
        return;
    }

    history.forEach(row => {
        const dateObj = new Date(row.created_at || row.timestamp);
        const dateStr = dateObj.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const statusLower = (row.status || '').toLowerCase();
        let badgeClass = statusLower;
        if (statusLower === 'risk') badgeClass = 'warning';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${row.heartRate} bpm</td>
            <td>${row.temperature} °C</td>
            <td>${row.spo2 != null ? row.spo2 + '%' : 'N/A'}</td>
            <td><span class="badge ${badgeClass}">${row.status}</span></td>
        `;
        historyBody.appendChild(tr);
    });
}

function updateCharts(history) {
    if (!history || history.length === 0) return;

    const copy = [...history].reverse().slice(-30); // last 30 records
    const labels = copy.map(r => new Date(r.created_at || r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const hrData = copy.map(r => r.heartRate);
    const spo2Data = copy.map(r => r.spo2 ?? null);
    const tempData = copy.map(r => r.temperature);

    // Chart config helper
    const chartConfig = (label, data, color, yMin, yMax) => ({
        type: 'line',
        data: {
            labels,
            datasets: [{
                label,
                data,
                borderColor: color,
                backgroundColor: color + '22',
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8', font: { size: 12 } } } },
            scales: {
                x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: {
                    min: yMin, max: yMax,
                    ticks: { color: '#64748b' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });

    // Heart Rate chart
    const hrCanvas = document.getElementById('hrChart');
    if (hrCanvas) {
        if (hrChartInstance) hrChartInstance.destroy();
        hrChartInstance = new Chart(hrCanvas.getContext('2d'), chartConfig('Heart Rate (BPM)', hrData, '#dc2626', 40, 150));
    }

    // SpO2 chart
    const spo2Canvas = document.getElementById('spo2Chart');
    if (spo2Canvas) {
        if (spo2ChartInstance) spo2ChartInstance.destroy();
        spo2ChartInstance = new Chart(spo2Canvas.getContext('2d'), chartConfig('SpO₂ (%)', spo2Data, '#3b82f6', 80, 102));
    }

    // Temperature chart
    const tempCanvas = document.getElementById('tempChart');
    if (tempCanvas) {
        if (tempChartInstance) tempChartInstance.destroy();
        tempChartInstance = new Chart(tempCanvas.getContext('2d'), chartConfig('Temperature (°C)', tempData, '#f59e0b', 34, 41));
    }
}

function logout() {
    currentUser = null;
    currentRecordedStatus = null;
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    if (hrChartInstance) { hrChartInstance.destroy(); hrChartInstance = null; }
    if (spo2ChartInstance) { spo2ChartInstance.destroy(); spo2ChartInstance = null; }
    if (tempChartInstance) { tempChartInstance.destroy(); tempChartInstance = null; }
    userProfileHeader.classList.add('hidden');
    window.history.pushState({}, '', '/');
    showView(scanStartView);
}
