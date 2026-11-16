-- P4.2 canonical cashier order engine. Forward-only; no edits to applied migrations.
ALTER TABLE public.product_price_versions
  ADD CONSTRAINT product_price_versions_snapshot_scope_unique
  UNIQUE (organization_id, branch_id, product_id, id);

ALTER TABLE public.audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (
  action IN (
    'organizations.insert','organizations.update','branches.insert','branches.update',
    'memberships.insert','memberships.update','memberships.delete',
    'product_categories.insert','product_categories.update','products.insert','products.update',
    'product_price_versions.insert','branch_product_availability.insert','branch_product_availability.update',
    'restaurant_tables.insert','restaurant_tables.update','table_qr_tokens.insert','table_qr_tokens.update',
    'orders.insert'
  )
);

CREATE FUNCTION private.may_create_order(target_org uuid, target_branch uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id=target_org AND m.user_id=private.actor_id()
      AND (m.branch_id=target_branch OR (m.branch_id IS NULL AND m.role IN ('owner','director')))
      AND m.role IN ('owner','director','administrator','cashier')
  ) $$;
ALTER FUNCTION private.may_create_order(uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.may_create_order(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_create_order(uuid,uuid) TO unibos_app,unibos_onboarding;
CREATE FUNCTION private.may_read_order_financials(target_org uuid, target_branch uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id=target_org AND m.user_id=private.actor_id()
      AND (m.branch_id=target_branch OR (m.branch_id IS NULL AND m.role IN ('owner','director')))
      AND m.role IN ('owner','director','administrator','accountant','cashier')
  ) $$;
ALTER FUNCTION private.may_read_order_financials(uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.may_read_order_financials(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_read_order_financials(uuid,uuid) TO unibos_app;

-- Cashiers cannot UPDATE catalog/table rows; a narrow non-login definer locks
-- validated rows so price/availability/table edits cannot race order creation.
GRANT SELECT ON public.products,public.product_categories,public.branch_product_availability,public.restaurant_tables TO unibos_onboarding;
GRANT UPDATE(id) ON public.products,public.restaurant_tables TO unibos_onboarding;
CREATE FUNCTION private.lock_cashier_table(target_org uuid, target_branch uuid, target_table uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE locked_id uuid;
  BEGIN
    IF NOT private.may_create_order(target_org,target_branch) THEN RETURN false; END IF;
    SELECT t.id INTO locked_id FROM public.restaurant_tables t
      WHERE t.organization_id=target_org AND t.branch_id=target_branch AND t.id=target_table
        AND t.active AND t.status='available' FOR UPDATE;
    RETURN FOUND;
  END $$;
ALTER FUNCTION private.lock_cashier_table(uuid,uuid,uuid) OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.lock_cashier_table(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lock_cashier_table(uuid,uuid,uuid) TO unibos_app;

CREATE FUNCTION private.lock_cashier_product(target_org uuid, target_branch uuid, target_product uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE locked_id uuid;
  BEGIN
    IF NOT private.may_create_order(target_org,target_branch) THEN RETURN false; END IF;
    SELECT p.id INTO locked_id FROM public.products p
      JOIN public.product_categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
      LEFT JOIN public.branch_product_availability a ON a.organization_id=p.organization_id
        AND a.branch_id=target_branch AND a.product_id=p.id
      WHERE p.organization_id=target_org AND p.id=target_product AND p.active AND c.active
        AND COALESCE(a.available,true) FOR UPDATE OF p;
    RETURN FOUND;
  END $$;
ALTER FUNCTION private.lock_cashier_product(uuid,uuid,uuid) OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.lock_cashier_product(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lock_cashier_product(uuid,uuid,uuid) TO unibos_app;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  table_id uuid,
  source text NOT NULL DEFAULT 'CASHIER_POS' CHECK (source IN ('CASHIER_POS','WAITER','GUEST_QR','PUBLIC_MENU','PICKUP','DELIVERY')),
  fulfillment_type text NOT NULL CHECK (fulfillment_type IN ('DINE_IN','PICKUP','DELIVERY')),
  created_by text NOT NULL DEFAULT private.actor_id() REFERENCES public.auth_users(id),
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','ACCEPTED','PREPARING','READY','SERVED','COMPLETED','CANCELLED')),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  order_note text CHECK (order_note IS NULL OR length(order_note) <= 500),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_id, id),
  FOREIGN KEY (organization_id, branch_id) REFERENCES public.branches(organization_id,id),
  FOREIGN KEY (organization_id, branch_id, table_id) REFERENCES public.restaurant_tables(organization_id,branch_id,id),
  CHECK ((fulfillment_type='DINE_IN' AND table_id IS NOT NULL) OR (fulfillment_type<>'DINE_IN' AND table_id IS NULL)),
  CHECK (total_minor = subtotal_minor)
);
CREATE INDEX orders_branch_created_idx ON public.orders(organization_id,branch_id,created_at DESC,id);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL CHECK (length(btrim(product_name_snapshot)) BETWEEN 1 AND 120),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0 AND quantity <= 9999.999),
  line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0),
  product_price_version uuid NOT NULL,
  notes text CHECK (notes IS NULL OR length(notes) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,branch_id,order_id,id),
  FOREIGN KEY (organization_id,branch_id,order_id) REFERENCES public.orders(organization_id,branch_id,id),
  FOREIGN KEY (organization_id,product_id) REFERENCES public.products(organization_id,id),
  FOREIGN KEY (organization_id,branch_id,product_id,product_price_version)
    REFERENCES public.product_price_versions(organization_id,branch_id,product_id,id)
);
CREATE INDEX order_items_order_idx ON public.order_items(organization_id,branch_id,order_id,created_at,id);

CREATE TABLE public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('ORDER_SUBMITTED')),
  actor_user_id text NOT NULL DEFAULT private.actor_id() REFERENCES public.auth_users(id),
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(event_data::text) <= 4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,branch_id,order_id) REFERENCES public.orders(organization_id,branch_id,id)
);
CREATE INDEX order_events_order_idx ON public.order_events(organization_id,branch_id,order_id,created_at,id);

CREATE TABLE public.order_idempotency_keys (
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  actor_user_id text NOT NULL REFERENCES public.auth_users(id),
  operation text NOT NULL CHECK (operation='CREATE_ORDER'),
  idempotency_key uuid NOT NULL,
  request_hash bytea NOT NULL CHECK (octet_length(request_hash)=32),
  order_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,branch_id,actor_user_id,operation,idempotency_key),
  FOREIGN KEY (organization_id,branch_id) REFERENCES public.branches(organization_id,id),
  FOREIGN KEY (organization_id,branch_id,order_id) REFERENCES public.orders(organization_id,branch_id,id)
);

