-- Auth identity tables are created by the pinned Better Auth migration first.
-- Runtime roles do not own schemas, tables or these security functions.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO unibos_app, unibos_auth, unibos_rls_guard, unibos_onboarding;
GRANT USAGE ON SCHEMA private TO unibos_app, unibos_rls_guard, unibos_onboarding;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  created_by text NOT NULL REFERENCES public.auth_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE INDEX branches_organization_id_idx ON public.branches(organization_id);
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id text NOT NULL REFERENCES public.auth_users(id),
  role text NOT NULL CHECK (role IN ('owner','director','administrator','accountant','cashier','waiter','kitchen')),
  branch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, branch_id) REFERENCES public.branches(organization_id, id),
  CHECK ((role IN ('owner','director') AND branch_id IS NULL) OR
         (role NOT IN ('owner','director') AND branch_id IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (organization_id, user_id, branch_id)
);
CREATE INDEX memberships_user_organization_idx ON public.memberships(user_id, organization_id);
CREATE INDEX memberships_organization_branch_idx ON public.memberships(organization_id, branch_id);
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid,
  actor_user_id text NOT NULL REFERENCES public.auth_users(id),
  action text NOT NULL CHECK (action IN ('organizations.insert','organizations.update','branches.insert','branches.update','memberships.insert','memberships.update','memberships.delete')),
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, branch_id) REFERENCES public.branches(organization_id,id)
);
CREATE INDEX audit_events_organization_created_idx ON public.audit_events(organization_id, created_at DESC, id);

REVOKE ALL ON public.organizations, public.branches, public.memberships, public.audit_events FROM PUBLIC, unibos_app, unibos_auth, unibos_rls_guard, unibos_onboarding;
GRANT SELECT ON public.organizations, public.branches, public.memberships, public.audit_events TO unibos_app;
GRANT UPDATE(name) ON public.organizations, public.branches TO unibos_app;
GRANT INSERT(organization_id,name) ON public.branches TO unibos_app;
GRANT INSERT(organization_id,user_id,role,branch_id) ON public.memberships TO unibos_app;
GRANT UPDATE(role,branch_id), DELETE ON public.memberships TO unibos_app;
-- The guard can bypass policy only while executing fixed membership lookup functions.
GRANT SELECT ON public.memberships TO unibos_rls_guard;
-- This NOLOGIN role can only insert the records required by atomic onboarding/audit.
GRANT INSERT ON public.organizations, public.memberships, public.audit_events TO unibos_onboarding;

CREATE FUNCTION private.actor_id() RETURNS text
  LANGUAGE sql STABLE SET search_path=pg_catalog
  AS $$ SELECT nullif(current_setting('app.user_id', true),'') $$;
CREATE FUNCTION private.tenant_id() RETURNS uuid
  LANGUAGE sql STABLE SET search_path=pg_catalog
  AS $$ SELECT nullif(current_setting('app.organization_id', true),'')::uuid $$;

CREATE FUNCTION private.member_of(target_org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id=target_org AND m.user_id=private.actor_id()
  ) $$;
CREATE FUNCTION private.org_owner(target_org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id=target_org AND m.user_id=private.actor_id()
      AND m.role='owner' AND m.branch_id IS NULL
  ) $$;
CREATE FUNCTION private.org_manager(target_org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id=target_org AND m.user_id=private.actor_id()
      AND m.role IN ('owner','director') AND m.branch_id IS NULL
  ) $$;
CREATE FUNCTION private.branch_access(target_org uuid, target_branch uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id=target_org AND m.user_id=private.actor_id()
      AND (m.branch_id=target_branch OR (m.branch_id IS NULL AND m.role IN ('owner','director')))
  ) $$;
CREATE FUNCTION private.branch_manager(target_org uuid, target_branch uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id=target_org AND m.user_id=private.actor_id()
      AND ((m.branch_id IS NULL AND m.role IN ('owner','director')) OR
           (m.branch_id=target_branch AND m.role='administrator'))
  ) $$;
