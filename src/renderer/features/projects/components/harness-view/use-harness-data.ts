import { useQuery } from '@tanstack/react-query';
import type { CatalogSkill } from '@shared/skills/types';
import { rpc } from '@renderer/lib/ipc';
import {
  HARNESS_RUNTIMES,
  MAX_FLAT_MD_FILES,
  MAX_FRONTMATTER_BYTES,
  MAX_MEMORY_FILE_BYTES,
  MAX_SKILL_TREE_DEPTH,
  type HarnessRuntimeId,
  type McpSourceSpec,
  type RuntimeSurfaceSpec,
} from './harness-spec';

export type ProjectData = {
  type: 'local' | 'ssh';
  path: string;
  connectionId?: string;
};

export type HarnessMemoryFile = {
  relativePath: string;
  content: string;
  truncated: boolean;
  totalSize: number;
};

export type HarnessSkill = {
  id: string;
  displayName: string;
  description: string;
  disabled: boolean;
  validationIssueCount: number;
  /** Source directories where this skill was found (provenance). */
  sources: string[];
};

export type HarnessMdEntry = {
  name: string;
  description: string;
  /** Source file path (provenance). */
  path: string;
};

export type HarnessMcpServer = {
  name: string;
  detail: string;
  /** Config file declaring this server (provenance). */
  sourcePath: string;
};

export type HarnessFileStatus = {
  relativePath: string;
  exists: boolean;
};

export type HarnessRuntimeData = {
  memoryFiles: HarnessMemoryFile[];
  /** Memory file paths declared by the spec but absent in the project. */
  missingMemoryFiles: string[];
  skills: HarnessSkill[];
  commands: HarnessMdEntry[];
  subagents: HarnessMdEntry[];
  mcpServers: HarnessMcpServer[];
  settingsFiles: HarnessFileStatus[];
  skillDirs: HarnessFileStatus[];
};

export type HarnessData = Record<HarnessRuntimeId, HarnessRuntimeData>;

export function useHarnessData(projectId: string, projectData: ProjectData | undefined) {
  return useQuery({
    queryKey: ['project-harness', projectId, projectData?.path ?? ''],
    queryFn: () => {
      if (!projectData) throw new Error('project not mounted');
      return loadHarnessData(projectId, projectData);
    },
    enabled: Boolean(projectData),
    refetchOnMount: 'always',
  });
}

async function loadHarnessData(projectId: string, project: ProjectData): Promise<HarnessData> {
  const loader = new HarnessLoader(projectId, project);
  const entries = await Promise.all(
    HARNESS_RUNTIMES.map(async (spec) => [spec.id, await loader.loadRuntime(spec)] as const)
  );
  return Object.fromEntries(entries) as HarnessData;
}

type DirectoryEntry = { path: string; type: 'file' | 'dir' };
type DirectoryListing = { exists: boolean; entries: DirectoryEntry[] };
type FileRead = { content: string; truncated: boolean; totalSize: number } | null;

/**
 * Scans the project once per unique path; per-runtime assembly reuses the
 * memoized listings/reads so overlapping surfaces (e.g. .agents/skills) are
 * only fetched a single time.
 */
class HarnessLoader {
  private listings = new Map<string, Promise<DirectoryListing>>();
  private reads = new Map<string, Promise<FileRead>>();
  private catalog: Promise<Map<string, CatalogSkill>> | null = null;

  constructor(
    private projectId: string,
    private project: ProjectData
  ) {}

  async loadRuntime(spec: RuntimeSurfaceSpec): Promise<HarnessRuntimeData> {
    const [memory, skills, commands, subagents, mcpServers, settingsFiles, skillDirs] =
      await Promise.all([
        this.loadMemoryFiles(spec.memoryFiles),
        this.loadSkills(spec.skillDirs),
        this.loadFlatMdEntries(spec.commandDirs),
        this.loadFlatMdEntries(spec.subagentDirs),
        this.loadMcpServers(spec.mcp),
        Promise.all(spec.settingsFiles.map((path) => this.fileStatus(path))),
        Promise.all(
          spec.skillDirs.map(async (path) => ({
            relativePath: path,
            exists: (await this.listDir(path)).exists,
          }))
        ),
      ]);

    return {
      memoryFiles: memory.found,
      missingMemoryFiles: memory.missing,
      skills,
      commands,
      subagents,
      mcpServers,
      settingsFiles,
      skillDirs,
    };
  }

