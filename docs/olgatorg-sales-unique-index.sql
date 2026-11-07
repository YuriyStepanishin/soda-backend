BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(73501421, 1);

DO $$
DECLARE
  index_oid regclass := to_regclass('public.sales_unique_row');
BEGIN
  IF index_oid IS NULL THEN
    RETURN;
  END IF;
  IF pg_get_indexdef(index_oid) IS DISTINCT FROM
    'CREATE UNIQUE INDEX sales_unique_row ON public.sales USING btree (sale_date, product_name, barcode, qty, amount, outlet_name, outlet_code)'
    OR NOT EXISTS (
      SELECT 1 FROM pg_index
      WHERE indexrelid = index_oid AND indrelid = 'public.sales'::regclass
        AND indisunique AND NOT indisprimary
    )
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = index_oid) THEN
    RAISE EXCEPTION 'Unexpected sales_unique_row definition or constraint dependency; migration aborted';
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.sales_unique_row;
COMMIT;
