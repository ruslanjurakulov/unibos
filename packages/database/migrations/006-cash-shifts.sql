-- P4.4.1 cashier shifts. Forward-only; validate on a disposable PostgreSQL database.
ALTER TABLE public.audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (
  action IN (
    'organizations.insert','organizations.update','branches.insert','branches.update',
    'memberships.insert','memberships.update','memberships.delete',
    'product_categories.insert','product_categories.update','products.insert','products.update',
    'product_price_versions.insert','branch_product_availability.insert','branch_product_availability.update',
    'restaurant_tables.insert','restaurant_tables.update','table_qr_tokens.insert','table_qr_tokens.update',
    'orders.insert','orders.update','kitchen_tickets.insert','kitchen_tickets.update',
    'cash_shifts.insert','cash_shifts.update','cash_shift_events.insert','cash_drawer_movements.insert'
  )
);

CREATE FUNCTION private.may_read_cash_shifts(target_org uuid,target_branch uuid,target_cashier text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND private.tenant_id()=target_org AND (
    EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id=target_branch
      AND m.role IN ('administrator','accountant')) OR
    EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id=target_branch AND m.role='cashier'
      AND target_cashier=private.actor_id()) OR
    EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id IS NULL AND m.role IN ('owner','director'))
  ) $$;
ALTER FUNCTION private.may_read_cash_shifts(uuid,uuid,text) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.may_read_cash_shifts(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_read_cash_shifts(uuid,uuid,text) TO unibos_app;

CREATE FUNCTION private.may_operate_cash_shifts(target_org uuid,target_branch uuid,target_cashier text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND private.tenant_id()=target_org AND (
    EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id=target_branch
      AND m.role='administrator') OR
    EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id=target_branch AND m.role='cashier'
      AND target_cashier=private.actor_id()) OR
    EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=target_org
      AND m.user_id=private.actor_id() AND m.branch_id IS NULL AND m.role IN ('owner','director'))
  ) $$;
ALTER FUNCTION private.may_operate_cash_shifts(uuid,uuid,text) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.may_operate_cash_shifts(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_operate_cash_shifts(uuid,uuid,text) TO unibos_app;

CREATE TABLE public.cash_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  cashier_user_id text NOT NULL REFERENCES public.auth_users(id),
  currency_code text NOT NULL CHECK (currency_code IN ('UZS','USD','EUR','RUB')),
  opening_amount_minor bigint NOT NULL CHECK (opening_amount_minor BETWEEN 0 AND 1000000000000),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSING','CLOSED')),
  closing_expected_minor bigint CHECK (closing_expected_minor BETWEEN 0 AND 1000000000000),
  counted_cash_minor bigint CHECK (counted_cash_minor BETWEEN 0 AND 1000000000000),
  variance_minor bigint CHECK (variance_minor BETWEEN -1000000000000 AND 1000000000000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closing_started_at timestamptz,
  closed_at timestamptz,
  created_by text NOT NULL DEFAULT private.actor_id() REFERENCES public.auth_users(id),
  UNIQUE (organization_id,branch_id,id),
  FOREIGN KEY (organization_id,branch_id) REFERENCES public.branches(organization_id,id),
  CHECK (
    (status='OPEN' AND closing_expected_minor IS NULL AND counted_cash_minor IS NULL AND variance_minor IS NULL AND closing_started_at IS NULL AND closed_at IS NULL) OR
    (status='CLOSING' AND closing_expected_minor IS NOT NULL AND counted_cash_minor IS NOT NULL AND variance_minor IS NULL AND closing_started_at IS NOT NULL AND closed_at IS NULL) OR
    (status='CLOSED' AND closing_expected_minor IS NOT NULL AND counted_cash_minor IS NOT NULL AND variance_minor= counted_cash_minor-closing_expected_minor AND closing_started_at IS NOT NULL AND closed_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX cash_shifts_one_active_cashier_idx
  ON public.cash_shifts(organization_id,branch_id,cashier_user_id)
  WHERE status IN ('OPEN','CLOSING');
CREATE INDEX cash_shifts_history_idx ON public.cash_shifts(organization_id,branch_id,opened_at DESC,id);

CREATE TABLE public.cash_shift_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('OPENED','MOVEMENT_RECORDED','CLOSING_STARTED','CLOSED')),
  version integer NOT NULL CHECK (version > 0),
  actor_user_id text NOT NULL DEFAULT private.actor_id() REFERENCES public.auth_users(id),
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(event_data::text)<=4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,branch_id,shift_id,version),
  FOREIGN KEY (organization_id,branch_id,shift_id) REFERENCES public.cash_shifts(organization_id,branch_id,id)
);
CREATE INDEX cash_shift_events_history_idx ON public.cash_shift_events(organization_id,branch_id,shift_id,created_at,id);

CREATE TABLE public.cash_drawer_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('CASH_IN','CASH_OUT')),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000000),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 300),
  created_by text NOT NULL DEFAULT private.actor_id() REFERENCES public.auth_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,branch_id,shift_id,id),
  FOREIGN KEY (organization_id,branch_id,shift_id) REFERENCES public.cash_shifts(organization_id,branch_id,id)
);
CREATE INDEX cash_drawer_movements_shift_idx ON public.cash_drawer_movements(organization_id,branch_id,shift_id,created_at,id);

