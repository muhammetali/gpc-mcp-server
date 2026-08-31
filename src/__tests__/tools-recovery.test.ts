import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/recovery', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
    process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.example.myapp';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('listRecoveryActions', () => {
    it('should list recovery actions in markdown', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          recoveryActions: [
            {
              appRecoveryId: 'rec-1',
              status: 'ACTIVE',
              targeting: { versionList: { versionCodes: ['150', '151'] } },
              createTime: '2026-03-10T12:00:00Z',
            },
            {
              appRecoveryId: 'rec-2',
              status: 'DRAFT',
              targeting: { allUsers: {} },
              createTime: '2026-03-15T08:00:00Z',
            },
          ],
        }), { status: 200 }),
      );

      const { listRecoveryActions } = await import('../tools/recovery.js');
      const result = await listRecoveryActions();

      expect(result).toContain('## App Recovery Actions (2)');
      expect(result).toContain('rec-1');
      expect(result).toContain('[ACTIVE]');
      expect(result).toContain('[DRAFT]');
      expect(result).toContain('Versions: 150, 151');
      expect(result).toContain('All users');
    });

    it('should handle no recovery actions', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { listRecoveryActions } = await import('../tools/recovery.js');
      const result = await listRecoveryActions();

      expect(result).toContain('No recovery actions found');
    });
  });

  describe('createRecoveryAction', () => {
    it('should create recovery targeting specific versions', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          appRecoveryId: 'rec-new',
          status: 'DRAFT',
        }), { status: 200 }),
      );

      const { createRecoveryAction } = await import('../tools/recovery.js');
      const result = await createRecoveryAction(['150', '151']);

      expect(result).toContain('## Recovery Action Created');
      expect(result).toContain('DRAFT');
      expect(result).toContain('gpc_deploy_recovery');
    });

    it('should create recovery targeting all users', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          appRecoveryId: 'rec-all',
          status: 'DRAFT',
        }), { status: 200 }),
      );

      const { createRecoveryAction } = await import('../tools/recovery.js');
      const result = await createRecoveryAction(undefined, undefined, true);

      expect(result).toContain('All users');
    });

    it('should return error when no targeting specified', async () => {
      const { createRecoveryAction } = await import('../tools/recovery.js');
      const result = await createRecoveryAction();

      expect(result).toContain('**Error:**');
      expect(result).toContain('targeting');
    });
  });

  describe('deployRecoveryAction', () => {
    it('should deploy recovery action', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { deployRecoveryAction } = await import('../tools/recovery.js');
      const result = await deployRecoveryAction('rec-1');

      expect(result).toContain('## Recovery Action Deployed');
      expect(result).toContain('rec-1');
      expect(result).toContain('ACTIVE');
    });
  });

  describe('cancelRecoveryAction', () => {
    it('should cancel recovery action', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { cancelRecoveryAction } = await import('../tools/recovery.js');
      const result = await cancelRecoveryAction('rec-1');

      expect(result).toContain('## Recovery Action Canceled');
      expect(result).toContain('rec-1');
    });
  });
});
