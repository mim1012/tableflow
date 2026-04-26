-- Add per-store waiting ETA setting used by waiting 알림톡 runtime mapping
ALTER TABLE store_settings
ADD COLUMN waiting_minutes_per_team int NOT NULL DEFAULT 5 CHECK (waiting_minutes_per_team >= 0);
