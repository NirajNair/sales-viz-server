CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_entities ON entities;
CREATE TRIGGER set_updated_at_entities
BEFORE UPDATE ON entities
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_hsn_codes ON hsn_codes;
CREATE TRIGGER set_updated_at_hsn_codes
BEFORE UPDATE ON hsn_codes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_purchase_records ON purchase_records;
CREATE TRIGGER set_updated_at_purchase_records
BEFORE UPDATE ON purchase_records
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
