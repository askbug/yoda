// Declarative registry of the project-level config surface each agent runtime reads.
// This is the domain knowledge behind the harness view: which files act as system
// prompts, where skills/commands/subagents live, and how MCP servers are declared.
export type HarnessRuntimeId = 'claude' | 'codex';

export type McpSourceSpec =
  | { kind: 'mcp-json'; relativePath: string }
  | { kind: 'codex-toml'; relativePath: string };

export type RuntimeSurfaceSpec = {
  id: HarnessRuntimeId;
  /** Memory / system-prompt files, ordered by load priority. */
  memoryFiles: string[];
  /** Directories scanned recursively for SKILL.md folders. */
  skillDirs: string[];
  /** Directories holding flat *.md slash commands. Empty = unsupported. */
  commandDirs: string[];
  /** Directories holding *.md subagent definitions. Empty = unsupported. */
  subagentDirs: string[];
  /** Runtime settings files (existence surfaced in the debug section). */
  settingsFiles: string[];
  /** Project-level MCP server declaration, if the runtime supports one. */
  mcp: McpSourceSpec | null;
};

export const HARNESS_RUNTIMES: RuntimeSurfaceSpec[] = [
  {
    id: 'claude',
    memoryFiles: ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md'],
    skillDirs: ['.claude/skills'],
    commandDirs: ['.claude/commands'],
    subagentDirs: ['.claude/agents'],
    settingsFiles: ['.claude/settings.json', '.claude/settings.local.json'],
    mcp: { kind: 'mcp-json', relativePath: '.mcp.json' },
  },
  {
    id: 'codex',
    memoryFiles: ['AGENTS.md', '.codex/AGENTS.md'],
    skillDirs: ['.agents/skills', '.codex/skills'],
    commandDirs: [],
    subagentDirs: [],
    settingsFiles: ['.codex/config.toml'],
    mcp: { kind: 'codex-toml', relativePath: '.codex/config.toml' },
  },
];

export const MAX_MEMORY_FILE_BYTES = 64 * 1024;
export const MAX_FRONTMATTER_BYTES = 4 * 1024;
export const MAX_SKILL_TREE_DEPTH = 4;
export const MAX_FLAT_MD_FILES = 50;
