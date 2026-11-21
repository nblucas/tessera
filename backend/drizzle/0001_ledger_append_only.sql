-- The fake ledger is append-only: no row can be changed or deleted once written.
-- TRUNCATE is not blocked so the dev-only demo reset can wipe it.
CREATE FUNCTION ledger.reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER entries_append_only
  BEFORE UPDATE OR DELETE ON ledger.entries
  FOR EACH ROW EXECUTE FUNCTION ledger.reject_change();
