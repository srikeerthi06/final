CREATE DATABASE IF NOT EXISTS vitalsense_db;
USE vitalsense_db;

-- 1. users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    face_embedding LONGBLOB,  -- Store 128-dimensional face descriptor as JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. health_records table
CREATE TABLE IF NOT EXISTS health_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId VARCHAR(50) NOT NULL,
    heartRate INT NOT NULL,
    temperature FLOAT NOT NULL,
    spo2 INT NOT NULL DEFAULT 98,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

-- 3. qr_codes table
CREATE TABLE IF NOT EXISTS qr_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId VARCHAR(50) NOT NULL,
    qrData TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

-- FIX: Add spo2 column to existing installs (safe to run even if already exists)
ALTER TABLE health_records ADD COLUMN IF NOT EXISTS spo2 INT NOT NULL DEFAULT 98;

-- Sample Data
INSERT IGNORE INTO users (userId, name, username, password) VALUES 
('USR001', 'John Doe', 'john.doe', 'password123'),
('USR002', 'Jane Smith', 'jane.smith', 'password123'),
('12345', 'Demo User', 'demo.user', 'password123');

INSERT IGNORE INTO health_records (userId, heartRate, temperature, spo2, status) VALUES 
('USR001', 72, 36.5, 98, 'Normal'),
('USR002', 105, 38.2, 94, 'Risk'),
('12345', 125, 39.5, 90, 'Critical');

-- QR codes are generated dynamically by the server on first access
-- (placeholder rows removed — real QR codes generated via /api/user endpoint)
