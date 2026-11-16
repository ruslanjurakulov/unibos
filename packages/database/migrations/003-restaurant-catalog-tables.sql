-- P4.1 restaurant catalog, branch pricing/availability, tables and revocable QR tokens.
-- Prices are append-only snapshots; order lines will copy them in P4.2.
ALTER TABLE public.audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (
  action IN (
    'organizations.insert','organizations.update','branches.insert','branches.update',
    'memberships.insert','memberships.update','memberships.delete',
    'product_categories.insert','product_categories.update',
    'products.insert','products.update','product_price_versions.insert',
    'branch_product_availability.insert','branch_product_availability.update',
    'restaurant_tables.insert','restaurant_tables.update',
    'table_qr_tokens.insert','table_qr_tokens.update'
  )
);

CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR length(description) <= 500),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE INDEX product_categories_order_idx
  ON public.product_categories(organization_id, sort_order, name, id);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  category_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 1200),
  image_key text CHECK (
    image_key IS NULL OR
    (image_key ~ '^/images/products/[A-Za-z0-9][A-Za-z0-9._/-]*$' AND image_key !~ '(^|/)\.\.(/|$)')
  ),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, category_id)
    REFERENCES public.product_categories(organization_id, id)
);
CREATE INDEX products_category_order_idx
  ON public.products(organization_id, category_id, sort_order, name, id);

CREATE TABLE public.product_price_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text NOT NULL DEFAULT private.actor_id() REFERENCES public.auth_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_id, product_id, effective_at),
  FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id),
  FOREIGN KEY (organization_id, product_id)
    REFERENCES public.products(organization_id, id)
);
CREATE INDEX product_price_current_idx
  ON public.product_price_versions(organization_id, branch_id, product_id, effective_at DESC, id DESC);

CREATE TABLE public.branch_product_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  available boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_id, product_id),
  FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id),
  FOREIGN KEY (organization_id, product_id)
    REFERENCES public.products(organization_id, id)
);

CREATE TABLE public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  table_code text NOT NULL CHECK (table_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
  seats smallint NOT NULL CHECK (seats BETWEEN 1 AND 24),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','reserved','blocked','cleaning')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_id, id),
  UNIQUE (organization_id, branch_id, table_code),
  FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id)
);
CREATE INDEX restaurant_tables_branch_idx
  ON public.restaurant_tables(organization_id, branch_id, active, table_code);

CREATE TABLE public.table_qr_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  table_id uuid NOT NULL,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_by text NOT NULL DEFAULT private.actor_id() REFERENCES public.auth_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (organization_id, branch_id, table_id)
    REFERENCES public.restaurant_tables(organization_id, branch_id, id),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX table_qr_tokens_active_idx
  ON public.table_qr_tokens(organization_id, branch_id, table_id, expires_at)
  WHERE revoked_at IS NULL;

REVOKE ALL ON public.product_categories, public.products,
  public.product_price_versions, public.branch_product_availability,
  public.restaurant_tables, public.table_qr_tokens
  FROM PUBLIC, unibos_app, unibos_auth, unibos_rls_guard, unibos_onboarding;

GRANT SELECT ON public.product_categories, public.products,
  public.product_price_versions, public.branch_product_availability,
  public.restaurant_tables TO unibos_app;
GRANT INSERT(organization_id,name,description,sort_order,active),
  UPDATE(name,description,sort_order,active,updated_at)
  ON public.product_categories TO unibos_app;
GRANT INSERT(organization_id,category_id,name,description,image_key,sort_order,active),
  UPDATE(category_id,name,description,image_key,sort_order,active,updated_at)
  ON public.products TO unibos_app;
GRANT INSERT(organization_id,branch_id,product_id,price_minor,currency_code,effective_at,created_by)
  ON public.product_price_versions TO unibos_app;
GRANT INSERT(organization_id,branch_id,product_id,available,updated_at),
  UPDATE(available,updated_at)
  ON public.branch_product_availability TO unibos_app;
GRANT INSERT(organization_id,branch_id,table_code,display_name,seats,status,active),
  UPDATE(table_code,display_name,seats,status,active,updated_at)
  ON public.restaurant_tables TO unibos_app;
GRANT SELECT(id,organization_id,branch_id,table_id,created_by,created_at,expires_at,revoked_at),
  INSERT(organization_id,branch_id,table_id,token_hash,created_by,expires_at),
  UPDATE(revoked_at)
  ON public.table_qr_tokens TO unibos_app;