CREATE FUNCTION private.guard_cash_drawer_movement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE opening_amount bigint; shift_status text; expected_amount numeric; proposed_amount numeric;
  BEGIN
    SELECT opening_amount_minor,status INTO opening_amount,shift_status
      FROM public.cash_shifts
      WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND id=NEW.shift_id
      FOR UPDATE;
    IF NOT FOUND OR shift_status<>'OPEN' THEN
      RAISE EXCEPTION 'cash shift is not open' USING ERRCODE='23514';
    END IF;
    SELECT opening_amount + COALESCE(sum(CASE movement_type WHEN 'CASH_IN' THEN amount_minor ELSE -amount_minor END),0)
      INTO expected_amount FROM public.cash_drawer_movements
      WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND shift_id=NEW.shift_id;
    proposed_amount := expected_amount + CASE NEW.movement_type WHEN 'CASH_IN' THEN NEW.amount_minor ELSE -NEW.amount_minor END;
    IF proposed_amount<0 OR proposed_amount>1000000000000 THEN
      RAISE EXCEPTION 'cash drawer balance outside permitted range' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
ALTER FUNCTION private.guard_cash_drawer_movement() OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.guard_cash_drawer_movement() FROM PUBLIC;
CREATE TRIGGER cash_drawer_movement_guard BEFORE INSERT ON public.cash_drawer_movements
  FOR EACH ROW EXECUTE FUNCTION private.guard_cash_drawer_movement();

CREATE FUNCTION private.guard_cash_shift_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$
  BEGIN
    IF (NEW.organization_id,NEW.branch_id,NEW.cashier_user_id,NEW.currency_code,NEW.opening_amount_minor,NEW.opened_at,NEW.created_by)
       IS DISTINCT FROM
       (OLD.organization_id,OLD.branch_id,OLD.cashier_user_id,OLD.currency_code,OLD.opening_amount_minor,OLD.opened_at,OLD.created_by)
      OR NEW.version<>OLD.version+1 THEN
      RAISE EXCEPTION 'cash shift immutable fields or version invalid' USING ERRCODE='23514';
    END IF;
    IF OLD.status='OPEN' AND NEW.status='OPEN' THEN
      IF NEW.closing_expected_minor IS NOT NULL OR NEW.counted_cash_minor IS NOT NULL OR NEW.variance_minor IS NOT NULL
        OR NEW.closing_started_at IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
        RAISE EXCEPTION 'open cash shift contains closing data' USING ERRCODE='23514';
      END IF;
    ELSIF OLD.status='OPEN' AND NEW.status='CLOSING' THEN
      IF NEW.closing_expected_minor IS DISTINCT FROM
        OLD.opening_amount_minor + COALESCE((SELECT sum(CASE movement_type WHEN 'CASH_IN' THEN amount_minor ELSE -amount_minor END)
          FROM public.cash_drawer_movements WHERE organization_id=OLD.organization_id AND branch_id=OLD.branch_id AND shift_id=OLD.id),0)
        OR NEW.counted_cash_minor IS NULL OR NEW.closing_started_at IS NULL OR NEW.closed_at IS NOT NULL OR NEW.variance_minor IS NOT NULL THEN
        RAISE EXCEPTION 'cash shift close snapshot invalid' USING ERRCODE='23514';
      END IF;
    ELSIF OLD.status='CLOSING' AND NEW.status='CLOSED' THEN
      IF NEW.closing_expected_minor IS DISTINCT FROM OLD.closing_expected_minor
        OR NEW.counted_cash_minor IS DISTINCT FROM OLD.counted_cash_minor
        OR NEW.closing_started_at IS DISTINCT FROM OLD.closing_started_at
        OR NEW.variance_minor IS DISTINCT FROM NEW.counted_cash_minor-NEW.closing_expected_minor
        OR NEW.closed_at IS NULL THEN
        RAISE EXCEPTION 'cash shift close result invalid' USING ERRCODE='23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid cash shift transition' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
