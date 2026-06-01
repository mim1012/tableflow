-- Fix remaining waiting notification / queue race issues.
-- 1) next_queue_number() should use atomic UPSERT again.
-- 2) waiting_notifications should dedupe per waiting/event.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY waiting_id, event
           ORDER BY
             CASE status WHEN 'sent' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
             created_at ASC,
             id ASC
         ) AS row_num
  FROM waiting_notifications
)
DELETE FROM waiting_notifications wn
USING ranked
WHERE wn.id = ranked.id
  AND ranked.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS waiting_notifications_waiting_event_key
  ON waiting_notifications (waiting_id, event);

CREATE OR REPLACE FUNCTION next_queue_number(p_store_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_next integer;
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF p_store_id IS NULL OR NOT is_store_accessible(p_store_id) THEN
    RAISE EXCEPTION 'store is not accessible';
  END IF;

  INSERT INTO store_queue_sequences (store_id, current_number, last_reset_date)
  VALUES (p_store_id, 1, v_today)
  ON CONFLICT (store_id) DO UPDATE
  SET
    current_number = CASE
      WHEN store_queue_sequences.last_reset_date < v_today THEN 1
      ELSE store_queue_sequences.current_number + 1
    END,
    last_reset_date = v_today
  RETURNING current_number INTO v_next;

  RETURN v_next;
END;
$func$;
