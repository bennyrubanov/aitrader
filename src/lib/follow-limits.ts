export const MAX_FOLLOWED_PORTFOLIOS = 20;

export const FOLLOW_LIMIT_ERROR_CODE = 'FOLLOW_LIMIT_REACHED' as const;

export function followLimitReachedMessage(): string {
  return `You can follow up to ${MAX_FOLLOWED_PORTFOLIOS} portfolios. Unfollow one to make room.`;
}
