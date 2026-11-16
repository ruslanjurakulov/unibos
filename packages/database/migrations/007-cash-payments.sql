-- P4.4.2 internal cash settlement. No external payment or fiscal integration.
ALTER TABLE public.orders
  ADD COLUMN payment_status text NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID','PAID')),
  ADD COLUMN paid_at timestamptz;
ALTER TABLE public.orders ADD CONSTRAINT orders_paid_timestamp_check
  CHECK ((payment_status='UNPAID' AND paid_at IS NULL) OR (payment_status='PAID' AND paid_at IS NOT NULL));

ALTER TABLE public.order_events DROP CONSTRAINT order_events_event_type_check;
ALTER TABLE public.order_events ADD CONSTRAINT order_events_event_type_check
  CHECK (event_type IN ('ORDER_SUBMITTED','ORDER_ITEMS_ADDED','ORDER_STATUS_CHANGED','BILL_REQUESTED','CASH_PAYMENT_RECORDED'));

CREATE OR REPLACE FUNCTION private.may_add_order_item_to(target_org uuid,target_branch uuid,target_order uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id() IS NOT NULL AND private.may_add_order_items(target_org,target_branch)
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.organization_id=target_org AND o.branch_id=target_branch
      AND o.id=target_order AND o.payment_status='UNPAID'
      AND o.status IN ('SUBMITTED','ACCEPTED','PREPARING','READY')) $$;
ALTER FUNCTION private.may_add_order_item_to(uuid,uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.may_add_order_item_to(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_add_order_item_to(uuid,uuid,uuid) TO unibos_app,unibos_onboarding;

CREATE FUNCTION private.staff_order_payment_status(target_org uuid,target_branch uuid,target_order uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT o.payment_status FROM public.orders o
    WHERE o.organization_id=target_org AND o.branch_id=target_branch AND o.id=target_order
      AND private.actor_id() IS NOT NULL AND private.may_operate_orders(target_org,target_branch) $$;
ALTER FUNCTION private.staff_order_payment_status(uuid,uuid,uuid) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.staff_order_payment_status(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.staff_order_payment_status(uuid,uuid,uuid) TO unibos_app;

ALTER TABLE public.cash_shift_events DROP CONSTRAINT cash_shift_events_event_type_check;
ALTER TABLE public.cash_shift_events ADD CONSTRAINT cash_shift_events_event_type_check
  CHECK (event_type IN ('OPENED','MOVEMENT_RECORDED','CLOSING_STARTED','CLOSED','CASH_PAYMENT_RECORDED'));

CREATE TABLE public.cash_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  order_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  cashier_user_id text NOT NULL REFERENCES public.auth_users(id),
  payment_method text NOT NULL DEFAULT 'CASH' CHECK (payment_method='CASH'),
  status text NOT NULL DEFAULT 'RECORDED' CHECK (status='RECORDED'),
  fiscal_status text NOT NULL DEFAULT 'NOT_ISSUED' CHECK (fiscal_status='NOT_ISSUED'),
  currency_code text NOT NULL CHECK (currency_code IN ('UZS','USD','EUR','RUB')),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000000),
  cash_received_minor bigint NOT NULL CHECK (cash_received_minor BETWEEN 1 AND 1000000000000),
  change_minor bigint NOT NULL CHECK (change_minor BETWEEN 0 AND 1000000000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,branch_id,id),
  FOREIGN KEY (organization_id,branch_id,order_id) REFERENCES public.orders(organization_id,branch_id,id),
  FOREIGN KEY (organization_id,branch_id,shift_id) REFERENCES public.cash_shifts(organization_id,branch_id,id),
  CHECK (cash_received_minor=amount_minor+change_minor)
);
CREATE INDEX cash_payments_branch_created_idx ON public.cash_payments(organization_id,branch_id,created_at DESC,id);
CREATE INDEX cash_payments_shift_idx ON public.cash_payments(organization_id,branch_id,shift_id,created_at,id);

CREATE TABLE public.cash_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type='CASH_PAYMENT_RECORDED'),
  actor_user_id text NOT NULL REFERENCES public.auth_users(id),
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(event_data::text)<=4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,branch_id,payment_id) REFERENCES public.cash_payments(organization_id,branch_id,id)
);

