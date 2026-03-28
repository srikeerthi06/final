/**
 * Face Recognition Module
 * Handles loading face-api.js models, detecting faces, and generating embeddings
 */

let faceapiReady = false;
let modelsLoaded = false;

// Initialize face-api.js models
async function initializeFaceAPI() {
    if (modelsLoaded) return true;
    
    try {
        console.log("Loading face-api.js models...");
        
        // Path to the models directory
        const modelPath = '/models/face-api.js-models/';
        
        // Timeout promise
        const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Model loading timeout")), 10000) // 10 second timeout
        );
        
        // Load all required models with timeout
        await Promise.race([
            Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
                faceapi.nets.faceLandmark68.loadFromUri(modelPath),
                faceapi.nets.faceExpressionNet.loadFromUri(modelPath),
                faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
                faceapi.nets.ageGenderNet.loadFromUri(modelPath)
            ]),
            timeout
        ]);
        
        modelsLoaded = true;
        faceapiReady = true;
        console.log("✅ Face-api.js models loaded successfully");
        return true;
    } catch (err) {
        console.error("❌ Failed to load face-api.js models:", err);
        faceapiReady = false;
        return false;
    }
}

/**
 * Detect faces in an image and extract face embeddings
 * @param {HTMLImageElement|HTMLCanvasElement} image - The image to analyze
 * @returns {Promise<Array>} Array of face detections with embeddings
 */
async function detectFacesWithEmbeddings(image) {
    if (!faceapiReady) {
        const ready = await initializeFaceAPI();
        if (!ready) throw new Error("Face-api.js models failed to load");
    }
    
    try {
        // Detect faces with landmarks for better accuracy
        const detections = await faceapi
            .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptors();
        
        console.log(`Found ${detections.length} face(s)`);
        return detections;
    } catch (err) {
        console.error("Face detection error:", err);
        throw new Error("Face detection failed: " + err.message);
    }
}

/**
 * Get the strongest face detection (largest face in image)
 * @param {Array} detections - Array of face detections
 * @returns {Object|null} The strongest detection or null
 */
function getStrongestFaceDetection(detections) {
    if (!detections || detections.length === 0) return null;
    
    // Find the largest face (by bounding box area)
    return detections.reduce((strongest, detection) => {
        const currentArea = detection.detection.box.width * detection.detection.box.height;
        const strongestArea = strongest.detection.box.width * strongest.detection.box.height;
        return currentArea > strongestArea ? detection : strongest;
    });
}

/**
 * Convert face descriptor to fixed array for storage
 * @param {Float32Array} descriptor - Face descriptor from face-api.js
 * @returns {Array<number>} Plain array representation
 */
function descriptorToArray(descriptor) {
    return Array.from(descriptor);
}

/**
 * Calculate Euclidean distance between two descriptors
 * Lower distance = more similar faces
 * @param {Array<number>} descriptor1 
 * @param {Array<number>} descriptor2 
 * @returns {number} Euclidean distance
 */
function calculateFaceDistance(descriptor1, descriptor2) {
    if (!descriptor1 || !descriptor2) return Infinity;
    
    let sum = 0;
    for (let i = 0; i < descriptor1.length; i++) {
        const diff = descriptor1[i] - descriptor2[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

/**
 * Extract face embeddings from canvas/image and send to backend for recognition
 * @param {string} faceImageBase64 - Base64 encoded JPEG image
 * @param {string} backendApiUrl - Base URL for API calls
 * @returns {Promise<string|null>} User ID if match found, null otherwise
 */
async function recognizeFaceFromImage(faceImageBase64, backendApiUrl) {
    try {
        // Create image element from base64
        const img = new Image();
        img.src = faceImageBase64;
        
        // Wait for image to load
        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Failed to load face image"));
        });
        
        // Detect faces and extract embeddings
        const detections = await detectFacesWithEmbeddings(img);
        
        if (!detections || detections.length === 0) {
            console.warn("No faces detected in image");
            return null;
        }
        
        // Get the strongest face
        const strongestFace = getStrongestFaceDetection(detections);
        if (!strongestFace || !strongestFace.descriptor) {
            console.warn("Could not extract face descriptor");
            return null;
        }
        
        // Convert descriptor to array for transmission
        const embedding = descriptorToArray(strongestFace.descriptor);
        
        console.log("Face embedding extracted, length:", embedding.length);
        
        // Send to backend for matching
        const response = await fetch(`${backendApiUrl}/user/recognize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embedding: embedding,
                imageBase64: faceImageBase64  // Optional: for backend logging/debugging
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            console.error("Backend recognition error:", result.error);
            return null;
        }
        
        if (result.userId) {
            console.log("✅ Face match found! User ID:", result.userId);
            return result.userId;
        }
        
        console.log("Face not recognized in database");
        return null;
        
    } catch (err) {
        console.error("Face recognition error:", err);
        // Don't throw - allow the flow to continue with new user registration
        return null;
    }
}

/**
 * Generate and store face embedding for a new user
 * @param {string} faceImageBase64 - Base64 encoded JPEG image
 * @param {string} userId - The user ID to associate with this face
 * @param {string} backendApiUrl - Base URL for API calls
 * @returns {Promise<boolean>} True if embedding stored successfully
 */
async function storeFaceEmbedding(faceImageBase64, userId, backendApiUrl) {
    try {
        // Create image element from base64
        const img = new Image();
        img.src = faceImageBase64;
        
        // Wait for image to load
        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Failed to load face image"));
        });
        
        // Detect faces and extract embeddings
        const detections = await detectFacesWithEmbeddings(img);
        
        if (!detections || detections.length === 0) {
            console.warn("No faces detected in image");
            return false;
        }
        
        // Get the strongest face
        const strongestFace = getStrongestFaceDetection(detections);
        if (!strongestFace || !strongestFace.descriptor) {
            console.warn("Could not extract face descriptor");
            return false;
        }
        
        // Convert descriptor to array
        const embedding = descriptorToArray(strongestFace.descriptor);
        
        console.log("Storing face embedding for user:", userId);
        
        // Send to backend to store embedding
        const response = await fetch(`${backendApiUrl}/user/store-embedding`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                embedding: embedding,
                imageBase64: faceImageBase64  // Optional: for backend logging
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            console.error("Failed to store embedding:", result.error);
            return false;
        }
        
        console.log("✅ Face embedding stored successfully for user:", userId);
        return true;
        
    } catch (err) {
        console.error("Error storing face embedding:", err);
        return false;
    }
}

// Auto-initialize models on page load if face-api is available
if (typeof faceapi !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log("Face-api.js detected, initializing models...");
        initializeFaceAPI().catch(err => console.error("Failed to initialize face-api:", err));
    });
}

console.log("✅ Face Recognition module loaded");
