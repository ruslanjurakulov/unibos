-- P4.3 kitchen tickets extend the P4.2 canonical order model.
ALTER TABLE public.order_events DROP CONSTRAINT order_events_event_type_check;
ALTER TABLE public.order_events ADD CONSTRAINT order_events_event_type_check
  CHECK (event_type IN ('ORDER_SUBMITTED','ORDER_ITEMS_ADDED','ORDER_STATUS_CHANGED','BILL_REQUESTED'));

ALTER TABLE public.order_idempotency_keys DROP CONSTRAINT order_idempotency_keys_operation_check;
ALTER TABLE public.order_idempotency_keys ADD CONSTRAINT order_idempotency_keys_operation_check
  CHECK (operation IN ('CREATE_ORDER','ADD_ORDER_ITEMS','TRANSITION_TICKET','REQUEST_BILL'));
ALTER TABLE public.order_idempotency_keys ADD COLUMN result_ticket_id uuid;

ALTER TABLE public.audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (
  action IN (
    'organizations.insert','organizations.update','branches.insert','branches.update',
    'memberships.insert','memberships.update','memberships.delete',
    'product_categories.insert','product_categories.update','products.insert','products.update',
    'product_price_versions.insert','branch_product_availability.insert','branch_product_availability.update',
    'restaurant_tables.insert','restaurant_tables.update','table_qr_tokens.insert','table_qr_tokens.update',
    'orders.insert','orders.update','kitchen_tickets.insert','kitchen_tickets.update'
  )
);

CREATE FUNCTION private.may_operate_orders(target_org uuid,target_branch uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND private.tenant_id()=target_org AND (EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id=target_branch
      AND m.role IN ('owner','director','administrator','cashier','waiter','kitchen')
  ) OR EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id IS NULL
      AND m.role IN ('owner','director')
  )) $$;
ALTER FUNCTION private.may_operate_orders(uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.may_operate_orders(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_operate_orders(uuid,uuid) TO unibos_app,unibos_onboarding;

CREATE FUNCTION private.may_add_order_items(target_org uuid,target_branch uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND private.tenant_id()=target_org AND (EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id=target_branch
      AND m.role IN ('administrator','cashier','waiter')
  ) OR EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id IS NULL AND m.role IN ('owner','director')
  )) $$;
ALTER FUNCTION private.may_add_order_items(uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.may_add_order_items(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_add_order_items(uuid,uuid) TO unibos_app,unibos_onboarding;

CREATE FUNCTION private.lock_order_product(target_org uuid,target_branch uuid,target_product uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE locked_id uuid;
  BEGIN
    IF NOT private.may_add_order_items(target_org,target_branch) THEN RETURN false; END IF;
    SELECT p.id INTO locked_id FROM public.products p
      JOIN public.product_categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
      LEFT JOIN public.branch_product_availability a ON a.organization_id=p.organization_id
        AND a.branch_id=target_branch AND a.product_id=p.id
      WHERE p.organization_id=target_org AND p.id=target_product AND p.active AND c.active
        AND COALESCE(a.available,true) FOR UPDATE OF p;
    RETURN FOUND;
  END $$;
ALTER FUNCTION private.lock_order_product(uuid,uuid,uuid) OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.lock_order_product(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lock_order_product(uuid,uuid,uuid) TO unibos_app;

CREATE TABLE public.kitchen_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  ticket_number integer NOT NULL CHECK (ticket_number > 0),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','ACCEPTED','PREPARING','READY','SERVED','CANCELLED')),
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) BETWEEN 1 AND 300),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL DEFAULT private.actor_id() REFERENCES public.auth_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,branch_id,id),
  UNIQUE (organization_id,branch_id,id,order_id),
  UNIQUE (organization_id,branch_id,order_id,ticket_number),
  FOREIGN KEY (organization_id,branch_id) REFERENCES public.branches(organization_id,id),
  FOREIGN KEY (organization_id,branch_id,order_id) REFERENCES public.orders(organization_id,branch_id,id)
);
CREATE INDEX kitchen_tickets_queue_idx ON public.kitchen_tickets(organization_id,branch_id,status,created_at,id);

CREATE TABLE public.kitchen_ticket_items (
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,branch_id,ticket_id,order_item_id),
  UNIQUE (organization_id,branch_id,order_item_id),
  FOREIGN KEY (organization_id,branch_id,ticket_id,order_id) REFERENCES public.kitchen_tickets(organization_id,branch_id,id,order_id),
  FOREIGN KEY (organization_id,branch_id,order_id,order_item_id) REFERENCES public.order_items(organization_id,branch_id,order_id,id)
);

