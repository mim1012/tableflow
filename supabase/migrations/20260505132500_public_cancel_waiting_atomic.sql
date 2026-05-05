CREATE OR REPLACE FUNCTION public.cancel_waiting_public(
  p_store_id uuid,
  p_waiting_id uuid,
  p_phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_waiting waitings%ROWTYPE;
BEGIN
  IF length(v_phone) < 8 OR length(v_phone) > 15 THEN
    RAISE EXCEPTION 'phone must be 8-15 digits';
  END IF;

  SELECT *
  INTO v_waiting
  FROM public.waitings
  WHERE id = p_waiting_id
    AND store_id = p_store_id
    AND phone = v_phone
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'waiting not found';
  END IF;

  IF v_waiting.status = 'cancelled' THEN
    RETURN v_waiting.id;
  END IF;

  IF v_waiting.status NOT IN ('waiting', 'called') THEN
    RAISE EXCEPTION 'waiting already ended';
  END IF;

  UPDATE public.waitings
  SET status = 'cancelled'
  WHERE id = v_waiting.id;

  RETURN v_waiting.id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_waiting_public(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_waiting_public(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_waiting_public(uuid, uuid, text) TO authenticated;
