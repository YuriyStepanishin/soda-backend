# OLGATORG sales_unique_row

Read-only inspection on 2026-11-07 confirmed that public.sales_unique_row is a standalone UNIQUE btree index on (sale_date, product_name, barcode, qty, amount, outlet_name, outlet_code). It is not the primary key, is not owned by a constraint and has no referencing foreign keys. sales_pkey remains the primary key on id.

The index cannot distinguish two legitimate source sales with identical values in those columns. The importer preserves source rows and replaces the complete uploaded date set in a transaction, under the existing advisory lock. Unchanged imported Drive versions are tracked in sync_history. These protections remain unchanged; source duplicates within an export are not silently deduplicated.

The accompanying SQL is prepared, NOT applied. It checks the exact observed definition and constraint dependencies, then drops only public.sales_unique_row without CASCADE. No sales rows, primary key, other indexes or LASKA objects are changed by the SQL. A short lock timeout aborts instead of waiting indefinitely behind application traffic. Run only on the OLGATORG database via a direct connection after authorization and testing on an isolated branch. Coordinate with the running cron: after the index is removed, its next run can replace the uploaded dates and archive the successfully registered sources.

Do not restore the UNIQUE index automatically: after valid identical sales are imported, recreating it may fail. Any rollback requires reviewing the imported data first. The migration has not been run or branch-tested in this task.

The importer now checks for incompatible UNIQUE indexes before reading/parsing Excel or populating staging. This shortens repeated failures caused by schema mismatch. It does not establish the cause of every node-cron missed-execution warning; synchronous XLS parsing may still block the event loop during a successful run.
