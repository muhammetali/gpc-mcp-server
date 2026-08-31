import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    private_key: '-----BEGIN PRIVATE KEY-----\nfake_key\n-----END PRIVATE KEY-----',
    client_email: 'test@test-project.iam.gserviceaccount.com',
    client_id: '123456789',
  })),
}));

// Default mock for google-auth-library - uses class syntax
const mockAuthorize = vi.fn().mockResolvedValue({
  access_token: 'mock-access-token',
  expiry_date: Date.now() + 3600_000,
});

vi.mock('google-auth-library', () => ({
  JWT: class MockJWT {
    email: string;
    key: string;
    scopes: string[];
    constructor(opts: any) {
      this.email = opts.email;
      this.key = opts.key;
      this.scopes = opts.scopes;
      // Track constructor calls
      MockJWT._lastInstance = this;
      MockJWT._constructorCalls.push(opts);
    }
    authorize = mockAuthorize;
    static _lastInstance: any = null;
    static _constructorCalls: any[] = [];
  },
}));

describe('auth', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.resetModules();
    mockAuthorize.mockReset();
    mockAuthorize.mockResolvedValue({
      access_token: 'mock-access-token',
      expiry_date: Date.now() + 3600_000,
    });
    const { JWT } = await import('google-auth-library');
    (JWT as any)._constructorCalls = [];
    (JWT as any)._lastInstance = null;
    process.env = {
      ...originalEnv,
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '/fake/path/service-account.json',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should throw when GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing', async () => {
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    const { getAccessToken } = await import('../auth.js');
    await expect(getAccessToken()).rejects.toThrow('Missing credentials');
  });

  it('should throw when GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is empty', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '';
    const { getAccessToken } = await import('../auth.js');
    await expect(getAccessToken()).rejects.toThrow('Missing credentials');
  });

  it('should return access token from service account', async () => {
    const { getAccessToken } = await import('../auth.js');
    const token = await getAccessToken();
    expect(token).toBe('mock-access-token');
  });

  it('should cache token on subsequent calls', async () => {
    mockAuthorize.mockResolvedValue({
      access_token: 'cached-token',
      expiry_date: Date.now() + 3600_000,
    });

    const { getAccessToken } = await import('../auth.js');

    const token1 = await getAccessToken();
    const token2 = await getAccessToken();

    expect(token1).toBe('cached-token');
    expect(token2).toBe('cached-token');
    expect(mockAuthorize).toHaveBeenCalledOnce();
  });

  it('should regenerate token when cache expires', async () => {
    let callCount = 0;
    mockAuthorize.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        access_token: `token-${callCount}`,
        expiry_date: callCount === 1 ? Date.now() - 1000 : Date.now() + 3600_000,
      });
    });

    const { getAccessToken } = await import('../auth.js');

    const token1 = await getAccessToken();
    expect(token1).toBe('token-1');

    // Token has expired (expiry_date in the past), should get new one
    const token2 = await getAccessToken();
    expect(token2).toBe('token-2');
    expect(mockAuthorize).toHaveBeenCalledTimes(2);
  });

  it('should throw when authorize returns no access_token', async () => {
    mockAuthorize.mockResolvedValue({ access_token: null });

    const { getAccessToken } = await import('../auth.js');
    await expect(getAccessToken()).rejects.toThrow('Failed to obtain access token');
  });

  it('should request both publisher and reporting scopes', async () => {
    // reports.ts calls playdeveloperreporting.googleapis.com with this same
    // token; a publisher-only scope makes every vitals query 403 and the
    // fallback in reports.ts hides it (#195).
    const { getAccessToken } = await import('../auth.js');
    await getAccessToken();

    const { JWT } = await import('google-auth-library');
    const calls = (JWT as any)._constructorCalls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].scopes).toEqual([
      'https://www.googleapis.com/auth/androidpublisher',
      'https://www.googleapis.com/auth/playdeveloperreporting',
    ]);
  });
});
