DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'staff_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_calls;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION get_staff_call_options(
  p_store_id uuid
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allowed_options text[];
BEGIN
  IF p_store_id IS NULL OR NOT is_store_accessible(p_store_id) THEN
    RAISE EXCEPTION 'store is not accessible';
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

  RETURN v_allowed_options;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_call_options(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_call_options(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_staff_call_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_call_options(uuid) TO service_role;