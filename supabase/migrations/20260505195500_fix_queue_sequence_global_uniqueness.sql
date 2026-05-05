-- Fix production waiting registration collisions caused by daily queue resets.
-- Problem:
--   waitings enforces UNIQUE (store_id, queue_number) across all history,
--   but next_queue_number() was resetting to 1 each business day.
--   The first registration after a date rollover could therefore collide with
--   historical rows even without any concurrent requests.
--
-- Remediation:
--   1) Stop reusing queue numbers for a store while the uniqueness key remains
--      (store_id, queue_number).
--   2) When the stored sequence is stale, recover from the historical max(queue_number)
--      so production can continue without manual backfills.

CREATE OR REPLACE FUNCTION next_queue_number(p_store_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_next int;
  v_max_existing int;
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF p_store_id IS NULL OR NOT is_store_accessible(p_store_id) THEN
    RAISE EXCEPTION 'store is not accessible';
  END IF;

  SELECT COALESCE(MAX(queue_number), 0)
  INTO v_max_existing
  FROM waitings
  WHERE store_id = p_store_id;

  INSERT INTO store_queue_sequences (store_id, current_number, last_reset_date)
  VALUES (p_store_id, v_max_existing + 1, v_today)
  ON CONFLICT (store_id) DO UPDATE
  SET
    current_number = GREATEST(store_queue_sequences.current_number, v_max_existing) + 1,
    last_reset_date = EXCLUDED.last_reset_date
  RETURNING current_number INTO v_next;

  RETURN v_next;
END;
$func$;
