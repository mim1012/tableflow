-- Fix duplicate pending staff-call races.
-- Root cause:
--   create_staff_call() validated and inserted without any per-request lock or
--   uniqueness guard, so concurrent requests for the same table/option created
--   multiple pending rows.
--
-- Strategy:
--   1) Collapse existing duplicate pending rows, keeping the oldest pending row
--      per (store_id, table_id, option_name).
--   2) Add a partial unique index as a database backstop.
--   3) Make create_staff_call() idempotent for concurrent duplicate requests by
--      using an advisory transaction lock and returning the existing pending id.

WITH ranked_pending AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY store_id, table_id, option_name
      ORDER BY requested_at ASC, id ASC
    ) AS duplicate_rank
  FROM staff_calls
  WHERE status = 'pending'
    AND table_id IS NOT NULL
), duplicates_to_resolve AS (
  SELECT id
  FROM ranked_pending
  WHERE duplicate_rank > 1
)
UPDATE staff_calls
SET
  status = 'resolved',
  resolved_at = COALESCE(resolved_at, requested_at, now())
WHERE id IN (SELECT id FROM duplicates_to_resolve);

CREATE UNIQUE INDEX IF NOT EXISTS staff_calls_pending_unique_idx
  ON staff_calls (store_id, table_id, option_name)
  WHERE status = 'pending' AND table_id IS NOT NULL;

CREATE OR REPLACE FUNCTION create_staff_call(
  p_store_id uuid,
  p_table_id uuid,
  p_option_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_call_id uuid := gen_random_uuid();
  v_existing_staff_call_id uuid;
  v_role text := auth.role();
  v_uid uuid := auth.uid();
  v_trimmed_option text;
  v_allowed_options text[];
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'store_id is required';
  END IF;

  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'table_id is required';
  END IF;

  v_trimmed_option := btrim(COALESCE(p_option_name, ''));
  IF v_trimmed_option = '' THEN
    RAISE EXCEPTION 'option_name is required';
  END IF;

  IF v_role = 'anon' THEN
    IF NOT is_store_accessible(p_store_id) THEN
      RAISE EXCEPTION 'store is not accessible';
    END IF;
  ELSIF v_uid IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM store_members
      WHERE store_id = p_store_id
        AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'no access to store';
    END IF;
  ELSE
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM tables
    WHERE id = p_table_id
      AND store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'table does not belong to store';
  END IF;

  SELECT CASE
    WHEN settings.staff_call_options IS NOT NULL AND array_length(settings.staff_call_options, 1) > 0
      THEN settings.staff_call_options
    ELSE ARRAY[
      '직원만 호출',
      '물/얼음물 주세요',
      '물티슈 주세요',
      '앞치마 주세요',
      '주문 수정할게요'
    ]::text[]
  END
  INTO v_allowed_options
  FROM (
    SELECT staff_call_options
    FROM store_settings
    WHERE store_id = p_store_id
    LIMIT 1
  ) AS settings;

  IF v_allowed_options IS NULL THEN
    v_allowed_options := ARRAY[
      '직원만 호출',
      '물/얼음물 주세요',
      '물티슈 주세요',
      '앞치마 주세요',
      '주문 수정할게요'
    ]::text[];
  END IF;

  IF NOT (v_trimmed_option = ANY(v_allowed_options)) THEN
    RAISE EXCEPTION 'invalid staff call option';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_store_id::text || ':' || p_table_id::text || ':' || v_trimmed_option, 0)
  );

  SELECT id
  INTO v_existing_staff_call_id
  FROM staff_calls
  WHERE store_id = p_store_id
    AND table_id = p_table_id
    AND option_name = v_trimmed_option
    AND status = 'pending'
  ORDER BY requested_at ASC, id ASC
  LIMIT 1;

  IF v_existing_staff_call_id IS NOT NULL THEN
    RETURN v_existing_staff_call_id;
  END IF;

  BEGIN
    INSERT INTO staff_calls (
      id,
      store_id,
      table_id,
      option_name,
      status
    ) VALUES (
      v_staff_call_id,
      p_store_id,
      p_table_id,
      v_trimmed_option,
      'pending'
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT id
    INTO v_existing_staff_call_id
    FROM staff_calls
    WHERE store_id = p_store_id
      AND table_id = p_table_id
      AND option_name = v_trimmed_option
      AND status = 'pending'
    ORDER BY requested_at ASC, id ASC
    LIMIT 1;

    IF v_existing_staff_call_id IS NOT NULL THEN
      RETURN v_existing_staff_call_id;
    END IF;

    RAISE;
  END;

  RETURN v_staff_call_id;
END;
$$;
