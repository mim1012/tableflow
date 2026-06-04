-- Keep authenticated tenant scope limited to stores that are operational.
-- Superadmins can still inspect every store through superadmin tooling, but
-- ordinary admin RLS reads/writes must not cross into suspended or expired stores.

CREATE OR REPLACE FUNCTION public.my_store_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM stores
  WHERE (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'

  UNION

  SELECT sm.store_id
  FROM store_members sm
  JOIN stores s ON s.id = sm.store_id
  WHERE sm.user_id = auth.uid()
    AND sm.is_active = true
    AND s.is_active = true
    AND (s.subscription_end IS NULL OR s.subscription_end >= (now() AT TIME ZONE 'Asia/Seoul')::date)
$$;

CREATE OR REPLACE FUNCTION public.my_store_role(p_store_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin' THEN 'owner'
    ELSE (
      SELECT sm.role
      FROM store_members sm
      JOIN stores s ON s.id = sm.store_id
      WHERE sm.store_id = p_store_id
        AND sm.user_id = auth.uid()
        AND sm.is_active = true
        AND s.is_active = true
        AND (s.subscription_end IS NULL OR s.subscription_end >= (now() AT TIME ZONE 'Asia/Seoul')::date)
      LIMIT 1
    )
  END
$$;