ALTER FUNCTION private.guard_cash_shift_update() OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.guard_cash_shift_update() FROM PUBLIC;
CREATE TRIGGER cash_shift_transition_guard BEFORE UPDATE ON public.cash_shifts
  FOR EACH ROW EXECUTE FUNCTION private.guard_cash_shift_update();

CREATE TABLE public.cash_shift_idempotency_keys (
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  actor_user_id text NOT NULL REFERENCES public.auth_users(id),
  operation text NOT NULL CHECK (operation IN ('OPEN_SHIFT','ADD_MOVEMENT','BEGIN_CLOSE','CONFIRM_CLOSE')),
  idempotency_key uuid NOT NULL,
  request_hash bytea NOT NULL CHECK (octet_length(request_hash)=32),
  shift_id uuid NOT NULL,
  movement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,branch_id,actor_user_id,operation,idempotency_key),
  FOREIGN KEY (organization_id,branch_id,shift_id) REFERENCES public.cash_shifts(organization_id,branch_id,id),
  FOREIGN KEY (organization_id,branch_id,shift_id,movement_id) REFERENCES public.cash_drawer_movements(organization_id,branch_id,shift_id,id)
);

REVOKE ALL ON public.cash_shifts,public.cash_shift_events,public.cash_drawer_movements,public.cash_shift_idempotency_keys FROM PUBLIC,unibos_app,unibos_auth,unibos_rls_guard,unibos_onboarding;
GRANT SELECT ON public.cash_shifts,public.cash_drawer_movements TO unibos_rls_guard;
GRANT UPDATE(version) ON public.cash_shifts TO unibos_rls_guard;
GRANT SELECT,INSERT ON public.cash_shifts TO unibos_app;
GRANT UPDATE(status,closing_expected_minor,counted_cash_minor,variance_minor,version,closing_started_at,closed_at) ON public.cash_shifts TO unibos_app;
GRANT SELECT,INSERT ON public.cash_shift_events,public.cash_drawer_movements TO unibos_app;
GRANT SELECT,INSERT ON public.cash_shift_idempotency_keys TO unibos_app;
GRANT INSERT ON public.audit_events TO unibos_onboarding;

ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shifts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shift_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shift_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawer_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawer_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shift_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shift_idempotency_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY cash_shifts_select ON public.cash_shifts FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_read_cash_shifts(organization_id,branch_id,cashier_user_id));
CREATE POLICY cash_shifts_insert ON public.cash_shifts FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND cashier_user_id=private.actor_id() AND created_by=private.actor_id()
    AND status='OPEN' AND private.may_operate_cash_shifts(organization_id,branch_id,cashier_user_id));
CREATE POLICY cash_shifts_update ON public.cash_shifts FOR UPDATE TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_operate_cash_shifts(organization_id,branch_id,cashier_user_id))
  WITH CHECK (organization_id=private.tenant_id() AND private.may_operate_cash_shifts(organization_id,branch_id,cashier_user_id));
