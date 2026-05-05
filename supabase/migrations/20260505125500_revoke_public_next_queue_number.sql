REVOKE ALL ON FUNCTION public.next_queue_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_queue_number(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.next_queue_number(uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.create_waiting_atomic(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_waiting_atomic(uuid, text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.create_waiting_atomic(uuid, text, integer) TO authenticated;
