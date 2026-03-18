import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/tracks', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
    process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.fixmob.vipchat';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('listTracks', () => {
    it('should return tracks with release info', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        // List tracks
        return Promise.resolve(new Response(JSON.stringify({
          tracks: [
            {
              track: 'production',
              releases: [
                {
                  status: 'completed',
                  versionCodes: ['150'],
                  name: '2.1.0',
                  releaseNotes: [{ language: 'en-US', text: 'Bug fixes' }],
                },
              ],
            },
            {
              track: 'beta',
              releases: [
                {
                  status: 'draft',
                  versionCodes: ['151'],
                  name: '2.2.0-beta',
                },
              ],
            },
          ],
        }), { status: 200 }));
      });

      const { listTracks } = await import('../tools/tracks.js');
      const result = await listTracks();

      expect(result).toContain('## Google Play Tracks');
      expect(result).toContain('PRODUCTION');
      expect(result).toContain('completed');
      expect(result).toContain('[LIVE]');
      expect(result).toContain('150');
      expect(result).toContain('BETA');
      expect(result).toContain('[DRAFT]');
    });

    it('should handle empty tracks', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ tracks: [] }), { status: 200 }));
      });

      const { listTracks } = await import('../tools/tracks.js');
      const result = await listTracks();
      expect(result).toContain('No tracks found');
    });
  });

  describe('createRelease', () => {
    it('should create release and commit edit', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        // 1: create edit, 2: put track, 3: commit edit
        return Promise.resolve(new Response(JSON.stringify(
          callCount === 1 ? { id: 'edit-1' } : {}
        ), { status: 200 }));
      });

      const { createRelease } = await import('../tools/tracks.js');
      const result = await createRelease(
        'production',
        '150',
        { 'en-US': 'Bug fixes', 'tr-TR': 'Hata duzeltmeleri' },
        '2.1.0',
        'draft',
      );

      expect(result).toContain('## Release Created');
      expect(result).toContain('production');
      expect(result).toContain('150');
      expect(result).toContain('draft');
      expect(result).toContain('Bug fixes');
      // Should warn about missing locales
      expect(result).toContain('Warning');
    });
  });

  describe('setRollout', () => {
    it('should update rollout percentage', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          // Get current track
          return Promise.resolve(new Response(JSON.stringify({
            track: 'production',
            releases: [{ status: 'inProgress', versionCodes: ['150'], userFraction: 0.1 }],
          }), { status: 200 }));
        }
        // PUT and commit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { setRollout } = await import('../tools/tracks.js');
      const result = await setRollout('production', 0.5);

      expect(result).toContain('## Rollout Updated');
      expect(result).toContain('50%');
    });

    it('should complete rollout when fraction is 1.0', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          return Promise.resolve(new Response(JSON.stringify({
            track: 'production',
            releases: [{ status: 'inProgress', versionCodes: ['150'], userFraction: 0.5 }],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { setRollout } = await import('../tools/tracks.js');
      const result = await setRollout('production', 1.0);

      expect(result).toContain('100% (completed)');
    });

    it('should reject rollout change for completed releases', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          track: 'production',
          releases: [{ status: 'completed', versionCodes: ['150'] }],
        }), { status: 200 }));
      });

      const { setRollout } = await import('../tools/tracks.js');
      const result = await setRollout('production', 0.5);

      expect(result).toContain('Error');
      expect(result).toContain('completed');
    });
  });

  describe('haltRollout', () => {
    it('should halt an in-progress release', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          return Promise.resolve(new Response(JSON.stringify({
            track: 'production',
            releases: [{ status: 'inProgress', versionCodes: ['150'], userFraction: 0.2 }],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { haltRollout } = await import('../tools/tracks.js');
      const result = await haltRollout('production');

      expect(result).toContain('## Rollout Halted');
      expect(result).toContain('HALTED');
    });

    it('should reject halt for non-inProgress releases', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          track: 'production',
          releases: [{ status: 'draft', versionCodes: ['150'] }],
        }), { status: 200 }));
      });

      const { haltRollout } = await import('../tools/tracks.js');
      const result = await haltRollout('production');

      expect(result).toContain('Error');
      expect(result).toContain('draft');
    });
  });

  describe('promoteRelease', () => {
    it('should promote release from internal to beta', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          // Get source track (internal)
          return Promise.resolve(new Response(JSON.stringify({
            track: 'internal',
            releases: [{
              status: 'completed',
              versionCodes: ['10205'],
              name: '1.2.5',
              releaseNotes: [
                { language: 'en-US', text: 'Bug fixes and improvements' },
                { language: 'tr-TR', text: 'Hata duzeltmeleri' },
              ],
            }],
          }), { status: 200 }));
        }
        // PUT to destination track + commit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { promoteRelease } = await import('../tools/tracks.js');
      const result = await promoteRelease('internal', 'beta');

      expect(result).toContain('## Release Promoted');
      expect(result).toContain('internal');
      expect(result).toContain('beta');
      expect(result).toContain('10205');
      expect(result).toContain('1.2.5');
      expect(result).toContain('completed');
    });

    it('should return error when source and destination tracks are the same', async () => {
      const { promoteRelease } = await import('../tools/tracks.js');
      const result = await promoteRelease('beta', 'beta');

      expect(result).toContain('**Error:**');
      expect(result).toContain('same');
    });

    it('should return error when source track has no releases', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        // Source track has no releases
        return Promise.resolve(new Response(JSON.stringify({
          track: 'internal',
          releases: [],
        }), { status: 200 }));
      });

      const { promoteRelease } = await import('../tools/tracks.js');
      const result = await promoteRelease('internal', 'production');

      expect(result).toContain('**Error:**');
      expect(result).toContain('No releases found');
      expect(result).toContain('internal');
    });

    it('should return error when source track has no active release', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          track: 'internal',
          releases: [{ status: 'draft', versionCodes: ['100'] }],
        }), { status: 200 }));
      });

      const { promoteRelease } = await import('../tools/tracks.js');
      const result = await promoteRelease('internal', 'beta');

      expect(result).toContain('**Error:**');
      expect(result).toContain('No active release');
    });
  });

  describe('input validation', () => {
    it('should reject release notes exceeding 500 characters', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(new Response(JSON.stringify(
          callCount === 1 ? { id: 'edit-1' } : {}
        ), { status: 200 }));
      });

      const { createRelease } = await import('../tools/tracks.js');
      const longNote = 'a'.repeat(501);
      const result = await createRelease(
        'internal',
        '100',
        { 'en-US': longNote },
      );

      expect(result).toContain('**Error:**');
      expect(result).toContain('500 characters');
      expect(result).toContain('501');
    });

    it('should accept release notes at exactly 500 characters', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(new Response(JSON.stringify(
          callCount === 1 ? { id: 'edit-1' } : {}
        ), { status: 200 }));
      });

      const { createRelease } = await import('../tools/tracks.js');
      const exactNote = 'a'.repeat(500);
      const result = await createRelease(
        'internal',
        '100',
        { 'en-US': exactNote },
      );

      expect(result).toContain('## Release Created');
    });

    it('should reject update release notes exceeding 500 characters', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          track: 'production',
          releases: [{ status: 'completed', versionCodes: ['100'], releaseNotes: [] }],
        }), { status: 200 }));
      });

      const { updateReleaseNotes } = await import('../tools/tracks.js');
      const longNote = 'b'.repeat(501);
      const result = await updateReleaseNotes('production', { 'tr-TR': longNote });

      expect(result).toContain('**Error:**');
      expect(result).toContain('500 characters');
    });
  });
});
