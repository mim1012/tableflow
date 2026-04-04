-- Add pax (guest count) column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pax integer NOT NULL DEFAULT 0;