CREATE FUNCTION private.may_grant(target_org uuid, target_role text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT target_role <> 'owner' AND (
    private.org_owner(target_org) OR
    (target_role <> 'director' AND private.org_manager(target_org))
  ) $$;

ALTER FUNCTION private.member_of(uuid) OWNER TO unibos_rls_guard;
ALTER FUNCTION private.org_owner(uuid) OWNER TO unibos_rls_guard;
ALTER FUNCTION private.org_manager(uuid) OWNER TO unibos_rls_guard;
ALTER FUNCTION private.branch_access(uuid,uuid) OWNER TO unibos_rls_guard;
ALTER FUNCTION private.branch_manager(uuid,uuid) OWNER TO unibos_rls_guard;
ALTER FUNCTION private.may_grant(uuid,text) OWNER TO unibos_rls_guard;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY organizations_select ON public.organizations FOR SELECT TO unibos_app
  USING (private.member_of(id) AND (private.tenant_id() IS NULL OR id=private.tenant_id()));
CREATE POLICY organizations_update ON public.organizations FOR UPDATE TO unibos_app
  USING (id=private.tenant_id() AND private.org_manager(id))
  WITH CHECK (id=private.tenant_id() AND private.org_manager(id));

CREATE POLICY branches_select ON public.branches FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.branch_access(organization_id,id));
CREATE POLICY branches_insert ON public.branches FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.org_manager(organization_id));
CREATE POLICY branches_update ON public.branches FOR UPDATE TO unibos_app
  USING (organization_id=private.tenant_id() AND private.branch_manager(organization_id,id))
  WITH CHECK (organization_id=private.tenant_id() AND private.branch_manager(organization_id,id));

CREATE POLICY memberships_select ON public.memberships FOR SELECT TO unibos_app
  USING ((user_id=private.actor_id() AND (private.tenant_id() IS NULL OR organization_id=private.tenant_id())) OR
         (organization_id=private.tenant_id() AND private.org_manager(organization_id)));
CREATE POLICY memberships_insert ON public.memberships FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.may_grant(organization_id,role));
CREATE POLICY memberships_update ON public.memberships FOR UPDATE TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_grant(organization_id,role))
  WITH CHECK (organization_id=private.tenant_id() AND private.may_grant(organization_id,role));
CREATE POLICY memberships_delete ON public.memberships FOR DELETE TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_grant(organization_id,role));

CREATE POLICY audit_events_select ON public.audit_events FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.org_manager(organization_id));
-- There is deliberately no direct app INSERT/UPDATE/DELETE privilege or policy on audit.

CREATE FUNCTION private.record_business_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$
  DECLARE org uuid; branch uuid; entity uuid; actor text;
  BEGIN
    actor := private.actor_id();
    IF actor IS NULL THEN RAISE EXCEPTION 'Missing actor context' USING ERRCODE='42501'; END IF;
    IF TG_TABLE_NAME='organizations' THEN
      org := NEW.id; branch := NULL; entity := NEW.id;
    ELSIF TG_OP='DELETE' THEN
      org := OLD.organization_id; branch := OLD.branch_id; entity := OLD.id;
    ELSE
      org := NEW.organization_id; entity := NEW.id;
      IF TG_TABLE_NAME='branches' THEN branch := NEW.id; ELSE branch := NEW.branch_id; END IF;
    END IF;
    INSERT INTO public.audit_events(organization_id,branch_id,actor_user_id,action,entity_id)
      VALUES (org,branch,actor,TG_TABLE_NAME||'.'||lower(TG_OP),entity);
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END $$;
ALTER FUNCTION private.record_business_audit() OWNER TO unibos_onboarding;
CREATE TRIGGER organizations_audit AFTER INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION private.record_business_audit();
CREATE TRIGGER branches_audit AFTER INSERT OR UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION private.record_business_audit();
CREATE TRIGGER memberships_audit AFTER INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION private.record_business_audit();

CREATE FUNCTION private.create_organization(org_name text)
  RETURNS TABLE(id uuid,name text,created_by text,created_at timestamptz)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$
  DECLARE org uuid := gen_random_uuid(); actor text := private.actor_id(); at_time timestamptz := now();
  BEGIN
    IF actor IS NULL THEN RAISE EXCEPTION 'Missing actor context' USING ERRCODE='42501'; END IF;
    IF org_name IS NULL OR length(btrim(org_name)) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Invalid organization name' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.organizations(id,name,created_by,created_at) VALUES(org,btrim(org_name),actor,at_time);
    INSERT INTO public.memberships(organization_id,user_id,role,branch_id) VALUES(org,actor,'owner',NULL);
    RETURN QUERY SELECT org,btrim(org_name),actor,at_time;
  END $$;
ALTER FUNCTION private.create_organization(text) OWNER TO unibos_onboarding;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.actor_id(),private.tenant_id() TO unibos_app,unibos_rls_guard,unibos_onboarding;
GRANT EXECUTE ON FUNCTION private.member_of(uuid),private.org_owner(uuid),private.org_manager(uuid),
  private.branch_access(uuid,uuid),private.branch_manager(uuid,uuid),private.may_grant(uuid,text) TO unibos_app,unibos_rls_guard;
GRANT EXECUTE ON FUNCTION private.create_organization(text) TO unibos_app;