  private async loadMemoryFiles(paths: string[]) {
    const found: HarnessMemoryFile[] = [];
    const missing: string[] = [];
    await Promise.all(
      paths.map(async (relativePath) => {
        const read = await this.readFile(relativePath, MAX_MEMORY_FILE_BYTES);
        if (read) {
          found.push({ relativePath, ...read });
        } else {
          missing.push(relativePath);
        }
      })
    );
    found.sort((a, b) => paths.indexOf(a.relativePath) - paths.indexOf(b.relativePath));
    return { found, missing };
  }

  private async loadSkills(dirs: string[]): Promise<HarnessSkill[]> {
    const catalog = await this.loadCatalog();
    const perDir = await Promise.all(dirs.map((dir) => this.scanSkillTree(dir, dir, '', 0)));

    const grouped = new Map<string, HarnessSkill>();
    perDir.flat().forEach((skill) => {
      const existing = grouped.get(skill.id);
      if (existing) {
        existing.disabled = existing.disabled && skill.disabled;
        existing.validationIssueCount += skill.validationIssueCount;
        existing.sources.push(...skill.sources);
        if (!existing.description) existing.description = skill.description;
        return;
      }
      grouped.set(skill.id, skill);
    });

    // Catalog metadata (display name, description, disabled state) wins when available.
    for (const skill of grouped.values()) {
      for (const source of skill.sources) {
        const catalogSkill = catalog.get(this.absolutePath(source));
        if (!catalogSkill) continue;
        skill.displayName = catalogSkill.displayName || skill.displayName;
        skill.description = catalogSkill.description || skill.description;
        skill.disabled = skill.disabled || catalogSkill.disabled === true;
        skill.validationIssueCount = Math.max(
          skill.validationIssueCount,
          catalogSkill.validationIssues?.length ?? 0
        );
        break;
      }
    }

    return [...grouped.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  private async scanSkillTree(
    rootPath: string,
    directoryPath: string,
    namespace: string,
    depth: number
  ): Promise<HarnessSkill[]> {
    if (depth > MAX_SKILL_TREE_DEPTH) return [];
    const listing = await this.listDir(directoryPath);
    if (!listing.exists) return [];

    const skillFile = listing.entries.find((entry) => {
      if (entry.type !== 'file') return false;
      const name = basename(entry.path);
      return name === 'SKILL.md' || name === 'SKILL.md.disabled';
    });

    const ownSkill: HarnessSkill[] =
      skillFile && directoryPath !== rootPath
        ? [
            {
              id: namespace,
              displayName: namespace,
              description: '',
              disabled: skillFile.path.endsWith('.disabled'),
              validationIssueCount: 0,
              sources: [directoryPath],
            },
          ]
        : [];

    const children = await Promise.all(
      listing.entries
        .filter((entry) => entry.type === 'dir' && !basename(entry.path).startsWith('.'))
        .map((entry) =>
          this.scanSkillTree(
            rootPath,
            entry.path,
            namespace ? `${namespace}:${basename(entry.path)}` : basename(entry.path),
            depth + 1
          )
        )
    );

    return [...ownSkill, ...children.flat()];
  }

  /** Flat *.md entries (slash commands, subagents): name from filename, description from frontmatter. */
  private async loadFlatMdEntries(dirs: string[]): Promise<HarnessMdEntry[]> {
    const perDir = await Promise.all(
      dirs.map(async (dir) => {
        const listing = await this.listDir(dir);
        if (!listing.exists) return [];

        const files = listing.entries
          .filter((entry) => entry.type === 'file' && entry.path.endsWith('.md'))
          .slice(0, MAX_FLAT_MD_FILES);

        return Promise.all(
          files.map(async (entry) => {
            const read = await this.readFile(entry.path, MAX_FRONTMATTER_BYTES);
            const frontmatter = read ? parseFrontmatter(read.content) : {};
            return {
              name: frontmatter.name || basename(entry.path).replace(/\.md$/, ''),
              description: frontmatter.description ?? '',
              path: entry.path,
            };
          })
        );
      })
    );
    return perDir.flat().sort((a, b) => a.name.localeCompare(b.name));
  }

  private async loadMcpServers(spec: McpSourceSpec | null): Promise<HarnessMcpServer[]> {
    if (!spec) return [];
    const read = await this.readFile(spec.relativePath, MAX_MEMORY_FILE_BYTES);
    if (!read) return [];

    if (spec.kind === 'mcp-json') {
      try {
        const parsed = JSON.parse(read.content) as {
          mcpServers?: Record<string, { command?: string; args?: string[]; url?: string }>;
        };
        return Object.entries(parsed.mcpServers ?? {}).map(([name, server]) => ({
          name,
          detail: server.url ?? [server.command, ...(server.args ?? [])].filter(Boolean).join(' '),
          sourcePath: spec.relativePath,
        }));
      } catch {
        return [];
      }
    }

    // codex-toml: only surface server names — parsing full TOML is not worth it here.
    return [...read.content.matchAll(/^\s*\[mcp_servers\.([^\]]+)\]/gm)].map((match) => ({
      name: match[1].replace(/^"|"$/g, ''),
      detail: '',
      sourcePath: spec.relativePath,
    }));
  }

  private async fileStatus(relativePath: string): Promise<HarnessFileStatus> {
    const read = await this.readFile(relativePath, 1);
    return { relativePath, exists: read !== null };
  }

  private listDir(relativePath: string): Promise<DirectoryListing> {
    const cached = this.listings.get(relativePath);
    if (cached) return cached;

    const promise = rpc.fs
      .listPathCompletions(this.projectId, relativePath || '.', {
        pathKind: 'relative',
        includeHidden: true,
        maxEntries: 500,
      })
      .then((result) =>
        result.success
          ? { exists: true, entries: result.data.entries }
          : { exists: false, entries: [] }
      );
    this.listings.set(relativePath, promise);
    return promise;
  }

  private readFile(relativePath: string, maxBytes: number): Promise<FileRead> {
    const key = `${relativePath}::${maxBytes}`;
    const cached = this.reads.get(key);
    if (cached) return cached;

    const promise = rpc.fs
      .readProjectFile(this.projectId, relativePath, maxBytes)
      .then((result) => (result.success ? result.data : null));
    this.reads.set(key, promise);
    return promise;
  }

  private loadCatalog(): Promise<Map<string, CatalogSkill>> {
    if (this.catalog) return this.catalog;
    this.catalog =
      this.project.type === 'local'
        ? rpc.skills.getCatalog({ projectPath: this.project.path }).then((result) => {
            const byPath = new Map<string, CatalogSkill>();
            if (!result.success || !result.data) return byPath;
            for (const skill of result.data.skills) {
              if (!skill.installed || !skill.localPath) continue;
              byPath.set(normalizePath(skill.localPath), skill);
            }
            return byPath;
          })
        : Promise.resolve(new Map());
    return this.catalog;
  }

  private absolutePath(relativePath: string): string {
    return normalizePath(`${this.project.path.replace(/[\\/]+$/, '')}/${relativePath}`);
  }
}

function parseFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith('---')) return {};
  const end = content.indexOf('\n---', 3);
  if (end === -1) return {};

  const result: Record<string, string> = {};
  for (const line of content.slice(3, end).split('\n')) {
    const match = /^([A-Za-z][\w-]*)\s*:\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    result[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
  return result;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function basename(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}