-- Preserve pre-P4.3 open orders by placing their existing immutable item snapshots
-- on a single initial kitchen ticket. This migration-time backfill uses each
-- order's original actor and timestamps; it does not rewrite order history.
INSERT INTO public.kitchen_tickets(
  organization_id,branch_id,order_id,ticket_number,status,cancel_reason,version,created_by,created_at,updated_at
)
SELECT o.organization_id,o.branch_id,o.id,1,
  CASE o.status
    WHEN 'SUBMITTED' THEN 'QUEUED'
    WHEN 'ACCEPTED' THEN 'ACCEPTED'
    WHEN 'PREPARING' THEN 'PREPARING'
    WHEN 'READY' THEN 'READY'
    WHEN 'SERVED' THEN 'SERVED'
    WHEN 'COMPLETED' THEN 'SERVED'
    WHEN 'CANCELLED' THEN 'CANCELLED'
  END,
  CASE WHEN o.status='CANCELLED' THEN 'Legacy cancelled order' ELSE NULL END,
  1,o.created_by,o.created_at,o.updated_at
FROM public.orders o
WHERE o.status IN ('SUBMITTED','ACCEPTED','PREPARING','READY','SERVED','COMPLETED','CANCELLED')
  AND EXISTS (SELECT 1 FROM public.order_items oi
    WHERE oi.organization_id=o.organization_id AND oi.branch_id=o.branch_id AND oi.order_id=o.id);

INSERT INTO public.kitchen_ticket_items(organization_id,branch_id,ticket_id,order_id,order_item_id)
SELECT t.organization_id,t.branch_id,t.id,t.order_id,oi.id
FROM public.kitchen_tickets t
JOIN public.order_items oi ON oi.organization_id=t.organization_id
  AND oi.branch_id=t.branch_id AND oi.order_id=t.order_id
WHERE t.ticket_number=1;

CREATE TABLE public.kitchen_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('TICKET_CREATED','STATUS_CHANGED')),
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('QUEUED','ACCEPTED','PREPARING','READY','SERVED','CANCELLED')),
  version integer NOT NULL CHECK (version > 0),
  actor_user_id text NOT NULL DEFAULT private.actor_id() REFERENCES public.auth_users(id),
  reason text CHECK (reason IS NULL OR length(reason) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,branch_id,ticket_id,version),
  FOREIGN KEY (organization_id,branch_id,ticket_id) REFERENCES public.kitchen_tickets(organization_id,branch_id,id)
);

INSERT INTO public.kitchen_ticket_events(
  organization_id,branch_id,ticket_id,event_type,to_status,version,actor_user_id,created_at
)
SELECT t.organization_id,t.branch_id,t.id,'TICKET_CREATED',t.status,t.version,t.created_by,t.created_at
FROM public.kitchen_tickets t WHERE t.ticket_number=1;

INSERT INTO public.audit_events(organization_id,branch_id,actor_user_id,action,entity_id,created_at)
SELECT t.organization_id,t.branch_id,t.created_by,'kitchen_tickets.insert',t.id,t.created_at
FROM public.kitchen_tickets t WHERE t.ticket_number=1;

UPDATE public.order_idempotency_keys k
SET result_ticket_id=t.id
FROM public.kitchen_tickets t
WHERE k.organization_id=t.organization_id AND k.branch_id=t.branch_id
  AND k.order_id=t.order_id AND k.operation='CREATE_ORDER'
  AND k.result_ticket_id IS NULL AND t.ticket_number=1;

ALTER TABLE public.order_idempotency_keys ADD CONSTRAINT order_idempotency_result_ticket_fk
  FOREIGN KEY (organization_id,branch_id,result_ticket_id)
  REFERENCES public.kitchen_tickets(organization_id,branch_id,id);

REVOKE ALL ON public.kitchen_tickets,public.kitchen_ticket_items,public.kitchen_ticket_events
  FROM PUBLIC,unibos_app,unibos_auth,unibos_rls_guard,unibos_onboarding;