GRANT INSERT ON public.audit_events TO unibos_onboarding;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_price_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_price_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branch_product_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_product_availability FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables FORCE ROW LEVEL SECURITY;
ALTER TABLE public.table_qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_qr_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY product_categories_select ON public.product_categories FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.member_of(organization_id));
CREATE POLICY product_categories_insert ON public.product_categories FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.org_manager(organization_id));
CREATE POLICY product_categories_update ON public.product_categories FOR UPDATE TO unibos_app
  USING (organization_id=private.tenant_id() AND private.org_manager(organization_id))
  WITH CHECK (organization_id=private.tenant_id() AND private.org_manager(organization_id));

CREATE POLICY products_select ON public.products FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.member_of(organization_id));
CREATE POLICY products_insert ON public.products FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.org_manager(organization_id));
CREATE POLICY products_update ON public.products FOR UPDATE TO unibos_app
  USING (organization_id=private.tenant_id() AND private.org_manager(organization_id))
  WITH CHECK (organization_id=private.tenant_id() AND private.org_manager(organization_id));

CREATE POLICY product_prices_select ON public.product_price_versions FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.branch_access(organization_id,branch_id));
CREATE POLICY product_prices_insert ON public.product_price_versions FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.org_manager(organization_id)
    AND private.branch_access(organization_id,branch_id)
    AND created_by=private.actor_id());

CREATE POLICY branch_product_availability_select ON public.branch_product_availability FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.branch_access(organization_id,branch_id));
CREATE POLICY branch_product_availability_insert ON public.branch_product_availability FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.branch_manager(organization_id,branch_id));
CREATE POLICY branch_product_availability_update ON public.branch_product_availability FOR UPDATE TO unibos_app
  USING (organization_id=private.tenant_id() AND private.branch_manager(organization_id,branch_id))
  WITH CHECK (organization_id=private.tenant_id() AND private.branch_manager(organization_id,branch_id));

CREATE POLICY restaurant_tables_select ON public.restaurant_tables FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.branch_access(organization_id,branch_id));
CREATE POLICY restaurant_tables_insert ON public.restaurant_tables FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.branch_manager(organization_id,branch_id));
CREATE POLICY restaurant_tables_update ON public.restaurant_tables FOR UPDATE TO unibos_app
  USING (organization_id=private.tenant_id() AND private.branch_manager(organization_id,branch_id))
  WITH CHECK (organization_id=private.tenant_id() AND private.branch_manager(organization_id,branch_id));

CREATE POLICY table_qr_tokens_select ON public.table_qr_tokens FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.branch_manager(organization_id,branch_id));
CREATE POLICY table_qr_tokens_insert ON public.table_qr_tokens FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.branch_manager(organization_id,branch_id)
    AND created_by=private.actor_id());
CREATE POLICY table_qr_tokens_update ON public.table_qr_tokens FOR UPDATE TO unibos_app
  USING (organization_id=private.tenant_id() AND private.branch_manager(organization_id,branch_id)
    AND revoked_at IS NULL)
  WITH CHECK (organization_id=private.tenant_id() AND private.branch_manager(organization_id,branch_id)
    AND revoked_at IS NOT NULL);

CREATE FUNCTION private.record_p4_business_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$
  DECLARE org uuid; branch uuid; entity uuid; actor text;
  BEGIN
    actor := private.actor_id();
    IF actor IS NULL THEN RAISE EXCEPTION 'Missing actor context' USING ERRCODE='42501'; END IF;
    org := NEW.organization_id;
    entity := NEW.id;
    IF TG_TABLE_NAME IN ('product_price_versions','branch_product_availability','restaurant_tables','table_qr_tokens')
      THEN branch := NEW.branch_id;
    ELSE branch := NULL;
    END IF;
    INSERT INTO public.audit_events(organization_id,branch_id,actor_user_id,action,entity_id)
      VALUES (org,branch,actor,TG_TABLE_NAME||'.'||lower(TG_OP),entity);
    RETURN NEW;
  END $$;
ALTER FUNCTION private.record_p4_business_audit() OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.record_p4_business_audit() FROM PUBLIC;

CREATE TRIGGER product_categories_audit AFTER INSERT OR UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION private.record_p4_business_audit();
CREATE TRIGGER products_audit AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION private.record_p4_business_audit();
CREATE TRIGGER product_price_versions_audit AFTER INSERT ON public.product_price_versions
  FOR EACH ROW EXECUTE FUNCTION private.record_p4_business_audit();
CREATE TRIGGER branch_product_availability_audit AFTER INSERT OR UPDATE ON public.branch_product_availability
  FOR EACH ROW EXECUTE FUNCTION private.record_p4_business_audit();
CREATE TRIGGER restaurant_tables_audit AFTER INSERT OR UPDATE ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION private.record_p4_business_audit();
CREATE TRIGGER table_qr_tokens_audit AFTER INSERT OR UPDATE ON public.table_qr_tokens
  FOR EACH ROW EXECUTE FUNCTION private.record_p4_business_audit();
