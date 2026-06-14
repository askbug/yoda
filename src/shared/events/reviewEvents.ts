import { defineEvent } from '@shared/ipc/events';

/**
 * Emitted by the main-process review orchestrator each time it starts a new
 * reviewer turn. The renderer uses it to surface the reviewer side-by-side:
 * implementer in the main area, reviewer pinned into the (expanded) task
 * sidebar — the same UX the old renderer-side loop did inline.
 */
export interface ReviewReviewerStarted {
  projectId: string;
  taskId: string;
  implementerConversationId: string;
  reviewerConversationId: string;
}

export const reviewReviewerStartedChannel =
  defineEvent<ReviewReviewerStarted>('review:reviewer-started');
