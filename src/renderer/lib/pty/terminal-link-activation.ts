import type { Terminal } from '@xterm/xterm';

const IS_MAC_PLATFORM =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export function isTerminalLinkActivation(event: MouseEvent): boolean {
  return event.button === 0 && (IS_MAC_PLATFORM ? event.metaKey : event.ctrlKey);
}

export function getTerminalLinkActivationHint(): string {
  return IS_MAC_PLATFORM ? 'Hold Cmd and click to open' : 'Hold Ctrl and click to open';
}

export function createTerminalLinkHoverHandlers(terminal: Terminal): {
  hover: (event: MouseEvent) => void;
  leave: () => void;
  dispose: () => void;
} {
  let tooltip: HTMLDivElement | null = null;

  const removeTooltip = () => {
    tooltip?.remove();
    tooltip = null;
  };

  return {
    hover: (event) => {
      const terminalElement = terminal.element;
      if (!terminalElement) return;

      removeTooltip();

      tooltip = document.createElement('div');
      tooltip.className =
        'xterm-hover pointer-events-none absolute z-50 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[11px] leading-4 text-background shadow-md';
      tooltip.textContent = getTerminalLinkActivationHint();
      tooltip.style.opacity = '0.95';

      const terminalRect = terminalElement.getBoundingClientRect();
      terminalElement.appendChild(tooltip);

      const tooltipRect = tooltip.getBoundingClientRect();
      const padding = 4;
      const preferredLeft = event.clientX - terminalRect.left + 8;
      const preferredTop = event.clientY - terminalRect.top - tooltipRect.height - 8;
      const fallbackTop = event.clientY - terminalRect.top + 12;
      const maxLeft = Math.max(padding, terminalRect.width - tooltipRect.width - padding);
      const maxTop = Math.max(padding, terminalRect.height - tooltipRect.height - padding);
      const left = Math.min(Math.max(padding, preferredLeft), maxLeft);
      const top = Math.min(
        Math.max(padding, preferredTop >= padding ? preferredTop : fallbackTop),
        maxTop
      );

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    },
    leave: removeTooltip,
    dispose: removeTooltip,
  };
}
