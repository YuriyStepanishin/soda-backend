# Drive archive release preparation

## Folder IDs verified with the Service Account

| Tenant | Archive ENV | Folder ID |
| --- | --- | --- |
| LASKA | `LASKA_ARCHIVE_FOLDER_ID` | `1E6vUTxLhcbA5W05PxB5pzYwgesdheLDb` |
| OLGATORG | `OLGATORG_ARCHIVE_FOLDER_ID` | `10LyJrWUYOuTUnPFhwex9itAZMAHbN3PY` |

Reverified on 2026-11-07: use only the owner's existing Archive folders above, alongside Uploads inside each tenant folder. LASKA's configured sibling Archive was correct; the earlier direct-child-only validation was too restrictive. OLGATORG archive ENV previously pointed to db_olgatorg (the inbox parent), and is corrected to that tenant's existing Archive child. The Service Account can add archive children, remove inbox children and move all five currently pending workbooks. No real move, import, database write or token deletion was run by this diagnostic. Extra archive folders created during the earlier setup attempt remain untouched and are not configured as destinations. Do not create additional folders.

The two archive values above were corrected in the local `.env`; restart the running local server to reload them. Set the same values in Render before release; hosted ENV has not been changed. Current OLGATORG inbox ENV is `OLGATORG_UPLOADS_FOLDER_ID`, matching the updated wrapper and setup tool. Preserve inbox IDs, Service Account credentials, database and cron configuration. OAuth variables are ignored by the new code; existing secrets/tokens remain in place.

OLGATORG quantity (H) and amount (I) are optional: empty values are stored as NULL, including TDSheet!H1234 and I1234 in Хм Орімі.xls. Missing amount also leaves derived price, discount and price type NULL. Do not replace missing values with zero or drop the row. Supplied values must still be valid finite numbers. The existing sales transaction rolls back the batch on other validation errors, before target date replacement and before archive.

## Scoped release files

- `src/config/googleDrive.js`
- `src/services/driveArchive.js`
- `src/services/setupDriveArchives.js`
- `src/services/laskaDriveImportRunner.js`
- `src/services/olgatorgDriveImportRunner.js`
- `src/services/laskaProcessGoogleDriveImports.js`
- `src/services/olgatorgProcessGoogleDriveImports.js`
- `test/driveArchive.test.js`
- `test/laskaDriveImport.test.js`
- `test/olgatorgDriveImport.test.js`
- `docs/laska-drive-import.md`
- `docs/olgatorg-drive-import.md`
- `docs/drive-archive-release.md`

The untracked OAuth-only `src/config/googleDriveTrash.js` was removed locally. It needs no deletion commit because it was not tracked in HEAD. Existing `registerImportSchedules.js` changes and deleted `history-backup-20261026-214258-459` files are outside this patch and must not be included accidentally.

Run `node --test test/*.test.js`, `node --check` on the changed JavaScript modules, scoped ESLint and `git diff --check`. Review and explicitly stage only the release file list. Commit, push and Render deployment are separate release actions and have not been performed. Changing Render ENV may trigger a restart/redeploy; coordinate ENV and code release together. After deployment, verify a complete date set per tenant, saved sync versions, archive parents and a repeat run without duplicate import. If permissions fail, leave the source in the inbox and inspect cleanupErrors; do not switch to deletion.

Drive move semantics follow the [Google Drive folder API guide](https://developers.google.com/workspace/drive/api/guides/folder).
