# OLGATORG Drive imports

`Кво` (quantity, source column H) and `Сума` (amount, column I) are optional. Empty cells are stored as NULL, not zero; nonempty values must still be valid finite numbers. The temporary staging columns accept NULL. When amount is absent, price, discount and price type remain NULL instead of fabricating a zero-price sale or return. For a supplied amount the existing calculation is preserved: quantity greater than zero gives amount/quantity; otherwise price is zero. A real zero amount retains its existing return classification. Missing quantity or amount does not skip the sales row or exempt its other fields from validation.

Read XLS/XLSX only from `OLGATORG_UPLOADS_FOLDER_ID`. Configure `OLGATORG_ARCHIVE_FOLDER_ID` as the owner's existing active Archive alongside Uploads in the same tenant folder (or directly inside Uploads), separate from LASKA's folders. After the sales transaction commits and all sync_history versions are saved atomically, move unchanged sources into archive via addParents/removeParents. No workbook is trashed or deleted. The summary reports `archived` and `cleanupErrors`.

OLGATORG files can split one date across regions and brands. Upload the complete set for the dates being replaced together. The importer batches all workbooks currently in the inbox into one sales transaction, preserving the existing replacement-by-date semantics. Historical dates outside the uploaded set remain in the database; archived files are no longer reread.

If download, parsing, import, or sync-history persistence fails, keep every source. If cleanup alone fails, report `cleanupErrors` and retry cleanup on the next run without repeating a successfully recorded import. Files edited or moved during import are retained. Empty workbooks are retained and block cleanup of that batch. Temporary downloads are removed on success and failure.

Use the existing Service Account with permissions to remove children from uploads, add children to archive and move each source. Current modified time, Drive version, expected parent and same Drive are checked before moving; an available ETag is sent as If-Match. OAuth is not used. See `laska-drive-import.md` for ENV, folder setup and release steps.

If any inbox version is new or changed, the whole current inbox remains a single batch, as before. Partial archive followed by a new batch does not reconstruct already archived date fragments: always upload a complete date set.
