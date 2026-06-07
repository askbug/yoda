import { useEffect } from 'react';
import { quitAgentSessionsRequestedChannel } from '@shared/events/appEvents';
import { events } from '@renderer/lib/ipc';
import { useShowModal } from '@renderer/lib/modal/modal-provider';

export function QuitAgentSessionsPrompt() {
  const showQuitAgentSessionsModal = useShowModal('quitAgentSessionsModal');

  useEffect(() => {
    return events.on(quitAgentSessionsRequestedChannel, (request) => {
      showQuitAgentSessionsModal({ request });
    });
  }, [showQuitAgentSessionsModal]);

  return null;
}
