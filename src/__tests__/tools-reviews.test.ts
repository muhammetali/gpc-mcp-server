import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/reviews', () => {
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

  describe('listReviews', () => {
    it('should return reviews in markdown table', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          reviews: [
            {
              reviewId: 'review-1',
              authorName: 'Ali',
              comments: [{
                userComment: {
                  text: 'Great app, love the voice chat!',
                  starRating: 5,
                  device: 'Samsung Galaxy S24',
                  appVersionName: '2.1.0',
                  appVersionCode: 150,
                  lastModified: { seconds: '1710000000', nanos: 0 },
                  reviewerLanguage: 'tr',
                  androidOsVersion: 34,
                  thumbsUpCount: 3,
                  thumbsDownCount: 0,
                },
              }],
            },
            {
              reviewId: 'review-2',
              authorName: 'Mehmet',
              comments: [{
                userComment: {
                  text: 'App crashes on startup',
                  starRating: 1,
                  device: 'Pixel 8',
                  appVersionName: '2.0.9',
                  appVersionCode: 149,
                  lastModified: { seconds: '1709900000', nanos: 0 },
                  reviewerLanguage: 'tr',
                  androidOsVersion: 34,
                  thumbsUpCount: 0,
                  thumbsDownCount: 0,
                },
              }],
            },
          ],
        }), { status: 200 })
      );

      const { listReviews } = await import('../tools/reviews.js');
      const result = await listReviews();

      expect(result).toContain('## User Reviews');
      expect(result).toContain('Ali');
      expect(result).toContain('Great app');
      expect(result).toContain('Average Rating');
      // Should warn about unreplied low-rating review
      expect(result).toContain('Attention');
      expect(result).toContain('review-2');
    });

    it('should handle empty reviews', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ reviews: [] }), { status: 200 })
      );

      const { listReviews } = await import('../tools/reviews.js');
      const result = await listReviews();

      expect(result).toContain('No reviews found');
    });

    it('should not warn when low-rating reviews have replies', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          reviews: [{
            reviewId: 'review-1',
            authorName: 'User',
            comments: [{
              userComment: {
                text: 'Bad',
                starRating: 1,
                device: 'Phone',
                appVersionName: '2.0',
                appVersionCode: 100,
                lastModified: { seconds: '1710000000', nanos: 0 },
                reviewerLanguage: 'en',
                androidOsVersion: 34,
                thumbsUpCount: 0,
                thumbsDownCount: 0,
              },
              developerComment: {
                text: 'Sorry to hear that',
                lastModified: { seconds: '1710001000', nanos: 0 },
              },
            }],
          }],
        }), { status: 200 })
      );

      const { listReviews } = await import('../tools/reviews.js');
      const result = await listReviews();

      expect(result).not.toContain('Attention');
    });
  });

  describe('replyReview', () => {
    it('should send reply and return success', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: { replyText: 'Thanks!' } }), { status: 200 })
      );

      const { replyReview } = await import('../tools/reviews.js');
      const result = await replyReview('review-1', 'Thanks for your feedback!');

      expect(result).toContain('## Reply Sent');
      expect(result).toContain('review-1');
      expect(result).toContain('Thanks for your feedback');
    });

    it('should reject reply exceeding 350 characters', async () => {
      const { replyReview } = await import('../tools/reviews.js');
      const longReply = 'A'.repeat(351);
      const result = await replyReview('review-1', longReply);

      expect(result).toContain('**Error:**');
      expect(result).toContain('350 characters');
      expect(result).toContain('351');
    });

    it('should accept reply at exactly 350 characters', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: { replyText: 'ok' } }), { status: 200 })
      );

      const { replyReview } = await import('../tools/reviews.js');
      const exactReply = 'A'.repeat(350);
      const result = await replyReview('review-1', exactReply);

      expect(result).toContain('## Reply Sent');
    });
  });
});
