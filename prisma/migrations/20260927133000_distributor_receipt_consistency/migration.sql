-- Old money-transaction screens must not silently detach a connected credit from
-- the cash it represents. The distributor credit API updates both atomically.
CREATE FUNCTION accountant_v2_check_distributor_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.amount,c.company_id,m.amount AS money_amount,m.company_id AS money_company,
      m.direction::text AS direction,m.status::text AS status,m.party_type::text AS party_type
    FROM distributor_credits c JOIN accountant_v2_distributor_settings s
      ON s.company_id=c.company_id AND s.distributor_id=c.distributor_id AND s.enabled
    LEFT JOIN money_transactions m ON m.id=c.money_transaction_id
    WHERE c.money_transaction_id IS NOT NULL AND
      ((TG_TABLE_NAME='distributor_credits' AND c.id=NEW.id) OR (TG_TABLE_NAME='money_transactions' AND c.money_transaction_id=NEW.id))
  LOOP
    IF r.money_company IS DISTINCT FROM r.company_id OR round(r.amount::numeric,2) IS DISTINCT FROM round(r.money_amount::numeric,2)
      OR r.direction IS DISTINCT FROM 'RECEIVED' OR r.status IS DISTINCT FROM 'PAID' OR r.party_type IS DISTINCT FROM 'SUPPLIER' THEN
      RAISE EXCEPTION 'Update this receipt from the distributor credit form so its amount, supplier and money transaction stay synchronized';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER accountant_v2_dist_receipt_credit AFTER INSERT OR UPDATE ON distributor_credits
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_check_distributor_receipt();
CREATE CONSTRAINT TRIGGER accountant_v2_dist_receipt_money AFTER UPDATE ON money_transactions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accountant_v2_check_distributor_receipt();
