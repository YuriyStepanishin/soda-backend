# LASKA Drive import

LASKA reads Excel files only from `LASKA_UPLOADS_FOLDER_ID` and archives imported versions in the owner's existing `LASKA_ARCHIVE_FOLDER_ID`. Archive may be alongside Uploads in the same tenant folder or directly inside Uploads. Archive contents are not reread. Configure separate inbox/archive IDs for OLGATORG; see `olgatorg-drive-import.md`.

Each LASKA workbook is a full snapshot for the dates it contains. Pending workbooks are processed sequentially, oldest modified time first, with one database transaction per workbook. The latest snapshot replaces prior rows for its dates rather than combining several cumulative monthly snapshots.

XLSX rows are streamed into batches of 1,000; legacy XLS uses SheetJS dense mode. The streaming reader also handles the nonstandard `xl/SharedStrings.xml` spelling in the current 1C export.

## Authentication and archive

Use only the existing Service Account. Required environment:

- `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_SERVICE_ACCOUNT_BASE64`: secret credentials.
- `LASKA_UPLOADS_FOLDER_ID` and `LASKA_ARCHIVE_FOLDER_ID`: LASKA folders.
- `OLGATORG_UPLOADS_FOLDER_ID` and `OLGATORG_ARCHIVE_FOLDER_ID`: separate OLGATORG folders.

Previous OAuth ENV is ignored. Existing token files and hosted secrets are left untouched and are not required by this flow. Never commit credentials or tokens.

Only after the import returns from COMMIT and the sync record is saved does the importer check current modified time, Drive version, expected inbox parent, source removal permission, destination add permission and file move permission. Archive must be an active folder alongside Uploads under the same tenant parent or directly inside Uploads, in the same Drive. It moves with `addParents`/`removeParents`. An available ETag is sent as `If-Match` (412 retains the source); without an ETag the version check is a pre-move check, not an atomic lock. Cleanup failures are reported separately and retried without reimporting an unchanged successful version. Changed, empty and failed files are retained. The summary reports `archived` and `cleanupErrors`. No source is trashed or deleted.

Configure the owner's existing Archive folder IDs from `drive-archive-release.md`. Run `node --env-file=.env src/services/setupDriveArchives.js` without --create to validate them and check inbox/workbook move permissions. This does not run an import, move files or change ENV. Do not create more archive folders for this setup.

Set the resulting IDs locally and in Render before release. Preserve database and cron ENV. Run `node --test test/*.test.js` and syntax checks, review the scoped diff, then commit/push only intended files when authorized. No automatic deployment is performed here. After release, verify a successful import per tenant, sync_history, destination parent and a repeated run without duplicate import. Do not run a production import just to test folder permissions.

API reference: https://developers.google.com/workspace/drive/api/guides/folder

## Validation

Run `node --test test/laskaDriveImport.test.js` for import failure, sync failure, zero-row import, changed-file protection, cleanup retry and permission handling.

Earlier parsing validation (unchanged by this patch): `10 (1).xlsx` contained 79,414 rows matching the legacy reader. This is not a production archive verification.
