import type { FormState } from '@/shared/contract';

/**
 * The review is done (the PDF can be downloaded): the user said they're finished, the agent
 * reached the last section of the read-back, or the conversation ended during the review.
 */
export function isReviewDone(s: FormState): boolean {
  if (s.phase === 'done') return true;
  const r = s.review;
  if (!r) return false;
  const last = r.sectionIds[r.sectionIds.length - 1];
  return (last !== undefined && r.currentSectionId === last) || s.agentMode === 'off';
}
