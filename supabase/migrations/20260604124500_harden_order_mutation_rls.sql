-- Harden order mutation RLS.
-- Previous FOR ALL member policies made later DELETE-only role policies permissive ORs,
-- so any active store member could still match the broad policy for destructive writes.
-- Rollback: restore the old orders_member/order_items_member FOR ALL policies if needed.

DROP POLICY IF EXISTS "orders_member" ON orders;
DROP POLICY IF EXISTS "orders_member_select" ON orders;
DROP POLICY IF EXISTS "orders_member_insert" ON orders;
DROP POLICY IF EXISTS "orders_member_update" ON orders;
DROP POLICY IF EXISTS "orders_member_delete" ON orders;

CREATE POLICY "orders_member_select" ON orders
  FOR SELECT TO authenticated
  USING (store_id IN (SELECT my_store_ids()));

CREATE POLICY "orders_member_insert" ON orders
  FOR INSERT TO authenticated
  WITH CHECK (store_id IN (SELECT my_store_ids()));

CREATE POLICY "orders_member_update" ON orders
  FOR UPDATE TO authenticated
  USING (store_id IN (SELECT my_store_ids()))
  WITH CHECK (store_id IN (SELECT my_store_ids()));

CREATE POLICY "orders_member_delete" ON orders
  FOR DELETE TO authenticated
  USING (
    store_id IN (SELECT my_store_ids())
    AND my_store_role(store_id) IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "order_items_member" ON order_items;
DROP POLICY IF EXISTS "order_items_member_select" ON order_items;
DROP POLICY IF EXISTS "order_items_member_insert" ON order_items;
DROP POLICY IF EXISTS "order_items_member_update" ON order_items;
DROP POLICY IF EXISTS "order_items_member_delete" ON order_items;

CREATE POLICY "order_items_member_select" ON order_items
  FOR SELECT TO authenticated
  USING (store_id IN (SELECT my_store_ids()));

CREATE POLICY "order_items_member_insert" ON order_items
  FOR INSERT TO authenticated
  WITH CHECK (store_id IN (SELECT my_store_ids()));

CREATE POLICY "order_items_member_update" ON order_items
  FOR UPDATE TO authenticated
  USING (
    store_id IN (SELECT my_store_ids())
    AND my_store_role(store_id) IN ('owner', 'manager')
  )
  WITH CHECK (
    store_id IN (SELECT my_store_ids())
    AND my_store_role(store_id) IN ('owner', 'manager')
  );

CREATE POLICY "order_items_member_delete" ON order_items
  FOR DELETE TO authenticated
  USING (
    store_id IN (SELECT my_store_ids())
    AND my_store_role(store_id) IN ('owner', 'manager')
  );
