import { gpcGet, gpcPost, getPackageName } from '../client.js';

interface ReviewComment {
  text: string;
  lastModified: { seconds: string; nanos: number };
  starRating: number;
  reviewerLanguage: string;
  device: string;
  androidOsVersion: number;
  appVersionCode: number;
  appVersionName: string;
  thumbsUpCount: number;
  thumbsDownCount: number;
  originalText?: string;
}

interface Review {
  reviewId: string;
  authorName: string;
  comments: {
    userComment?: ReviewComment;
    developerComment?: {
      text: string;
      lastModified: { seconds: string; nanos: number };
    };
  }[];
}

interface ReviewsResponse {
  reviews: Review[];
  tokenPagination?: { nextPageToken: string };
}

export async function listReviews(
  maxResults: number = 20,
  translationLanguage?: string,
): Promise<string> {
  const pkg = getPackageName();
  const params: Record<string, string> = {
    maxResults: String(Math.min(maxResults, 100)),
  };
  if (translationLanguage) {
    params.translationLanguage = translationLanguage;
  }

  const result = await gpcGet<ReviewsResponse>(
    `/applications/${pkg}/reviews`,
    params,
  );

  const reviews = result.reviews || [];

  if (reviews.length === 0) {
    return `## User Reviews\n\nNo reviews found for \`${pkg}\`.`;
  }

  let md = `## User Reviews (${reviews.length})\n\n`;

  // Summary stats
  const ratings: number[] = [];
  for (const review of reviews) {
    const userComment = review.comments?.[0]?.userComment;
    if (userComment?.starRating) ratings.push(userComment.starRating);
  }
  if (ratings.length > 0) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    md += `**Average Rating:** ${avg.toFixed(1)} / 5.0 (from ${ratings.length} reviews shown)\n\n`;
  }

  md += `| Rating | Author | Comment | Device | Version | Replied |\n`;
  md += `|--------|--------|---------|--------|---------|----------|\n`;

  for (const review of reviews) {
    const userComment = review.comments?.[0]?.userComment;
    if (!userComment) continue;

    const stars = getStarDisplay(userComment.starRating);
    const text = userComment.text
      ? (userComment.text.length > 60 ? userComment.text.slice(0, 60) + '...' : userComment.text)
      : '-';
    const device = userComment.device || '-';
    const version = userComment.appVersionName || '-';
    const hasReply = review.comments?.[0]?.developerComment ? 'Yes' : 'No';

    md += `| ${stars} | ${review.authorName || 'Anonymous'} | ${text.replace(/\|/g, '/')} | ${device} | ${version} | ${hasReply} |\n`;
  }

  // Highlight unreplied low-rating reviews
  const unrepliedLow = reviews.filter(r => {
    const uc = r.comments?.[0]?.userComment;
    const dc = r.comments?.[0]?.developerComment;
    return uc && uc.starRating <= 2 && !dc;
  });

  if (unrepliedLow.length > 0) {
    md += `\n> **Attention:** ${unrepliedLow.length} unreplied review(s) with 1-2 stars. Consider replying to improve ratings.\n`;
    for (const r of unrepliedLow.slice(0, 5)) {
      md += `> - Review ID: \`${r.reviewId}\` (${r.comments[0].userComment?.starRating} star)\n`;
    }
  }

  return md;
}

export async function replyReview(
  reviewId: string,
  replyText: string,
): Promise<string> {
  const pkg = getPackageName();

  const result = await gpcPost<any>(
    `/applications/${pkg}/reviews/${reviewId}:reply`,
    { replyText },
  );

  let md = `## Reply Sent\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Review ID** | ${reviewId} |\n`;
  md += `| **Reply** | ${replyText.length > 80 ? replyText.slice(0, 80) + '...' : replyText} |\n`;
  md += `\n**Status:** Reply sent successfully.`;

  return md;
}

function getStarDisplay(rating: number): string {
  return `${'*'.repeat(rating)}${'_'.repeat(5 - rating)} (${rating})`;
}
