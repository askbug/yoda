import type { Dirent } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import type { ContextSkill } from '@shared/conversations';

type ScanCodexSkillsOptions = {
  home?: string;
  codexHome?: string;
};

type SkillFrontmatter = {
  name: string | null;
  description: string;
};

export async function scanCodexSkills(
  cwd: string,
  options: ScanCodexSkillsOptions = {}
): Promise<ContextSkill[]> {
  const home = options.home ?? homedir();
  const codexHome = options.codexHome ?? process.env.CODEX_HOME ?? join(home, '.codex');
  const entries = new Map<string, ContextSkill>();

  await scanSkillsTree(join(codexHome, 'skills'), '', entries);
  await scanPluginSkills(join(codexHome, 'plugins', 'cache'), entries);

  for (const root of [
    join(home, '.agents', 'skills'),
    join(cwd, '.codex', 'skills'),
    join(cwd, '.agents', 'skills'),
  ]) {
    await scanSkillsTree(root, '', entries);
  }

  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function scanSkillsTree(
  root: string,
  prefix: string,
  out: Map<string, ContextSkill>,
  ancestors = new Set<string>()
): Promise<void> {
  const resolvedRoot = await resolveDirectory(root);
  if (!resolvedRoot || ancestors.has(resolvedRoot)) return;
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(resolvedRoot);

  let dirents: Dirent[];
  try {
    dirents = await readdir(resolvedRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const d of dirents) {
    const entryPath = join(resolvedRoot, d.name);
    const skillDir = await resolveDirectoryEntry(entryPath, d);
    if (!skillDir) continue;

    const skillFile = join(skillDir, 'SKILL.md');
    const frontmatter = await readSkillFrontmatter(skillFile);
    const fallbackName = prefix ? `${prefix}:${d.name}` : d.name;
    const skillName = frontmatter?.name ? withPrefix(prefix, frontmatter.name) : fallbackName;
    if (frontmatter !== null) {
      out.set(skillName, {
        name: skillName,
        description: frontmatter.description,
        path: skillFile,
      });
      continue;
    }

    await scanSkillsTree(skillDir, fallbackName, out, nextAncestors);
  }
}

async function scanPluginSkills(cacheRoot: string, out: Map<string, ContextSkill>): Promise<void> {
  const resolvedCacheRoot = await resolveDirectory(cacheRoot);
  if (!resolvedCacheRoot) return;
  const skillRoots = await findPluginSkillRoots(resolvedCacheRoot);
  for (const skillRoot of skillRoots) {
    const prefix = pluginPrefixForSkillRoot(resolvedCacheRoot, skillRoot);
    if (!prefix) continue;
    await scanSkillsTree(skillRoot, prefix, out);
  }
}

async function findPluginSkillRoots(root: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string, ancestors = new Set<string>()): Promise<void> {
    const resolvedDir = await resolveDirectory(dir);
    if (!resolvedDir || ancestors.has(resolvedDir)) return;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(resolvedDir);

    let dirents: Dirent[];
    try {
      dirents = await readdir(resolvedDir, { withFileTypes: true });
    } catch {
      return;
    }

    if (resolvedDir.endsWith(`${sep}skills`)) {
      out.push(resolvedDir);
      return;
    }

    for (const d of dirents) {
      const entryPath = join(resolvedDir, d.name);
      const childDir = await resolveDirectoryEntry(entryPath, d);
      if (childDir) await walk(childDir, nextAncestors);
    }
  }

  await walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function pluginPrefixForSkillRoot(cacheRoot: string, skillRoot: string): string | null {
  const parts = relative(cacheRoot, skillRoot).split(sep);
  const skillsIndex = parts.lastIndexOf('skills');
  if (skillsIndex < 2) return null;
  return parts[skillsIndex - 2] || null;
}

function withPrefix(prefix: string, name: string): string {
  return prefix ? `${prefix}:${name}` : name;
}

async function resolveDirectory(path: string): Promise<string | null> {
  try {
    const resolved = await realpath(path);
    const s = await stat(resolved);
    return s.isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

async function resolveDirectoryEntry(path: string, dirent: Dirent): Promise<string | null> {
  if (!dirent.isDirectory() && !dirent.isSymbolicLink()) return null;
  return resolveDirectory(path);
}

async function readSkillFrontmatter(path: string): Promise<SkillFrontmatter | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  const frontmatter = parseSkillFrontmatter(raw);
  return {
    name: frontmatter.name,
    description: frontmatter.description,
  };
}

function parseSkillFrontmatter(raw: string): SkillFrontmatter {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: null, description: '' };

  const fields = new Map<string, string>();
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) continue;
    const key = keyMatch[1];
    const value = keyMatch[2].trim();
    if (value === '>' || value === '|') {
      const blockLines: string[] = [];
      i += 1;
      for (; i < lines.length; i += 1) {
        const blockLine = lines[i];
        if (blockLine.trim() && !/^\s/.test(blockLine)) {
          i -= 1;
          break;
        }
        blockLines.push(blockLine.replace(/^\s{2}/, ''));
      }
      fields.set(
        key,
        value === '>'
          ? blockLines
              .map((part) => part.trim())
              .filter(Boolean)
              .join(' ')
          : blockLines.join('\n').trim()
      );
      continue;
    }
    fields.set(key, unquoteYamlScalar(value));
  }

  return {
    name: fields.get('name')?.trim() || null,
    description: fields.get('description')?.trim() ?? '',
  };
}

function unquoteYamlScalar(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const unquoted = value.slice(1, -1);
    return value.startsWith('"')
      ? unquoted.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : unquoted.replace(/''/g, "'");
  }
  return value;
}
