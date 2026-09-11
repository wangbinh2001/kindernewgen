CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.school_id IS NOT NULL AND NEW.school_id IS NULL AND
     OLD.id = NEW.id AND
     OLD.actor_type = NEW.actor_type AND
     OLD.actor_id = NEW.actor_id AND
     OLD.support_session_id IS NOT DISTINCT FROM NEW.support_session_id AND
     OLD.action = NEW.action AND
     OLD.target_type = NEW.target_type AND
     OLD.target_id IS NOT DISTINCT FROM NEW.target_id AND
     OLD.metadata IS NOT DISTINCT FROM NEW.metadata AND
     OLD.ip_address IS NOT DISTINCT FROM NEW.ip_address AND
     OLD.timestamp = NEW.timestamp THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$ LANGUAGE plpgsql;
