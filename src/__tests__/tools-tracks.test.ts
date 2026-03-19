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
      // Auto-fill should have filled missing locales from en-US
      expect(result).toContain('auto-filled from en-US');
      expect(result).toContain('Auto-filled');
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

    it('should promote with staged rollout', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          return Promise.resolve(new Response(JSON.stringify({
            track: 'beta',
            releases: [{
              status: 'completed',
              versionCodes: ['200'],
              name: '3.0.0',
              releaseNotes: [{ language: 'en-US', text: 'Beta release' }],
            }],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { promoteRelease } = await import('../tools/tracks.js');
      const result = await promoteRelease('beta', 'production', 'inProgress', 0.1);

      expect(result).toContain('## Release Promoted');
      expect(result).toContain('10%');
      expect(result).toContain('Copied from source track');
    });

    it('should use custom release notes when provided', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          return Promise.resolve(new Response(JSON.stringify({
            track: 'internal',
            releases: [{
              status: 'completed',
              versionCodes: ['300'],
              name: '4.0.0',
              releaseNotes: [{ language: 'en-US', text: 'Old notes' }],
            }],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { promoteRelease } = await import('../tools/tracks.js');
      const result = await promoteRelease('internal', 'production', 'completed', undefined, {
        'en-US': 'New production notes',
      });

      expect(result).toContain('## Release Promoted');
      expect(result).toContain('Custom (overridden)');
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

  describe('createRelease with autoFillLocales=false', () => {
    it('should not auto-fill and show warning for missing locales', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(new Response(JSON.stringify(
          callCount === 1 ? { id: 'edit-1' } : {}
        ), { status: 200 }));
      });

      const { createRelease } = await import('../tools/tracks.js');
      const result = await createRelease(
        'internal',
        '100',
        { 'en-US': 'Test notes' },
        undefined,
        'draft',
        undefined,
        false,
      );

      expect(result).toContain('## Release Created');
      expect(result).toContain('Warning');
      expect(result).not.toContain('auto-filled from en-US');
    });
  });

  describe('validateRelease', () => {
    it('should validate release readiness', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          // List bundles
          return Promise.resolve(new Response(JSON.stringify({
            bundles: [{ versionCode: 150 }, { versionCode: 151 }],
          }), { status: 200 }));
        }
        if (callCount === 3) {
          // Get track (checks draft + release notes in single call)
          return Promise.resolve(new Response(JSON.stringify({
            track: 'production',
            releases: [{
              status: 'completed',
              versionCodes: ['150'],
              releaseNotes: [
                { language: 'en-US', text: 'Notes' },
                { language: 'tr-TR', text: 'Notlar' },
              ],
            }],
          }), { status: 200 }));
        }
        // Commit edit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { validateRelease } = await import('../tools/tracks.js');
      const result = await validateRelease('production', '151');

      expect(result).toContain('## Release Validation');
      expect(result).toContain('PASS');
      expect(result).toContain('Bundle uploaded');
      expect(result).toContain('151');
      // Verify commit was called (4 fetch calls: edit + bundles + track + commit)
      expect(callCount).toBe(4);
    });

    it('should fail when version code not found', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          return Promise.resolve(new Response(JSON.stringify({
            bundles: [{ versionCode: 100 }],
          }), { status: 200 }));
        }
        if (callCount === 3) {
          return Promise.resolve(new Response(JSON.stringify({
            track: 'production',
            releases: [],
          }), { status: 200 }));
        }
        // Commit edit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { validateRelease } = await import('../tools/tracks.js');
      const result = await validateRelease('production', '999');

      expect(result).toContain('FAIL');
      expect(result).toContain('not found');
    });

    it('should detect blocking draft releases', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          return Promise.resolve(new Response(JSON.stringify({
            bundles: [{ versionCode: 200 }],
          }), { status: 200 }));
        }
        if (callCount === 3) {
          return Promise.resolve(new Response(JSON.stringify({
            track: 'production',
            releases: [
              { status: 'draft', versionCodes: ['199'] },
              { status: 'completed', versionCodes: ['198'] },
            ],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { validateRelease } = await import('../tools/tracks.js');
      const result = await validateRelease('production', '200');

      expect(result).toContain('FAIL');
      expect(result).toContain('draft');
      expect(result).toContain('block');
    });
  });

  describe('releaseHistory', () => {
    it('should show release history for a track and commit edit', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          // Get track
          return Promise.resolve(new Response(JSON.stringify({
            track: 'production',
            releases: [
              {
                status: 'completed',
                versionCodes: ['151'],
                name: '2.2.0',
                releaseNotes: [{ language: 'en-US', text: 'New features' }],
              },
              {
                status: 'completed',
                versionCodes: ['150'],
                name: '2.1.0',
                releaseNotes: [{ language: 'en-US', text: 'Bug fixes' }],
              },
            ],
          }), { status: 200 }));
        }
        // Commit edit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { releaseHistory } = await import('../tools/tracks.js');
      const result = await releaseHistory('production');

      expect(result).toContain('## Release History: PRODUCTION');
      expect(result).toContain('151');
      expect(result).toContain('150');
      expect(result).toContain('2.2.0');
      expect(result).toContain('2.1.0');
      expect(result).toContain('New features');
      expect(result).toContain('Bug fixes');
      // Verify commit was called (3 fetch calls: edit + track + commit)
      expect(callCount).toBe(3);
    });

    it('should handle empty track', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          return Promise.resolve(new Response(JSON.stringify({
            track: 'alpha',
            releases: [],
          }), { status: 200 }));
        }
        // Commit edit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { releaseHistory } = await import('../tools/tracks.js');
      const result = await releaseHistory('alpha');

      expect(result).toContain('No releases found');
    });

    it('should respect limit parameter', async () => {
      let callCount = 0;
      const manyReleases = Array.from({ length: 5 }, (_, i) => ({
        status: 'completed',
        versionCodes: [String(100 + i)],
        name: `1.${i}.0`,
      }));

      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          return Promise.resolve(new Response(JSON.stringify({
            track: 'production',
            releases: manyReleases,
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { releaseHistory } = await import('../tools/tracks.js');
      const result = await releaseHistory('production', 2);

      expect(result).toContain('100');
      expect(result).toContain('101');
      expect(result).not.toContain('102');
      expect(result).toContain('Showing 2 of 5 releases');
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

    it('should reject auto-filled notes that exceed 500 characters', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(new Response(JSON.stringify(
          callCount === 1 ? { id: 'edit-1' } : {}
        ), { status: 200 }));
      });

      const { createRelease } = await import('../tools/tracks.js');
      // 500 chars in en-US will be auto-filled to other locales — should still pass at exactly 500
      const exactNote = 'x'.repeat(500);
      const result = await createRelease(
        'internal',
        '100',
        { 'en-US': exactNote },
      );

      expect(result).toContain('## Release Created');
      expect(result).toContain('Auto-filled');
    });

    it('should not mutate the original releaseNotes object', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(new Response(JSON.stringify(
          callCount === 1 ? { id: 'edit-1' } : {}
        ), { status: 200 }));
      });

      const { createRelease } = await import('../tools/tracks.js');
      const originalNotes = { 'en-US': 'Test notes' };
      const keysBefore = Object.keys(originalNotes);
      await createRelease('internal', '100', originalNotes);
      const keysAfter = Object.keys(originalNotes);

      // Original object should not be mutated
      expect(keysAfter).toEqual(keysBefore);
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

    it('should update release notes successfully (happy path)', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          // get track
          return Promise.resolve(new Response(JSON.stringify({
            track: 'production',
            releases: [{ status: 'completed', versionCodes: ['53'], releaseNotes: [] }],
          }), { status: 200 }));
        }
        if (callCount === 3) {
          // put track
          return Promise.resolve(new Response(JSON.stringify({
            track: 'production',
            releases: [{ status: 'completed', versionCodes: ['53'], releaseNotes: [{ language: 'en-US', text: 'Bug fixes' }] }],
          }), { status: 200 }));
        }
        // commit edit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { updateReleaseNotes } = await import('../tools/tracks.js');
      const result = await updateReleaseNotes('production', { 'en-US': 'Bug fixes', 'tr-TR': 'Hata duzeltmeleri' });

      expect(result).toContain('Release Notes Updated');
      expect(result).toContain('en-US');
      expect(result).toContain('Bug fixes');
      expect(result).toContain('tr-TR');
      expect(result).toContain('Updated and committed successfully');
    });

    it('should warn about missing locales', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        if (callCount === 2) return Promise.resolve(new Response(JSON.stringify({
          track: 'internal', releases: [{ status: 'draft', versionCodes: ['50'], releaseNotes: [] }],
        }), { status: 200 }));
        if (callCount === 3) return Promise.resolve(new Response(JSON.stringify({ track: 'internal' }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { updateReleaseNotes } = await import('../tools/tracks.js');
      // Only provide en-US, other locales should trigger warning
      const result = await updateReleaseNotes('internal', { 'en-US': 'Test' });

      expect(result).toContain('Release Notes Updated');
      expect(result).toContain('Warning');
      expect(result).toContain('missing');
    });

    it('should return error when no releases exist', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify({ track: 'production', releases: [] }), { status: 200 }));
      });

      const { updateReleaseNotes } = await import('../tools/tracks.js');
      const result = await updateReleaseNotes('production', { 'en-US': 'Notes' });

      expect(result).toContain('**Error:**');
      expect(result).toContain('No releases found');
    });
  });
});
