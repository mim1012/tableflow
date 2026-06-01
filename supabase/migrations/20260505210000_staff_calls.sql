-- Persist customer staff-call requests and expose a safe public RPC.

CREATE TABLE staff_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_id uuid REFERENCES tables(id) ON DELETE SET NULL,
  option_name text NOT NULL CHECK (char_length(btrim(option_name)) > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX staff_calls_store_status_requested_idx
  ON staff_calls (store_id, status, requested_at DESC);

ALTER TABLE staff_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_calls_member_read" ON staff_calls
  FOR SELECT TO authenticated
  USING (store_id IN (SELECT my_store_ids()));

CREATE POLICY "staff_calls_member_update" ON staff_calls
  FOR UPDATE TO authenticated
  USING (store_id IN (SELECT my_store_ids()))
  WITH CHECK (store_id IN (SELECT my_store_ids()));

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

  RETURN v_staff_call_id;
END;
$$;

REVOKE ALL ON TABLE staff_calls FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_staff_call(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff_call(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_staff_call(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_staff_call(uuid, uuid, text) TO service_role;
