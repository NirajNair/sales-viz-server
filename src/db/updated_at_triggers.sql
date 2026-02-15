CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_entities ON "Entities";
CREATE TRIGGER set_updated_at_entities
BEFORE UPDATE ON "Entities"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_hsn_codes ON "HSNCodes";
CREATE TRIGGER set_updated_at_hsn_codes
BEFORE UPDATE ON "HSNCodes"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_purchase_records ON "PurchaseRecords";
CREATE TRIGGER set_updated_at_purchase_records
BEFORE UPDATE ON "PurchaseRecords"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