REVOKE ALL ON public.orders,public.order_items,public.order_events,public.order_idempotency_keys
  FROM PUBLIC,unibos_app,unibos_auth,unibos_rls_guard,unibos_onboarding;
GRANT SELECT ON public.orders,public.order_items,public.order_events TO unibos_app;
GRANT INSERT(organization_id,branch_id,table_id,source,fulfillment_type,created_by,status,currency_code,subtotal_minor,total_minor,order_note)
  ON public.orders TO unibos_app;
GRANT INSERT(organization_id,branch_id,order_id,product_id,product_name_snapshot,unit_price_minor,currency_code,quantity,line_total_minor,product_price_version,notes)
  ON public.order_items TO unibos_app;
GRANT INSERT(organization_id,branch_id,order_id,event_type,actor_user_id,event_data)
  ON public.order_events TO unibos_app;
GRANT SELECT,INSERT ON public.order_idempotency_keys TO unibos_app;
GRANT INSERT ON public.audit_events TO unibos_onboarding;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_idempotency_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY orders_select ON public.orders FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_read_order_financials(organization_id,branch_id));
CREATE POLICY orders_insert ON public.orders FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.may_create_order(organization_id,branch_id)
    AND created_by=private.actor_id() AND source='CASHIER_POS' AND status='SUBMITTED');
CREATE POLICY order_items_select ON public.order_items FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_read_order_financials(organization_id,branch_id));
CREATE POLICY order_items_insert ON public.order_items FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.may_create_order(organization_id,branch_id)
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.organization_id=order_items.organization_id
      AND o.branch_id=order_items.branch_id AND o.id=order_items.order_id AND o.created_by=private.actor_id()
      AND o.status='SUBMITTED'));
CREATE POLICY order_events_select ON public.order_events FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_read_order_financials(organization_id,branch_id));
CREATE POLICY order_events_insert ON public.order_events FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.may_create_order(organization_id,branch_id)
    AND actor_user_id=private.actor_id());
CREATE POLICY order_idempotency_scope ON public.order_idempotency_keys FOR ALL TO unibos_app
  USING (organization_id=private.tenant_id() AND branch_id IS NOT NULL
    AND actor_user_id=private.actor_id() AND private.branch_access(organization_id,branch_id))
  WITH CHECK (organization_id=private.tenant_id() AND actor_user_id=private.actor_id()
    AND private.may_create_order(organization_id,branch_id));

CREATE FUNCTION private.record_order_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ BEGIN
    INSERT INTO public.audit_events(organization_id,branch_id,actor_user_id,action,entity_id)
      VALUES (NEW.organization_id,NEW.branch_id,NEW.created_by,'orders.insert',NEW.id);
    RETURN NEW;
  END $$;
ALTER FUNCTION private.record_order_audit() OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.record_order_audit() FROM PUBLIC;
CREATE TRIGGER orders_audit AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.record_order_audit();
