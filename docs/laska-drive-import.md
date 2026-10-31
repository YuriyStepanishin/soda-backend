# LASKA Drive import

LASKA reads Excel files only from `LASKA_UPLOADS_FOLDER_ID`. It no longer requires or reads `LASKA_ARCHIVE_FOLDER_ID`. OLGATORG now follows the same trash-after-commit policy; see `olgatorg-drive-import.md`.

Each LASKA workbook is a full snapshot for the dates it contains. Pending workbooks are processed sequentially, oldest modified time first, with one database transaction per workbook. The latest snapshot replaces prior rows for its dates rather than combining several cumulative monthly snapshots.

XLSX rows are streamed into batches of 1,000; legacy XLS uses SheetJS dense mode. The streaming reader also handles the nonstandard `xl/SharedStrings.xml` spelling in the current 1C export.

## Authentication and trash

Existing service-account authentication remains the default. To use the file owner's OAuth session, configure all three secrets in Render:

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`

Use a refresh token granted by the file owner with the Drive scope. Never commit credentials or tokens. The Drive client is shared with the other tenant, so the OAuth account must also retain access to its folders.

Only after the import returns from COMMIT and the sync record is saved does the importer check the file's current modified time, parent and `canTrash` capability. It then requests `trashed: true`. It never permanently deletes a file. Cleanup failures are reported separately from database success and retried on the next run without reimporting an unchanged successful version. Changed, empty and failed files are retained.

Google My Drive permits only the owner to trash a file. An editor service account cannot trash files owned by a personal Google account. Owner OAuth is therefore needed for the current LASKA files. Existing archive folders are not automatically deleted by this change; review their contents against `sync_history` before moving them to Trash as the owner.

## Validation

Run `node --test test/laskaDriveImport.test.js` for import failure, sync failure, zero-row import, changed-file protection, cleanup retry and permission handling.

The real pending `10 (1).xlsx` was parsed without writing to a database: 79,414 rows. All 16 source columns matched the existing SheetJS reader exactly, using a SHA-256 comparison of normalized rows. A separate streaming run under `--max-old-space-size=192` completed with approximately 100 MiB peak JavaScript heap. Production import and owner-authorized cleanup still require deployment and verification.
