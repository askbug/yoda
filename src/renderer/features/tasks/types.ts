export type SidebarTab = 'task' | 'conversations' | 'changes' | 'files' | 'context';

export type FileRendererData =
  | { kind: 'text' }
  | { kind: 'markdown' }
  | { kind: 'markdown-source' }
  | { kind: 'svg' }
  | { kind: 'svg-source' }
  | { kind: 'image' }
  | { kind: 'binary' }
  | { kind: 'too-large' }
  | { kind: 'file-error' };
