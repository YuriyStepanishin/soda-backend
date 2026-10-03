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

const auth = new google.auth.GoogleAuth({
  credentials: resolveGoogleCredentials(),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

export const drive = google.drive({
  version: 'v3',
  auth,
});
