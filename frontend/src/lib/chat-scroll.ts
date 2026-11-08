export const NEAR_BOTTOM_PX = 80;

export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export function isNearBottom(
  el: ScrollMetrics,
  thresholdPx: number = NEAR_BOTTOM_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

export function shouldAutoScroll(params: {
  stuckToBottom: boolean;
  lastMessageIsUser: boolean;
}): boolean {
  return params.stuckToBottom || params.lastMessageIsUser;
}

export function scrollBehaviorForMotion(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? 'auto' : 'smooth';
}