CREATE TABLE public.cash_payment_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  account_code text NOT NULL CHECK (account_code IN ('CASH_DRAWER','ORDER_RECEIVABLE')),
  direction text NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000000),
  currency_code text NOT NULL CHECK (currency_code IN ('UZS','USD','EUR','RUB')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,branch_id,payment_id) REFERENCES public.cash_payments(organization_id,branch_id,id),
  UNIQUE (organization_id,branch_id,payment_id,account_code)
);

CREATE TABLE public.cash_payment_idempotency_keys (
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  actor_user_id text NOT NULL REFERENCES public.auth_users(id),
  operation text NOT NULL CHECK (operation='RECORD_CASH_PAYMENT'),
  idempotency_key uuid NOT NULL,
  request_hash bytea NOT NULL CHECK (octet_length(request_hash)=32),
  payment_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,branch_id,actor_user_id,operation,idempotency_key),
  FOREIGN KEY (organization_id,branch_id,payment_id) REFERENCES public.cash_payments(organization_id,branch_id,id)
);

REVOKE ALL ON public.cash_payments,public.cash_payment_events,public.cash_payment_ledger_entries,public.cash_payment_idempotency_keys FROM PUBLIC,unibos_app,unibos_auth,unibos_rls_guard,unibos_onboarding;
GRANT SELECT,INSERT ON public.cash_payments TO unibos_app;
GRANT SELECT,INSERT ON public.cash_payment_events,public.cash_payment_ledger_entries TO unibos_app;
GRANT SELECT,INSERT ON public.cash_payment_idempotency_keys TO unibos_app;
GRANT SELECT ON public.cash_payments,public.cash_drawer_movements TO unibos_rls_guard;
GRANT SELECT ON public.cash_payment_ledger_entries TO unibos_rls_guard;
GRANT SELECT,UPDATE(payment_status,paid_at,version,updated_at) ON public.orders TO unibos_onboarding;
GRANT UPDATE(id) ON public.orders TO unibos_onboarding;
GRANT SELECT ON public.orders,public.cash_shifts TO unibos_onboarding;
GRANT INSERT(organization_id,branch_id,order_id,event_type,actor_user_id,event_data) ON public.order_events TO unibos_onboarding;
GRANT INSERT(organization_id,branch_id,shift_id,event_type,version,actor_user_id,event_data) ON public.cash_shift_events TO unibos_onboarding;
GRANT UPDATE(version) ON public.cash_shifts TO unibos_onboarding;
GRANT INSERT ON public.cash_payment_events,public.cash_payment_ledger_entries TO unibos_onboarding;
GRANT INSERT ON public.audit_events TO unibos_onboarding;

ALTER TABLE public.cash_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payment_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payment_ledger_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payment_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payment_idempotency_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY cash_payments_select ON public.cash_payments FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_read_order_financials(organization_id,branch_id));
CREATE POLICY cash_payments_insert ON public.cash_payments FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND cashier_user_id=private.actor_id());
CREATE POLICY cash_payment_events_select ON public.cash_payment_events FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_read_order_financials(organization_id,branch_id));
CREATE POLICY cash_payment_events_insert ON public.cash_payment_events FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND actor_user_id=private.actor_id());
CREATE POLICY cash_payment_ledger_select ON public.cash_payment_ledger_entries FOR SELECT TO unibos_app
  USING (organization_id=private.tenant_id() AND private.may_read_order_financials(organization_id,branch_id));
CREATE POLICY cash_payment_ledger_insert ON public.cash_payment_ledger_entries FOR INSERT TO unibos_app
  WITH CHECK (organization_id=private.tenant_id() AND EXISTS (SELECT 1 FROM public.cash_payments p
    WHERE p.organization_id=cash_payment_ledger_entries.organization_id AND p.branch_id=cash_payment_ledger_entries.branch_id
      AND p.id=cash_payment_ledger_entries.payment_id));
CREATE POLICY cash_payment_idempotency_policy ON public.cash_payment_idempotency_keys FOR ALL TO unibos_app
  USING (organization_id=private.tenant_id() AND actor_user_id=private.actor_id() AND private.branch_access(organization_id,branch_id))
  WITH CHECK (organization_id=private.tenant_id() AND actor_user_id=private.actor_id() AND private.branch_access(organization_id,branch_id));

CREATE FUNCTION private.is_branch_cashier(target_org uuid,target_branch uuid,target_user text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
  AS $$ SELECT private.actor_id()=target_user AND EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.organization_id=target_org AND m.branch_id=target_branch AND m.user_id=target_user AND m.role='cashier') $$;
