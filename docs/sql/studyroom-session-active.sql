-- Operator-reviewed artifact ONLY. This change has not been applied remotely.
-- Run as the database owner in the intended StudyRoom Supabase project.
-- No caller-supplied user/session parameters; only the verified request JWT.
BEGIN;
CREATE OR REPLACE FUNCTION public.studyroom_session_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.sessions AS s
    WHERE s.user_id = auth.uid()
      AND s.id::text = (auth.jwt() ->> 'session_id')
      AND auth.uid() IS NOT NULL
      AND (auth.jwt() ->> 'role') = 'authenticated'
      AND (auth.jwt() ->> 'exp')::bigint > EXTRACT(EPOCH FROM pg_catalog.now())
      AND (s.not_after IS NULL OR s.not_after > pg_catalog.now())
  );
$$;
REVOKE ALL ON FUNCTION public.studyroom_session_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studyroom_session_active() TO authenticated;
COMMENT ON FUNCTION public.studyroom_session_active() IS
  'Checks only the calling authenticated JWT session. Returns no session data.';
COMMIT;
