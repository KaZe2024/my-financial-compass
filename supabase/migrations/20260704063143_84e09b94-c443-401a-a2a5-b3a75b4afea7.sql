REVOKE EXECUTE ON FUNCTION public.is_signup_open() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_signup_open() TO service_role;