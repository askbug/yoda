import { useEffect } from 'react';
import { reviewReviewerStartedChannel } from '@shared/events/reviewEvents';
import { asProvisioned, getTaskStore } from '@renderer/features/tasks/stores/task-selectors';
import { events } from '@renderer/lib/ipc';

/**
 * Bridges the main-process review orchestrator's reviewer-start events into the
 * renderer's task view: implementer in the main area, reviewer pinned into the
 * (expanded) sidebar. No-ops when the task isn't currently provisioned — the
 * orchestration keeps running in main regardless.
 */
export function ReviewOrchestrationEvents() {
  useEffect(() => {
    return events.on(reviewReviewerStartedChannel, (payload) => {
      const provisioned = asProvisioned(getTaskStore(payload.projectId, payload.taskId));
      if (!provisioned) return;
      const { tabManager } = provisioned.taskView;
      tabManager.openConversation(payload.implementerConversationId);
      tabManager.openConversationInSidebar(payload.reviewerConversationId);
      provisioned.taskView.setSidebarCollapsed(false);
    });
  }, []);

  return null;
}
