-- Run this file to fix the "Unknown column 'spo2'" error
-- This adds the spo2 column to your existing health_records table

USE vitalsense_db;

-- Add spo2 column if it doesn't already exist
ALTER TABLE health_records 
ADD COLUMN IF NOT EXISTS spo2 INT NOT NULL DEFAULT 98;

-- Verify the fix worked
DESCRIBE health_records;