ALTER FUNCTION private.is_branch_cashier(uuid,uuid,text) OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.is_branch_cashier(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_branch_cashier(uuid,uuid,text) TO unibos_onboarding;

CREATE FUNCTION private.lock_cash_payment_order(target_org uuid,target_branch uuid,target_order uuid)
  RETURNS TABLE(id uuid,status text,payment_status text,total_minor text,currency_code text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ BEGIN
    IF NOT private.is_branch_cashier(target_org,target_branch,private.actor_id()) THEN RETURN; END IF;
    RETURN QUERY SELECT o.id,o.status,o.payment_status,o.total_minor::text,o.currency_code
      FROM public.orders o WHERE o.organization_id=target_org AND o.branch_id=target_branch AND o.id=target_order FOR UPDATE;
  END $$;
ALTER FUNCTION private.lock_cash_payment_order(uuid,uuid,uuid) OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.lock_cash_payment_order(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lock_cash_payment_order(uuid,uuid,uuid) TO unibos_app;

CREATE FUNCTION private.guard_cash_payment() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE order_row record; shift_row record; BEGIN
    SELECT id,status,payment_status,total_minor,currency_code INTO order_row FROM public.orders
      WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND id=NEW.order_id FOR UPDATE;
    IF NOT FOUND OR order_row.status='CANCELLED' OR order_row.payment_status<>'UNPAID'
      OR order_row.total_minor<>NEW.amount_minor OR order_row.currency_code<>NEW.currency_code
      OR NEW.cash_received_minor<order_row.total_minor OR NEW.change_minor<>NEW.cash_received_minor-order_row.total_minor THEN
      RAISE EXCEPTION 'cash payment does not match payable order' USING ERRCODE='23514';
    END IF;
    SELECT id,status,currency_code,cashier_user_id INTO shift_row FROM public.cash_shifts
      WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND id=NEW.shift_id FOR UPDATE;
    IF NOT FOUND OR shift_row.status<>'OPEN' OR shift_row.currency_code<>NEW.currency_code
      OR shift_row.cashier_user_id<>NEW.cashier_user_id OR NEW.cashier_user_id<>private.actor_id()
      OR NOT private.is_branch_cashier(NEW.organization_id,NEW.branch_id,NEW.cashier_user_id) THEN
      RAISE EXCEPTION 'cash payment requires the cashier active shift' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END $$;
ALTER FUNCTION private.guard_cash_payment() OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.guard_cash_payment() FROM PUBLIC;
CREATE TRIGGER cash_payment_guard BEFORE INSERT ON public.cash_payments FOR EACH ROW EXECUTE FUNCTION private.guard_cash_payment();

CREATE FUNCTION private.post_cash_payment() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE shift_version integer; BEGIN
    UPDATE public.orders SET payment_status='PAID',paid_at=NEW.created_at,version=version+1,updated_at=NEW.created_at
      WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND id=NEW.order_id;
    INSERT INTO public.order_events(organization_id,branch_id,order_id,event_type,actor_user_id,event_data)
      VALUES(NEW.organization_id,NEW.branch_id,NEW.order_id,'CASH_PAYMENT_RECORDED',NEW.cashier_user_id,
        jsonb_build_object('paymentId',NEW.id,'amountMinor',NEW.amount_minor,'currencyCode',NEW.currency_code));
    INSERT INTO public.cash_payment_events(organization_id,branch_id,payment_id,event_type,actor_user_id,event_data)
      VALUES(NEW.organization_id,NEW.branch_id,NEW.id,'CASH_PAYMENT_RECORDED',NEW.cashier_user_id,
        jsonb_build_object('cashReceivedMinor',NEW.cash_received_minor,'changeMinor',NEW.change_minor));
    INSERT INTO public.cash_payment_ledger_entries(organization_id,branch_id,payment_id,account_code,direction,amount_minor,currency_code)
      VALUES(NEW.organization_id,NEW.branch_id,NEW.id,'CASH_DRAWER','DEBIT',NEW.amount_minor,NEW.currency_code),
        (NEW.organization_id,NEW.branch_id,NEW.id,'ORDER_RECEIVABLE','CREDIT',NEW.amount_minor,NEW.currency_code);
    UPDATE public.cash_shifts SET version=version+1 WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND id=NEW.shift_id
      RETURNING version INTO shift_version;
    INSERT INTO public.cash_shift_events(organization_id,branch_id,shift_id,event_type,version,actor_user_id,event_data)
      VALUES(NEW.organization_id,NEW.branch_id,NEW.shift_id,'CASH_PAYMENT_RECORDED',shift_version,NEW.cashier_user_id,
        jsonb_build_object('paymentId',NEW.id,'amountMinor',NEW.amount_minor,'currencyCode',NEW.currency_code));
    INSERT INTO public.audit_events(organization_id,branch_id,actor_user_id,action,entity_id)
      VALUES(NEW.organization_id,NEW.branch_id,NEW.cashier_user_id,'cash_payments.insert',NEW.id);
    RETURN NEW;
  END $$;
ALTER FUNCTION private.post_cash_payment() OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.post_cash_payment() FROM PUBLIC;
CREATE TRIGGER cash_payment_post AFTER INSERT ON public.cash_payments FOR EACH ROW EXECUTE FUNCTION private.post_cash_payment();

CREATE FUNCTION private.validate_cash_ledger_balance() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE entry_count integer; debit_total bigint; credit_total bigint; BEGIN
    SELECT count(*),COALESCE(sum(amount_minor) FILTER (WHERE direction='DEBIT'),0),
      COALESCE(sum(amount_minor) FILTER (WHERE direction='CREDIT'),0)
      INTO entry_count,debit_total,credit_total FROM public.cash_payment_ledger_entries
      WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND payment_id=NEW.payment_id;
    IF entry_count<>2 OR debit_total<>credit_total THEN
      RAISE EXCEPTION 'cash payment ledger is not balanced' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END $$;
ALTER FUNCTION private.validate_cash_ledger_balance() OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.validate_cash_ledger_balance() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER cash_payment_ledger_balance AFTER INSERT ON public.cash_payment_ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.validate_cash_ledger_balance();

CREATE OR REPLACE FUNCTION private.guard_cash_drawer_movement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE opening_amount bigint; shift_status text; expected_amount numeric; proposed_amount numeric;
  BEGIN
    SELECT opening_amount_minor,status INTO opening_amount,shift_status FROM public.cash_shifts
      WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND id=NEW.shift_id FOR UPDATE;
    IF NOT FOUND OR shift_status<>'OPEN' THEN RAISE EXCEPTION 'cash shift is not open' USING ERRCODE='23514'; END IF;
    SELECT opening_amount + COALESCE((SELECT sum(CASE movement_type WHEN 'CASH_IN' THEN amount_minor ELSE -amount_minor END)
      FROM public.cash_drawer_movements WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND shift_id=NEW.shift_id),0)
      + COALESCE((SELECT sum(amount_minor) FROM public.cash_payments WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND shift_id=NEW.shift_id),0)
      INTO expected_amount;
    proposed_amount := expected_amount + CASE NEW.movement_type WHEN 'CASH_IN' THEN NEW.amount_minor ELSE -NEW.amount_minor END;
    IF proposed_amount<0 OR proposed_amount>1000000000000 THEN RAISE EXCEPTION 'cash drawer balance outside permitted range' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
ALTER FUNCTION private.guard_cash_drawer_movement() OWNER TO unibos_rls_guard;

CREATE OR REPLACE FUNCTION private.guard_cash_shift_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ BEGIN
    IF (NEW.organization_id,NEW.branch_id,NEW.cashier_user_id,NEW.currency_code,NEW.opening_amount_minor,NEW.opened_at,NEW.created_by)
       IS DISTINCT FROM (OLD.organization_id,OLD.branch_id,OLD.cashier_user_id,OLD.currency_code,OLD.opening_amount_minor,OLD.opened_at,OLD.created_by)
      OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'cash shift immutable fields or version invalid' USING ERRCODE='23514'; END IF;
    IF OLD.status='OPEN' AND NEW.status='OPEN' THEN
      IF NEW.closing_expected_minor IS NOT NULL OR NEW.counted_cash_minor IS NOT NULL OR NEW.variance_minor IS NOT NULL OR NEW.closing_started_at IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
        RAISE EXCEPTION 'open cash shift contains closing data' USING ERRCODE='23514'; END IF;
    ELSIF OLD.status='OPEN' AND NEW.status='CLOSING' THEN
      IF NEW.closing_expected_minor IS DISTINCT FROM OLD.opening_amount_minor
        + COALESCE((SELECT sum(CASE movement_type WHEN 'CASH_IN' THEN amount_minor ELSE -amount_minor END) FROM public.cash_drawer_movements
          WHERE organization_id=OLD.organization_id AND branch_id=OLD.branch_id AND shift_id=OLD.id),0)
        + COALESCE((SELECT sum(amount_minor) FROM public.cash_payments WHERE organization_id=OLD.organization_id AND branch_id=OLD.branch_id AND shift_id=OLD.id),0)
        OR NEW.counted_cash_minor IS NULL OR NEW.closing_started_at IS NULL OR NEW.closed_at IS NOT NULL OR NEW.variance_minor IS NOT NULL THEN
        RAISE EXCEPTION 'cash shift close snapshot invalid' USING ERRCODE='23514'; END IF;
    ELSIF OLD.status='CLOSING' AND NEW.status='CLOSED' THEN
      IF NEW.closing_expected_minor IS DISTINCT FROM OLD.closing_expected_minor OR NEW.counted_cash_minor IS DISTINCT FROM OLD.counted_cash_minor
        OR NEW.closing_started_at IS DISTINCT FROM OLD.closing_started_at OR NEW.variance_minor IS DISTINCT FROM NEW.counted_cash_minor-NEW.closing_expected_minor OR NEW.closed_at IS NULL THEN
        RAISE EXCEPTION 'cash shift close result invalid' USING ERRCODE='23514'; END IF;
    ELSE RAISE EXCEPTION 'invalid cash shift transition' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;

CREATE OR REPLACE FUNCTION private.record_cash_shift_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ DECLARE action_name text; entity uuid; BEGIN
    action_name := TG_TABLE_NAME || CASE WHEN TG_OP='INSERT' THEN '.insert' ELSE '.update' END;
    IF TG_TABLE_NAME='cash_shift_events' THEN entity := NEW.shift_id; ELSE entity := NEW.id; END IF;
    INSERT INTO public.audit_events(organization_id,branch_id,actor_user_id,action,entity_id)
      VALUES(NEW.organization_id,NEW.branch_id,private.actor_id(),action_name,entity);
    RETURN NEW;
  END $$;
ALTER FUNCTION private.record_cash_shift_audit() OWNER TO unibos_onboarding;

-- Ensure the cashier's physical cash input is not counted as revenue; only net order tender enters the drawer.
CREATE OR REPLACE FUNCTION private.guard_cash_payment_ledger_immutable() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'cash payment ledger is append-only' USING ERRCODE='23514'; END $$;
ALTER FUNCTION private.guard_cash_payment_ledger_immutable() OWNER TO unibos_rls_guard;
REVOKE ALL ON FUNCTION private.guard_cash_payment_ledger_immutable() FROM PUBLIC;
CREATE TRIGGER cash_payment_ledger_no_update BEFORE UPDATE OR DELETE ON public.cash_payment_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION private.guard_cash_payment_ledger_immutable();
CREATE TRIGGER cash_payment_no_update BEFORE UPDATE OR DELETE ON public.cash_payments
  FOR EACH ROW EXECUTE FUNCTION private.guard_cash_payment_ledger_immutable();

CREATE FUNCTION private.record_cash_payment_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$ BEGIN INSERT INTO public.audit_events(organization_id,branch_id,actor_user_id,action,entity_id)
    VALUES(NEW.organization_id,NEW.branch_id,NEW.cashier_user_id,'cash_payments.insert',NEW.id); RETURN NEW; END $$;
ALTER FUNCTION private.record_cash_payment_audit() OWNER TO unibos_onboarding;
REVOKE ALL ON FUNCTION private.record_cash_payment_audit() FROM PUBLIC;
-- audit action constraint is widened only for the new immutable payment record.
ALTER TABLE public.audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
  'organizations.insert','organizations.update','branches.insert','branches.update','memberships.insert','memberships.update','memberships.delete',
  'product_categories.insert','product_categories.update','products.insert','products.update','product_price_versions.insert',
  'branch_product_availability.insert','branch_product_availability.update','restaurant_tables.insert','restaurant_tables.update',
  'table_qr_tokens.insert','table_qr_tokens.update','orders.insert','orders.update','kitchen_tickets.insert','kitchen_tickets.update',
  'cash_shifts.insert','cash_shifts.update','cash_shift_events.insert','cash_drawer_movements.insert','cash_payments.insert'));