GRANT SELECT,INSERT ON public.kitchen_tickets TO unibos_app;
GRANT UPDATE(status,version,updated_at,cancel_reason) ON public.kitchen_tickets TO unibos_app;
GRANT SELECT,INSERT ON public.kitchen_ticket_items TO unibos_app;
GRANT SELECT ON public.kitchen_ticket_events TO unibos_app;
GRANT SELECT,UPDATE(subtotal_minor,total_minor,version,updated_at,status) ON public.orders TO unibos_app;
GRANT INSERT ON public.order_items,public.order_events TO unibos_app;
GRANT SELECT,INSERT,UPDATE(result_ticket_id) ON public.order_idempotency_keys TO unibos_app;
GRANT INSERT ON public.audit_events TO unibos_onboarding;
GRANT SELECT ON public.orders,public.kitchen_tickets,public.kitchen_ticket_items,public.order_items,public.restaurant_tables TO unibos_rls_guard;
GRANT SELECT ON public.orders,public.kitchen_tickets,public.order_items TO unibos_onboarding;
GRANT UPDATE(subtotal_minor,total_minor,version,updated_at,status) ON public.orders TO unibos_onboarding;
GRANT INSERT(organization_id,branch_id,ticket_id,event_type,from_status,to_status,version,actor_user_id,reason)
  ON public.kitchen_ticket_events TO unibos_onboarding;
GRANT INSERT(organization_id,branch_id,order_id,event_type,actor_user_id,event_data)
  ON public.order_events TO unibos_onboarding;
GRANT SELECT ON public.product_categories,public.products,public.product_price_versions,public.branch_product_availability TO unibos_onboarding;
GRANT INSERT(organization_id,branch_id,order_id,product_id,product_name_snapshot,unit_price_minor,currency_code,quantity,line_total_minor,product_price_version,notes)
  ON public.order_items TO unibos_onboarding;

ALTER TABLE public.kitchen_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_ticket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_ticket_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_ticket_events FORCE ROW LEVEL SECURITY;

CREATE POLICY kitchen_tickets_select ON public.kitchen_tickets FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_operate_orders(organization_id,branch_id));
CREATE POLICY kitchen_tickets_insert ON public.kitchen_tickets FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND created_by=private.actor_id()
    AND private.may_add_order_items(organization_id,branch_id));
CREATE POLICY kitchen_tickets_update ON public.kitchen_tickets FOR UPDATE TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_operate_orders(organization_id,branch_id))
  WITH CHECK (organization_id=private.tenant_id() AND private.may_operate_orders(organization_id,branch_id));
CREATE POLICY kitchen_ticket_items_select ON public.kitchen_ticket_items FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_operate_orders(organization_id,branch_id));
CREATE POLICY kitchen_ticket_items_insert ON public.kitchen_ticket_items FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND private.may_add_order_items(organization_id,branch_id));
CREATE POLICY kitchen_ticket_events_select ON public.kitchen_ticket_events FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_operate_orders(organization_id,branch_id));
CREATE POLICY kitchen_ticket_events_insert ON public.kitchen_ticket_events FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND actor_user_id=private.actor_id()
    AND private.may_operate_orders(organization_id,branch_id));

CREATE FUNCTION private.may_add_order_item_to(target_org uuid,target_branch uuid,target_order uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND private.may_add_order_items(target_org,target_branch)
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.organization_id=target_org AND o.branch_id=target_branch
      AND o.id=target_order AND o.status IN ('SUBMITTED','ACCEPTED','PREPARING','READY')) $$;
