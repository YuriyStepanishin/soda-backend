# OLGATORG Drive imports

Read XLS/XLSX only from `UPLOADS_FOLDER_ID`; `ARCHIVE_FOLDER_ID` is no longer used. After the sales transaction commits and all sync_history versions are saved, move the unchanged source files to Google Drive Trash. Never permanently delete source workbooks in the importer.

OLGATORG files can split one date across regions and brands. Upload the complete set for the dates being replaced together. The importer batches all workbooks currently in the inbox into one sales transaction, preserving the existing replacement-by-date semantics. Historical dates outside the uploaded set remain in the database; archived files are no longer reread.

If download, parsing, import, or sync-history persistence fails, keep every source. If cleanup alone fails, report `cleanupErrors` and retry cleanup on the next run without repeating a successfully recorded import. Files edited or moved during import are retained. Empty workbooks are retained and block cleanup of that batch. Temporary downloads are removed on success and failure.

Use owner OAuth (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`) or another Drive identity with `canTrash`. Editor access alone on personal Google Drive is insufficient. Existing archive folders are removed as a separate, explicitly authorized operation, never automatically by the importer.
