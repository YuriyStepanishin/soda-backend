import { drive } from '../config/googleDrive.js';
import { getArchiveFolder } from './driveArchive.js';

const tenants = [
  {
    name: 'LASKA',
    uploads: process.env.LASKA_UPLOADS_FOLDER_ID,
    archive: process.env.LASKA_ARCHIVE_FOLDER_ID,
    key: 'LASKA_ARCHIVE_FOLDER_ID',
  },
  {
    name: 'OLGATORG',
    uploads: process.env.OLGATORG_UPLOADS_FOLDER_ID,
    archive: process.env.OLGATORG_ARCHIVE_FOLDER_ID,
    key: 'OLGATORG_ARCHIVE_FOLDER_ID',
  },
];

async function setup() {
  if (
    !tenants.every((tenant) => tenant.uploads) ||
    tenants[0].uploads === tenants[1].uploads
  ) {
    throw new Error('Configure two distinct tenant uploads folder IDs');
  }
  for (const tenant of tenants) {
    try {
      if (tenant.archive && process.argv.includes('--create')) {
        try {
          await getArchiveFolder(drive, tenant.uploads, tenant.archive);
        } catch (error) {
          if (Number(error.code || error.response?.status) !== 404) throw error;
          console.log(
            `${tenant.name}: configured archive unavailable; searching inbox for archive`,
          );
          tenant.archive = undefined;
        }
      }
      if (!tenant.archive) {
        const { data: uploads } = await drive.files.get({
          fileId: tenant.uploads,
          fields: 'id,trashed,mimeType,capabilities(canAddChildren)',
          supportsAllDrives: true,
        });
        if (
          uploads.trashed ||
          uploads.mimeType !== 'application/vnd.google-apps.folder'
        )
          throw new Error('Uploads is not an active folder');
        const folders = [];
        let pageToken;
        do {
          const { data } = await drive.files.list({
            q: `'${tenant.uploads}' in parents and name='archive' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'nextPageToken,files(id)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            pageToken,
          });
          folders.push(...(data.files || []));
          pageToken = data.nextPageToken;
        } while (pageToken);
        if (folders.length > 1)
          throw new Error(
            'Multiple archive folders found; configure the intended folder ID explicitly',
          );
        tenant.archive = folders[0]?.id;
        if (!tenant.archive && process.argv.includes('--create')) {
          if (!uploads.capabilities?.canAddChildren)
            throw new Error('Drive account cannot create archive in uploads');
          const { data } = await drive.files.create({
            requestBody: {
              name: 'archive',
              mimeType: 'application/vnd.google-apps.folder',
              parents: [tenant.uploads],
            },
            fields: 'id',
            supportsAllDrives: true,
          });
          tenant.archive = data.id;
        }
        if (!tenant.archive)
          throw new Error(
            'Archive missing; rerun with --create or create it as the owner',
          );
      }
      await getArchiveFolder(drive, tenant.uploads, tenant.archive);
      console.log(`${tenant.key}=${tenant.archive}`);
      const { data: source } = await drive.files.get({
        fileId: tenant.uploads,
        fields: 'capabilities(canRemoveChildren)',
        supportsAllDrives: true,
      });
      if (!source.capabilities?.canRemoveChildren)
        throw new Error('Drive account cannot remove files from uploads');
      let pageToken;
      let checked = 0;
      let blocked = 0;
      do {
        const { data } = await drive.files.list({
          q: `'${tenant.uploads}' in parents and trashed=false`,
          fields:
            'nextPageToken,files(name,capabilities(canMoveItemWithinDrive))',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          pageToken,
        });
        for (const file of data.files || []) {
          if (!/\.(xlsx|xls)$/i.test(file.name || '')) continue;
          checked += 1;
          if (!file.capabilities?.canMoveItemWithinDrive) blocked += 1;
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
      console.log(
        `${tenant.name}: checked ${checked} workbooks, move denied for ${blocked}`,
      );
      if (blocked) process.exitCode = 1;
    } catch (error) {
      console.error(`${tenant.name}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

setup().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
