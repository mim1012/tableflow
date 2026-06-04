-- Enable Supabase Realtime for waitings table.
-- Admin waiting panels subscribe to waitings inserts/updates for live queue updates.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'waitings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waitings;
  END IF;
END $$;
