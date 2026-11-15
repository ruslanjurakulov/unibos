-- Better Auth 1.7.25 official getMigrations compile output.
-- Generated against a fresh scratch DB; apply only through the reviewed migration runner.
create table "auth_users" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "twoFactorEnabled" boolean);

create table "auth_sessions" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "auth_users" ("id") on delete cascade);

create table "auth_accounts" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "auth_users" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "auth_verifications" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "auth_two_factors" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "auth_users" ("id") on delete cascade, "verified" boolean, "failedVerificationCount" integer, "lockedUntil" timestamptz);

create table "auth_rate_limits" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "auth_sessions_userId_idx" on "auth_sessions" ("userId");

create index "auth_accounts_userId_idx" on "auth_accounts" ("userId");

create index "auth_verifications_identifier_idx" on "auth_verifications" ("identifier");

create index "auth_two_factors_secret_idx" on "auth_two_factors" ("secret");

create index "auth_two_factors_userId_idx" on "auth_two_factors" ("userId");

-- UniBOS session-bound step-up assurance; never inferred from user enrollment.
CREATE TABLE public.auth_mfa_sessions (
  session_id text PRIMARY KEY REFERENCES public.auth_sessions(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_mfa_sessions_user_idx ON public.auth_mfa_sessions(user_id);

REVOKE ALL ON public.auth_users, public.auth_sessions, public.auth_accounts, public.auth_verifications, public.auth_two_factors, public.auth_rate_limits, public.auth_mfa_sessions FROM PUBLIC;
REVOKE ALL ON public.auth_users, public.auth_sessions, public.auth_accounts, public.auth_verifications, public.auth_two_factors, public.auth_rate_limits, public.auth_mfa_sessions FROM unibos_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_users, public.auth_sessions, public.auth_accounts, public.auth_verifications, public.auth_two_factors, public.auth_rate_limits, public.auth_mfa_sessions TO unibos_auth;
