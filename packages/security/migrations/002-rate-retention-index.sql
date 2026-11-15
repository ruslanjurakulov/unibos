-- Supports opportunistic bounded cleanup; no runtime DDL is performed.
CREATE INDEX auth_rate_limits_last_request_idx ON public.auth_rate_limits("lastRequest",id);
