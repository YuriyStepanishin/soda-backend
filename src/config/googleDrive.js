import { google } from 'googleapis';

const resolveGoogleCredentials = () => {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (rawJson) {
    return JSON.parse(rawJson);
  }

  const base64Json = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;

  if (base64Json) {
    return JSON.parse(Buffer.from(base64Json, 'base64').toString('utf8'));
  }

  throw new Error(
    'Google service account credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_BASE64.',
  );
};

const resolveAuth = () => {
  const keys = ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN'];
  const configured = keys.filter(key => process.env[key]);
  if (configured.length && configured.length !== keys.length) {
    throw new Error('Google Drive owner OAuth requires all three GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN');
  }
  if (configured.length) {
    const oauth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET);
    oauth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    return oauth;
  }
  return new google.auth.GoogleAuth({
    credentials: resolveGoogleCredentials(),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
};

const auth = resolveAuth();

export const drive = google.drive({
  version: 'v3',
  auth,
});
