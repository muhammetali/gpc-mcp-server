import { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;
let jwtClient: JWT | null = null;

function getJWTClient(): JWT {
  if (jwtClient) return jwtClient;

  const keyPath = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!keyPath) {
    throw new Error(
      'Missing credentials. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON in .env (path to service account JSON file)'
    );
  }

  const keyFileContent = readFileSync(keyPath, 'utf8');
  const keys = JSON.parse(keyFileContent);

  if (!keys.client_email || !keys.private_key) {
    throw new Error(
      'Invalid service account JSON. File must contain client_email and private_key fields.'
    );
  }

  jwtClient = new JWT({
    email: keys.client_email,
    key: keys.private_key,
    // playdeveloperreporting: reports.ts (Android vitals) uses the same
    // token; without this scope every vitals query 403s (#195).
    scopes: [
      'https://www.googleapis.com/auth/androidpublisher',
      'https://www.googleapis.com/auth/playdeveloperreporting',
    ],
  });

  return jwtClient;
}

export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const client = getJWTClient();
  const credentials = await client.authorize();

  if (!credentials.access_token) {
    throw new Error('Failed to obtain access token from Google OAuth2');
  }

  // Token typically expires in 3600 seconds (1 hour)
  const expiresAt = credentials.expiry_date
    ? Math.floor(credentials.expiry_date / 1000)
    : now + 3600;

  cachedToken = {
    token: credentials.access_token,
    expiresAt,
  };

  return cachedToken.token;
}

// For testing: reset cached state
export function _resetAuthState(): void {
  cachedToken = null;
  jwtClient = null;
}
