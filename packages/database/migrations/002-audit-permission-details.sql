-- Forward-only expansion. Historical rows intentionally retain NULL details.
ALTER TABLE public.audit_events
  ADD COLUMN target_user_id text REFERENCES public.auth_users(id),
  ADD COLUMN old_role text CHECK(old_role IN ('owner','director','administrator','accountant','cashier','waiter','kitchen')),
  ADD COLUMN new_role text CHECK(new_role IN ('owner','director','administrator','accountant','cashier','waiter','kitchen')),
  ADD COLUMN old_branch_id uuid,
  ADD COLUMN new_branch_id uuid,
  ADD FOREIGN KEY(organization_id,old_branch_id) REFERENCES public.branches(organization_id,id),
  ADD FOREIGN KEY(organization_id,new_branch_id) REFERENCES public.branches(organization_id,id);

CREATE OR REPLACE FUNCTION private.record_business_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
  AS $$
  DECLARE org uuid; branch uuid; entity uuid; actor text;
    target_user text; previous_role text; next_role text; previous_branch uuid; next_branch uuid;
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
    IF TG_TABLE_NAME='memberships' THEN
      IF TG_OP<>'INSERT' THEN
        target_user := OLD.user_id; previous_role := OLD.role; previous_branch := OLD.branch_id;
      END IF;
      IF TG_OP<>'DELETE' THEN
        target_user := NEW.user_id; next_role := NEW.role; next_branch := NEW.branch_id;
      END IF;
    END IF;
    INSERT INTO public.audit_events(
      organization_id,branch_id,actor_user_id,action,entity_id,
      target_user_id,old_role,new_role,old_branch_id,new_branch_id
    ) VALUES (
      org,branch,actor,TG_TABLE_NAME||'.'||lower(TG_OP),entity,
      target_user,previous_role,next_role,previous_branch,next_branch
    );
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END $$;
-- CREATE OR REPLACE preserves the original narrow NOLOGIN function owner/grants.