CREATE POLICY cash_shift_events_select ON public.cash_shift_events FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND EXISTS (SELECT 1 FROM public.cash_shifts s
    WHERE s.organization_id=cash_shift_events.organization_id AND s.branch_id=cash_shift_events.branch_id
      AND s.id=cash_shift_events.shift_id AND private.may_read_cash_shifts(s.organization_id,s.branch_id,s.cashier_user_id)));
CREATE POLICY cash_shift_events_insert ON public.cash_shift_events FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND actor_user_id=private.actor_id() AND EXISTS (SELECT 1 FROM public.cash_shifts s
    WHERE s.organization_id=cash_shift_events.organization_id AND s.branch_id=cash_shift_events.branch_id
      AND s.id=cash_shift_events.shift_id AND private.may_operate_cash_shifts(s.organization_id,s.branch_id,s.cashier_user_id)));
CREATE POLICY cash_drawer_movements_select ON public.cash_drawer_movements FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND EXISTS (SELECT 1 FROM public.cash_shifts s
    WHERE s.organization_id=cash_drawer_movements.organization_id AND s.branch_id=cash_drawer_movements.branch_id
      AND s.id=cash_drawer_movements.shift_id AND private.may_read_cash_shifts(s.organization_id,s.branch_id,s.cashier_user_id)));
CREATE POLICY cash_drawer_movements_insert ON public.cash_drawer_movements FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND created_by=private.actor_id() AND EXISTS (SELECT 1 FROM public.cash_shifts s
    WHERE s.organization_id=cash_drawer_movements.organization_id AND s.branch_id=cash_drawer_movements.branch_id
      AND s.id=cash_drawer_movements.shift_id AND s.status='OPEN'
      AND private.may_operate_cash_shifts(s.organization_id,s.branch_id,s.cashier_user_id)));
CREATE POLICY cash_shift_idempotency_keys_policy ON public.cash_shift_idempotency_keys FOR ALL TO unibos_app
  USING (organization_id=private.tenant_id() AND actor_user_id=private.actor_id() AND EXISTS (SELECT 1 FROM public.cash_shifts s
    WHERE s.organization_id=cash_shift_idempotency_keys.organization_id AND s.branch_id=cash_shift_idempotency_keys.branch_id
      AND s.id=cash_shift_idempotency_keys.shift_id AND private.may_operate_cash_shifts(s.organization_id,s.branch_id,s.cashier_user_id)))
  WITH CHECK (organization_id=private.tenant_id() AND actor_user_id=private.actor_id() AND EXISTS (SELECT 1 FROM public.cash_shifts s
    WHERE s.organization_id=cash_shift_idempotency_keys.organization_id AND s.branch_id=cash_shift_idempotency_keys.branch_id
      AND s.id=cash_shift_idempotency_keys.shift_id AND private.may_operate_cash_shifts(s.organization_id,s.branch_id,s.cashier_user_id)));

CREATE FUNCTION private.record_cash_shift_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE action_name text;
  BEGIN
    action_name := TG_TABLE_NAME || CASE WHEN TG_OP='INSERT' THEN '.insert' ELSE '.update' END;
    INSERT INTO public.audit_events(organization_id,branch_id,actor_user_id,action,entity_id)
      VALUES(NEW.organization_id,NEW.branch_id,private.actor_id(),action_name,NEW.id);
    RETURN NEW;
  END $$;
ALTER FUNCTION private.record_cash_shift_audit() OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.record_cash_shift_audit() FROM PUBLIC;
CREATE TRIGGER cash_shifts_audit AFTER INSERT OR UPDATE ON public.cash_shifts
  FOR EACH ROW EXECUTE FUNCTION private.record_cash_shift_audit();
CREATE TRIGGER cash_shift_events_audit AFTER INSERT ON public.cash_shift_events
  FOR EACH ROW EXECUTE FUNCTION private.record_cash_shift_audit();
CREATE TRIGGER cash_drawer_movements_audit AFTER INSERT ON public.cash_drawer_movements
  FOR EACH ROW EXECUTE FUNCTION private.record_cash_shift_audit();
