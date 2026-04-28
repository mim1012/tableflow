-- Restored from remote Supabase migration history to realign local migrations with production
-- Original remote migration version: 20260426000001
-- Name: harden_public_order_waiting

-- Harden public order/waiting paths:
-- - Reject invalid selected options instead of silently accepting them.
-- - Prevent queue-number creation for inactive/inaccessible stores.

CREATE OR REPLACE FUNCTION enforce_menu_item_price()
RETURNS TRIGGER AS $$
DECLARE
  actual_price int;
  option_total int := 0;
  opt jsonb;
  actual_extra int;
  corrected_options jsonb := '[]'::jsonb;
BEGIN
  SELECT price INTO actual_price
  FROM menu_items
  WHERE id = NEW.menu_item_id
    AND store_id = NEW.store_id
    AND is_available = true
    AND is_deleted = false;

  IF actual_price IS NULL THEN
    RAISE EXCEPTION 'invalid menu_item_id %', NEW.menu_item_id;
  END IF;

  NEW.unit_price := actual_price;

  IF NEW.selected_options IS NOT NULL
     AND jsonb_typeof(NEW.selected_options) = 'array'
     AND jsonb_array_length(NEW.selected_options) > 0 THEN

    FOR opt IN SELECT value FROM jsonb_array_elements(NEW.selected_options)
    LOOP
      actual_extra := NULL;

      IF opt->>'option_choice_id' IS NOT NULL THEN
        SELECT oc.extra_price INTO actual_extra
        FROM option_choices oc
        JOIN option_groups og ON og.id = oc.option_group_id
        WHERE oc.id = (opt->>'option_choice_id')::uuid
          AND oc.store_id = NEW.store_id
          AND og.store_id = NEW.store_id
          AND og.menu_item_id = NEW.menu_item_id;
      ELSIF opt->>'group' IS NOT NULL AND opt->>'choice' IS NOT NULL THEN
        SELECT oc.extra_price INTO actual_extra
        FROM option_choices oc
        JOIN option_groups og ON og.id = oc.option_group_id
        WHERE oc.store_id = NEW.store_id
          AND og.store_id = NEW.store_id
          AND og.menu_item_id = NEW.menu_item_id
          AND og.name = opt->>'group'
          AND oc.name = opt->>'choice';
      END IF;

      IF actual_extra IS NULL THEN
        RAISE EXCEPTION 'invalid selected option for menu_item %', NEW.menu_item_id;
      END IF;

      option_total := option_total + actual_extra;
      corrected_options := corrected_options || jsonb_build_array(
        opt || jsonb_build_object('extra_price', actual_extra)
      );
    END LOOP;

    NEW.selected_options := corrected_options;
  END IF;

  NEW.total_price := (actual_price + option_total) * NEW.quantity;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION next_queue_number(p_store_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_next  int;
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF p_store_id IS NULL OR NOT is_store_accessible(p_store_id) THEN
    RAISE EXCEPTION 'store is not accessible';
  END IF;

  UPDATE store_queue_sequences
  SET
    current_number  = CASE WHEN last_reset_date < v_today THEN 1 ELSE current_number + 1 END,
    last_reset_date = v_today
  WHERE store_id = p_store_id
  RETURNING current_number INTO v_next;

  IF NOT FOUND THEN
    INSERT INTO store_queue_sequences (store_id, current_number, last_reset_date)
    VALUES (p_store_id, 1, v_today)
    RETURNING current_number INTO v_next;
  END IF;

  RETURN v_next;
END;
$func$;

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_store_id uuid,
  p_table_id uuid,
  p_items jsonb,
  p_guest_name text DEFAULT NULL,
  p_special_requests text DEFAULT NULL,
  p_payment_method payment_method DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid := gen_random_uuid();
  v_role text := auth.role();
  v_uid uuid := auth.uid();
  v_item_count int := 0;
  v_item record;
  v_opt jsonb;
  v_choice_id uuid;
  v_valid boolean;
  v_recent_order_count int;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'store_id is required';
  END IF;

  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'table_id is required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items must be a non-empty array';
  END IF;

  IF v_role = 'anon' THEN
    IF NOT is_store_accessible(p_store_id) THEN
      RAISE EXCEPTION 'store is not accessible';
    END IF;
  ELSIF v_uid IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM store_members
      WHERE store_id = p_store_id AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'no access to store';
    END IF;
  ELSE
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tables
    WHERE id = p_table_id AND store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'table does not belong to store';
  END IF;

  SELECT COUNT(*) INTO v_recent_order_count
  FROM orders
  WHERE table_id = p_table_id
    AND created_at > now() - interval '1 minute';

  IF v_recent_order_count >= 15 THEN
    RAISE EXCEPTION 'rate limit exceeded: too many orders from this table';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(menu_item_id uuid, quantity int)
    LEFT JOIN menu_items mi
      ON mi.id = item.menu_item_id
     AND mi.store_id = p_store_id
     AND mi.is_available = true
     AND mi.is_deleted = false
    WHERE item.menu_item_id IS NULL
       OR item.quantity IS NULL
       OR item.quantity <= 0
       OR mi.id IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid order items';
  END IF;

  FOR v_item IN
    SELECT item.menu_item_id, item.selected_options
    FROM jsonb_to_recordset(p_items) AS item(
      menu_item_id uuid, menu_item_name text, quantity int, selected_options jsonb
    )
    WHERE item.selected_options IS NOT NULL
      AND jsonb_typeof(item.selected_options) = 'array'
      AND jsonb_array_length(item.selected_options) > 0
  LOOP
    FOR v_opt IN SELECT value FROM jsonb_array_elements(v_item.selected_options)
    LOOP
      v_valid := false;

      IF v_opt->>'option_choice_id' IS NOT NULL THEN
        v_choice_id := (v_opt->>'option_choice_id')::uuid;
        SELECT EXISTS (
          SELECT 1 FROM option_choices oc
          JOIN option_groups og ON og.id = oc.option_group_id
          WHERE oc.id = v_choice_id
            AND oc.store_id = p_store_id
            AND og.store_id = p_store_id
            AND og.menu_item_id = v_item.menu_item_id
        ) INTO v_valid;
      ELSIF v_opt->>'group' IS NOT NULL AND v_opt->>'choice' IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM option_choices oc
          JOIN option_groups og ON og.id = oc.option_group_id
          WHERE oc.store_id = p_store_id
            AND og.store_id = p_store_id
            AND og.menu_item_id = v_item.menu_item_id
            AND og.name = v_opt->>'group'
            AND oc.name = v_opt->>'choice'
        ) INTO v_valid;
      END IF;

      IF NOT v_valid THEN
        RAISE EXCEPTION 'invalid selected option for menu_item %', v_item.menu_item_id;
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO orders (id, store_id, table_id, subtotal_price, total_price,
    guest_name, special_requests, payment_method)
  VALUES (v_order_id, p_store_id, p_table_id, 0, 0,
    p_guest_name, p_special_requests, p_payment_method);

  INSERT INTO order_items (store_id, order_id, menu_item_id, menu_item_name,
    unit_price, quantity, total_price, selected_options)
  SELECT p_store_id, v_order_id, item.menu_item_id,
    COALESCE(NULLIF(item.menu_item_name, ''), mi.name),
    mi.price, item.quantity, mi.price * item.quantity,
    CASE WHEN item.selected_options IS NULL OR jsonb_typeof(item.selected_options) <> 'array'
      THEN NULL ELSE item.selected_options END
  FROM jsonb_to_recordset(p_items) AS item(
    menu_item_id uuid, menu_item_name text, quantity int, selected_options jsonb
  )
  JOIN menu_items mi ON mi.id = item.menu_item_id AND mi.store_id = p_store_id;

  GET DIAGNOSTICS v_item_count = ROW_COUNT;
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'no valid order items inserted';
  END IF;

  UPDATE tables SET status = 'occupied'
  WHERE id = p_table_id AND store_id = p_store_id AND status <> 'occupied';

  RETURN v_order_id;
END;
$$;
