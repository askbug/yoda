import { autorun, reaction } from 'mobx';
import { observer } from 'mobx-react-lite';
import type * as monacoNS from 'monaco-editor';
import { useCallback, useEffect, useRef } from 'react';
import { useTheme } from '@renderer/lib/hooks/useTheme';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { codeEditorPool } from '@renderer/lib/monaco/monaco-code-pool';
import {
  addMonacoKeyboardShortcuts,
  configureMonacoEditor,
} from '@renderer/lib/monaco/monaco-config';
import { modelRegistry } from '@renderer/lib/monaco/monaco-model-registry';
import { defineMonacoThemes, getMonacoTheme } from '@renderer/lib/monaco/monaco-themes';
import { useMonacoLease } from '@renderer/lib/monaco/use-monaco-lease';
import type { ProjectFileSession } from './project-file-session';

/**
 * Monaco editor bound to a single project-file session. A slim sibling of the
 * task EditorProvider: same pool/model-registry pipeline, none of the task
 * coupling (focus regions, file tree, diff decorations).
 *
 * Mount with a key per session — effects assume the session is stable.
 */
export const ProjectFileEditor = observer(function ProjectFileEditor({
  session,
}: {
  session: ProjectFileSession;
}) {
  const { effectiveTheme, themeFingerprint } = useTheme();
  const showConflictModal = useShowModal('conflictDialog');
  const leaseBox = useMonacoLease(codeEditorPool);

  const hostRef = useRef<HTMLElement | null>(null);
  const prevBufUriRef = useRef<string | undefined>(undefined);
  const buffersRestoredRef = useRef(false);

  // Theme sync — same contract as the task EditorProvider.
  useEffect(() => {
    const m = codeEditorPool.getMonaco();
    if (m) defineMonacoThemes(m as Parameters<typeof defineMonacoThemes>[0]);
    codeEditorPool.setTheme(getMonacoTheme(effectiveTheme));
  }, [effectiveTheme, themeFingerprint]);

  // Editor setup when the lease arrives.
  useEffect(
    () =>
      reaction(
        () => leaseBox.get(),
        (lease) => {
          if (!lease) return;
          configureMonacoEditor(lease.editor);

          const monaco = codeEditorPool.getMonaco();
          if (monaco) {
            addMonacoKeyboardShortcuts(lease.editor, monaco as typeof monacoNS, {
              onSave: () => void session.lifecycle.saveFile(session.filePath),
              onSaveAll: () => void session.lifecycle.saveFile(session.filePath),
            });
          }

          if (hostRef.current) {
            hostRef.current.appendChild(lease.container);
            lease.editor.layout();
          }
        }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Model attachment — re-evaluates when the lease or model status changes.
  useEffect(
    () =>
      autorun(() => {
        const lease = leaseBox.get();
        const bufferUri = session.lifecycle.activeBufferUri;
        if (!lease) return;

        if (!bufferUri) {
          lease.editor.setModel(null);
          prevBufUriRef.current = undefined;
          return;
        }

        if (modelRegistry.modelStatus.get(bufferUri) !== 'ready') return;

        modelRegistry.attach(lease.editor, bufferUri, prevBufUriRef.current);
        prevBufUriRef.current = bufferUri;

        // Hot-exit restore: re-apply crash-recovery buffer content once the
        // model is ready (no-op when no buffer was persisted).
        if (!buffersRestoredRef.current) {
          buffersRestoredRef.current = true;
          void session.lifecycle.restoreBuffers();
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Conflict dialog.
  useEffect(
    () =>
      reaction(
        () => session.lifecycle.pendingConflictUri,
        (uri) => {
          if (!uri) return;
          showConflictModal({
            filePath: session.filePath,
            onSuccess: (accept) => {
              void session.lifecycle.resolveConflict(accept);
            },
          });
        }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const setHost = useCallback(
    (el: HTMLElement | null) => {
      hostRef.current = el;
      const lease = leaseBox.get();
      if (el && lease) {
        el.appendChild(lease.container);
        lease.editor.layout();
      }
    },
    [leaseBox]
  );

  return <div ref={setHost} className="h-full w-full" />;
});
