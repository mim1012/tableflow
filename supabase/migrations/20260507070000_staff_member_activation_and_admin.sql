-- ============================================================
-- Migration: 20260507070000_staff_member_activation_and_admin
-- Add store_members.is_active and ensure inactive members lose app access
-- ============================================================

ALTER TABLE store_members
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE store_members
SET is_active = true
WHERE is_active IS NULL;

CREATE OR REPLACE FUNCTION my_store_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM stores
  WHERE (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  UNION
  SELECT store_id
  FROM store_members
  WHERE user_id = auth.uid()
    AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION my_store_role(p_store_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
    THEN 'owner'
    ELSE (
      SELECT sm.role
      FROM store_members sm
      WHERE sm.store_id = p_store_id
        AND sm.user_id = auth.uid()
        AND sm.is_active = true
      LIMIT 1
    )
  END;
$$;