ALTER FUNCTION private.may_add_order_item_to(uuid,uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.may_add_order_item_to(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_add_order_item_to(uuid,uuid,uuid) TO unibos_app,unibos_onboarding;
CREATE FUNCTION private.add_staff_order_item(
  target_org uuid,target_branch uuid,target_order uuid,target_product uuid,
  target_quantity numeric,target_price_version uuid,target_notes text
) RETURNS TABLE(id uuid,line_total_minor bigint)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE current_version uuid; current_price bigint; current_currency text; item_name text; inserted_id uuid;
  BEGIN
    IF target_quantity<=0 OR target_quantity>9999.999 THEN RAISE EXCEPTION 'invalid quantity' USING ERRCODE='22023'; END IF;
    IF target_notes IS NOT NULL AND length(target_notes)>300 THEN RAISE EXCEPTION 'invalid notes' USING ERRCODE='22023'; END IF;
    IF NOT private.lock_order_product(target_org,target_branch,target_product) THEN RAISE EXCEPTION 'product unavailable' USING ERRCODE='40001'; END IF;
    SELECT o.currency_code INTO current_currency FROM public.orders o
      WHERE o.organization_id=target_org AND o.branch_id=target_branch AND o.id=target_order
        AND o.status IN ('SUBMITTED','ACCEPTED','PREPARING','READY') FOR UPDATE;
    IF NOT FOUND OR NOT private.may_add_order_item_to(target_org,target_branch,target_order) THEN RAISE EXCEPTION 'order unavailable' USING ERRCODE='40001'; END IF;
    SELECT p.name,v.id,v.price_minor,v.currency_code INTO item_name,current_version,current_price,current_currency
      FROM public.products p JOIN public.product_categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
      LEFT JOIN public.branch_product_availability a ON a.organization_id=p.organization_id AND a.branch_id=target_branch AND a.product_id=p.id
      JOIN LATERAL (SELECT pv.id,pv.price_minor,pv.currency_code FROM public.product_price_versions pv WHERE pv.organization_id=p.organization_id
        AND pv.branch_id=target_branch AND pv.product_id=p.id AND pv.effective_at<=clock_timestamp() ORDER BY pv.effective_at DESC,pv.id DESC LIMIT 1) v ON true
      WHERE p.organization_id=target_org AND p.id=target_product AND p.active AND c.active AND COALESCE(a.available,true);
    IF current_version IS DISTINCT FROM target_price_version THEN RAISE EXCEPTION 'stale price' USING ERRCODE='40001'; END IF;
    IF current_currency IS DISTINCT FROM (SELECT o.currency_code FROM public.orders o WHERE o.organization_id=target_org AND o.branch_id=target_branch AND o.id=target_order) THEN
      RAISE EXCEPTION 'currency mismatch' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.order_items(organization_id,branch_id,order_id,product_id,product_name_snapshot,unit_price_minor,currency_code,quantity,line_total_minor,product_price_version,notes)
      VALUES(target_org,target_branch,target_order,target_product,item_name,current_price,current_currency,target_quantity,
        round(current_price*target_quantity)::bigint,current_version,target_notes) RETURNING order_items.id,order_items.line_total_minor INTO inserted_id,line_total_minor;
    id:=inserted_id; RETURN NEXT;
  END $$;
ALTER FUNCTION private.add_staff_order_item(uuid,uuid,uuid,uuid,numeric,uuid,text) OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.add_staff_order_item(uuid,uuid,uuid,uuid,numeric,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.add_staff_order_item(uuid,uuid,uuid,uuid,numeric,uuid,text) TO unibos_app;
CREATE POLICY order_events_operations_insert ON public.order_events FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND actor_user_id=private.actor_id()
    AND private.may_operate_orders(organization_id,branch_id));
CREATE POLICY order_idempotency_operations ON public.order_idempotency_keys FOR ALL TO unibos_app
  USING (organization_id=private.tenant_id() AND branch_id IS NOT NULL AND actor_user_id=private.actor_id()
    AND private.branch_access(organization_id,branch_id))
  WITH CHECK (organization_id=private.tenant_id() AND actor_user_id=private.actor_id()
    AND private.may_operate_orders(organization_id,branch_id));

CREATE FUNCTION private.record_kitchen_ticket_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ BEGIN
    INSERT INTO public.audit_events(organization_id,branch_id,actor_user_id,action,entity_id)
      VALUES (NEW.organization_id,NEW.branch_id,private.actor_id(),
        CASE WHEN TG_OP='INSERT' THEN 'kitchen_tickets.insert' ELSE 'kitchen_tickets.update' END,NEW.id);
    IF TG_OP='INSERT' THEN
      INSERT INTO public.kitchen_ticket_events(organization_id,branch_id,ticket_id,event_type,to_status,version,actor_user_id)
        VALUES (NEW.organization_id,NEW.branch_id,NEW.id,'TICKET_CREATED',NEW.status,NEW.version,private.actor_id());
    END IF;
    RETURN NEW;
  END $$;
ALTER FUNCTION private.record_kitchen_ticket_audit() OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.record_kitchen_ticket_audit() FROM PUBLIC;
CREATE TRIGGER kitchen_ticket_audit AFTER INSERT OR UPDATE ON public.kitchen_tickets
  FOR EACH ROW EXECUTE FUNCTION private.record_kitchen_ticket_audit();

CREATE FUNCTION private.reject_kitchen_history_mutation() RETURNS trigger
  LANGUAGE plpgsql SET search_path=pg_catalog
  AS $$ BEGIN RAISE EXCEPTION 'append-only history'; END $$;
REVOKE ALL ON FUNCTION private.reject_kitchen_history_mutation() FROM PUBLIC;
CREATE TRIGGER kitchen_ticket_items_immutable BEFORE UPDATE OR DELETE ON public.kitchen_ticket_items
  FOR EACH ROW EXECUTE FUNCTION private.reject_kitchen_history_mutation();
CREATE TRIGGER kitchen_ticket_events_immutable BEFORE UPDATE OR DELETE ON public.kitchen_ticket_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_kitchen_history_mutation();

-- Operational actors receive narrowly projected records without financial columns.
CREATE FUNCTION private.staff_order_context(target_org uuid,target_branch uuid,target_order uuid)
RETURNS TABLE(id uuid,status text,currency_code text,table_id uuid,version integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT o.id,o.status,o.currency_code,o.table_id,o.version FROM public.orders o
    WHERE o.organization_id=target_org AND o.branch_id=target_branch AND o.id=target_order
      AND private.actor_id() IS NOT NULL AND private.may_operate_orders(target_org,target_branch) $$;
ALTER FUNCTION private.staff_order_context(uuid,uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.staff_order_context(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.staff_order_context(uuid,uuid,uuid) TO unibos_app;

CREATE FUNCTION private.lock_staff_order(target_org uuid,target_branch uuid,target_order uuid)
RETURNS TABLE(id uuid,status text,currency_code text,table_id uuid,version integer)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ BEGIN
    IF NOT private.may_add_order_item_to(target_org,target_branch,target_order) THEN RETURN; END IF;
    RETURN QUERY SELECT o.id,o.status,o.currency_code,o.table_id,o.version FROM public.orders o
      WHERE o.organization_id=target_org AND o.branch_id=target_branch AND o.id=target_order FOR UPDATE;
  END $$;
ALTER FUNCTION private.lock_staff_order(uuid,uuid,uuid) OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.lock_staff_order(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lock_staff_order(uuid,uuid,uuid) TO unibos_app;

CREATE FUNCTION private.staff_active_orders(target_org uuid,target_branch uuid)
RETURNS TABLE(id uuid,table_id uuid,status text,version integer,created_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT o.id,o.table_id,o.status,o.version,o.created_at FROM public.orders o
    WHERE o.organization_id=target_org AND o.branch_id=target_branch
      AND o.status IN ('SUBMITTED','ACCEPTED','PREPARING','READY','SERVED')
      AND private.actor_id() IS NOT NULL AND private.may_operate_orders(target_org,target_branch) $$;
ALTER FUNCTION private.staff_active_orders(uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.staff_active_orders(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.staff_active_orders(uuid,uuid) TO unibos_app;

CREATE FUNCTION private.staff_ticket_context(target_org uuid,target_branch uuid,target_ticket uuid)
RETURNS TABLE(id uuid,order_id uuid,ticket_number integer,status text,version integer,created_at timestamptz,table_id uuid,table_code text,display_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT t.id,t.order_id,t.ticket_number,t.status,t.version,t.created_at,o.table_id,rt.table_code,rt.display_name
    FROM public.kitchen_tickets t JOIN public.orders o ON o.organization_id=t.organization_id AND o.branch_id=t.branch_id AND o.id=t.order_id
    LEFT JOIN public.restaurant_tables rt ON rt.organization_id=o.organization_id AND rt.branch_id=o.branch_id AND rt.id=o.table_id
    WHERE t.organization_id=target_org AND t.branch_id=target_branch
      AND (target_ticket IS NULL OR t.id=target_ticket)
      AND t.status NOT IN ('SERVED','CANCELLED')
      AND private.actor_id() IS NOT NULL AND private.may_operate_orders(target_org,target_branch) $$;
ALTER FUNCTION private.staff_ticket_context(uuid,uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.staff_ticket_context(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.staff_ticket_context(uuid,uuid,uuid) TO unibos_app;

CREATE FUNCTION private.staff_ticket_items(target_org uuid,target_branch uuid,target_ticket uuid)
RETURNS TABLE(product_name_snapshot text,quantity text,notes text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT oi.product_name_snapshot,oi.quantity::text,oi.notes
    FROM public.kitchen_ticket_items ti JOIN public.order_items oi
      ON oi.organization_id=ti.organization_id AND oi.branch_id=ti.branch_id
      AND oi.order_id=ti.order_id AND oi.id=ti.order_item_id
    WHERE ti.organization_id=target_org AND ti.branch_id=target_branch AND ti.ticket_id=target_ticket
      AND private.actor_id() IS NOT NULL AND private.may_operate_orders(target_org,target_branch) $$;
ALTER FUNCTION private.staff_ticket_items(uuid,uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.staff_ticket_items(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.staff_ticket_items(uuid,uuid,uuid) TO unibos_app;

CREATE FUNCTION private.recalculate_order_total(target_org uuid,target_branch uuid,target_order uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE computed_total numeric;
  BEGIN
    IF NOT private.may_add_order_item_to(target_org,target_branch,target_order) THEN RAISE EXCEPTION 'order unavailable'; END IF;
    SELECT COALESCE(sum(i.line_total_minor),0) INTO computed_total FROM public.order_items i
      WHERE i.organization_id=target_org AND i.branch_id=target_branch AND i.order_id=target_order;
    IF computed_total>9000000000000000 THEN RAISE EXCEPTION 'order total out of range' USING ERRCODE='22003'; END IF;
    UPDATE public.orders o SET subtotal_minor=computed_total::bigint,total_minor=computed_total::bigint,
      version=o.version+1,updated_at=now()
      WHERE o.organization_id=target_org AND o.branch_id=target_branch AND o.id=target_order;
  END $$;
ALTER FUNCTION private.recalculate_order_total(uuid,uuid,uuid) OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.recalculate_order_total(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.recalculate_order_total(uuid,uuid,uuid) TO unibos_app;

CREATE FUNCTION private.recalculate_order_status(target_org uuid,target_branch uuid,target_order uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE result_status text; active_count integer;
  BEGIN
    IF NOT private.may_operate_orders(target_org,target_branch) THEN RAISE EXCEPTION 'order unavailable'; END IF;
    SELECT count(*),
      CASE WHEN bool_or(status='PREPARING') THEN 'PREPARING'
      WHEN bool_or(status='ACCEPTED') THEN 'ACCEPTED'
      WHEN bool_and(status IN ('READY','SERVED')) AND bool_and(status='SERVED') THEN 'SERVED'
      WHEN bool_and(status IN ('READY','SERVED')) THEN 'READY'
      ELSE 'SUBMITTED' END INTO active_count,result_status
      FROM public.kitchen_tickets WHERE organization_id=target_org AND branch_id=target_branch AND order_id=target_order AND status<>'CANCELLED';
    IF active_count=0 THEN result_status:='CANCELLED'; END IF;
    UPDATE public.orders SET status=result_status,version=version+1,updated_at=now()
      WHERE organization_id=target_org AND branch_id=target_branch AND id=target_order
        AND status IN ('SUBMITTED','ACCEPTED','PREPARING','READY');
    RETURN result_status;
  END $$;
ALTER FUNCTION private.recalculate_order_status(uuid,uuid,uuid) OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.recalculate_order_status(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.recalculate_order_status(uuid,uuid,uuid) TO unibos_app;

CREATE FUNCTION private.may_kitchen_orders(target_org uuid,target_branch uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND private.tenant_id()=target_org AND (
    EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id=target_branch
      AND m.role IN ('kitchen','administrator')) OR
    EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id IS NULL AND m.role IN ('owner','director'))
  ) $$;
ALTER FUNCTION private.may_kitchen_orders(uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.may_kitchen_orders(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_kitchen_orders(uuid,uuid) TO unibos_app,unibos_onboarding;

CREATE FUNCTION private.may_serve_orders(target_org uuid,target_branch uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND private.tenant_id()=target_org AND (
    EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id=target_branch
      AND m.role IN ('waiter','cashier','administrator')) OR
    EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id IS NULL AND m.role IN ('owner','director'))
  ) $$;
ALTER FUNCTION private.may_serve_orders(uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.may_serve_orders(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_serve_orders(uuid,uuid) TO unibos_app,unibos_onboarding;

CREATE FUNCTION private.guard_kitchen_ticket_transition() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ BEGIN
    IF NEW.version<>OLD.version+1 OR NOT (
      (OLD.status='QUEUED' AND NEW.status IN ('ACCEPTED','CANCELLED')) OR
      (OLD.status='ACCEPTED' AND NEW.status IN ('PREPARING','CANCELLED')) OR
      (OLD.status='PREPARING' AND NEW.status IN ('READY','CANCELLED')) OR
      (OLD.status='READY' AND NEW.status='SERVED')
    ) THEN RAISE EXCEPTION 'invalid ticket transition' USING ERRCODE='23514'; END IF;
    IF NEW.status='SERVED' THEN
      IF NOT private.may_serve_orders(NEW.organization_id,NEW.branch_id) THEN RAISE EXCEPTION 'not authorized to serve' USING ERRCODE='42501'; END IF;
    ELSIF NOT private.may_kitchen_orders(NEW.organization_id,NEW.branch_id) THEN
      RAISE EXCEPTION 'not authorized for kitchen transition' USING ERRCODE='42501';
    END IF;
    IF NEW.status='CANCELLED' AND (NEW.cancel_reason IS NULL OR length(btrim(NEW.cancel_reason))=0) THEN
      RAISE EXCEPTION 'cancellation reason required' USING ERRCODE='23514';
    END IF;
    IF NEW.status<>'CANCELLED' AND NEW.cancel_reason IS NOT NULL THEN
      RAISE EXCEPTION 'unexpected cancellation reason' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
ALTER FUNCTION private.guard_kitchen_ticket_transition() OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.guard_kitchen_ticket_transition() FROM PUBLIC;
CREATE TRIGGER kitchen_ticket_transition_guard BEFORE UPDATE OF status,version,cancel_reason ON public.kitchen_tickets
  FOR EACH ROW EXECUTE FUNCTION private.guard_kitchen_ticket_transition();

CREATE FUNCTION private.record_kitchen_ticket_transition() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE order_status text;
  BEGIN
    INSERT INTO public.kitchen_ticket_events(organization_id,branch_id,ticket_id,event_type,from_status,to_status,version,actor_user_id,reason)
      VALUES (NEW.organization_id,NEW.branch_id,NEW.id,'STATUS_CHANGED',OLD.status,NEW.status,NEW.version,private.actor_id(),NEW.cancel_reason);
    SELECT private.recalculate_order_status(NEW.organization_id,NEW.branch_id,NEW.order_id) INTO order_status;
    INSERT INTO public.order_events(organization_id,branch_id,order_id,event_type,actor_user_id,event_data)
      VALUES (NEW.organization_id,NEW.branch_id,NEW.order_id,'ORDER_STATUS_CHANGED',private.actor_id(),
        jsonb_build_object('ticketId',NEW.id,'fromStatus',OLD.status,'toStatus',NEW.status,'orderStatus',order_status));
    RETURN NEW;
  END $$;
ALTER FUNCTION private.record_kitchen_ticket_transition() OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.record_kitchen_ticket_transition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.recalculate_order_status(uuid,uuid,uuid) TO unibos_onboarding;
CREATE TRIGGER kitchen_ticket_transition_events AFTER UPDATE OF status ON public.kitchen_tickets
  FOR EACH ROW EXECUTE FUNCTION private.record_kitchen_ticket_transition();

CREATE FUNCTION private.require_kitchen_ticket_items() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.kitchen_ticket_items i WHERE i.organization_id=NEW.organization_id
      AND i.branch_id=NEW.branch_id AND i.ticket_id=NEW.id) THEN
      RAISE EXCEPTION 'kitchen ticket must contain at least one item' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
ALTER FUNCTION private.require_kitchen_ticket_items() OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.require_kitchen_ticket_items() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER kitchen_ticket_nonempty AFTER INSERT ON public.kitchen_tickets
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.require_kitchen_ticket_items();
