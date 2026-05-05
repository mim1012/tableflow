-- Fix waiting registration race condition in production.
-- Root cause: next_queue_number() and waitings insert were split across two round trips,
-- so concurrent requests could reserve the same queue_number and then collide on
-- waitings_store_id_queue_number_key.

CREATE OR REPLACE FUNCTION next_queue_number(p_store_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_next int;
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
      WHEN store_queue_sequences.last_reset_date < EXCLUDED.last_reset_date THEN 1
      ELSE store_queue_sequences.current_number + 1
    END,
    last_reset_date = EXCLUDED.last_reset_date
  RETURNING current_number INTO v_next;

  RETURN v_next;
END;
$func$;

CREATE OR REPLACE FUNCTION create_waiting_atomic(
  p_store_id uuid,
  p_phone text,
  p_party_size int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_waiting_id uuid := gen_random_uuid();
  v_queue_number int;
BEGIN
  IF p_store_id IS NULL OR NOT is_store_accessible(p_store_id) THEN
    RAISE EXCEPTION 'store is not accessible';
  END IF;

  IF p_phone IS NULL OR p_phone !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'phone must be 8-15 digits';
  END IF;

  IF p_party_size IS NULL OR p_party_size < 1 OR p_party_size > 20 THEN
    RAISE EXCEPTION 'party_size must be between 1 and 20';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_phone, 0));

  IF EXISTS (
    SELECT 1
    FROM waitings
    WHERE store_id = p_store_id
      AND phone = p_phone
      AND status IN ('waiting', 'called')
  ) THEN
    RAISE EXCEPTION 'active waiting already exists for this phone';
  END IF;

  v_queue_number := next_queue_number(p_store_id);

  INSERT INTO waitings (
    id,
    store_id,
    queue_number,
    phone,
    party_size,
    status
  ) VALUES (
    v_waiting_id,
    p_store_id,
    v_queue_number,
    p_phone,
    p_party_size,
    'waiting'
  );

  RETURN jsonb_build_object(
    'queue_number', v_queue_number,
    'waiting_id', v_waiting_id
  );
END;
$func$;

REVOKE EXECUTE ON FUNCTION next_queue_number(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION next_queue_number(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION create_waiting_atomic(uuid, text, int) TO anon, authenticated, service_role;
