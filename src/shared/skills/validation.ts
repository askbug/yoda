import type { SkillFrontmatter, SkillValidationIssue } from './types';

export const CODEX_SKILL_DESCRIPTION_MAX_LENGTH = 1024;

/** Validate a skill name: lowercase, hyphens, 1-64 chars */
export function isValidSkillName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]?$/.test(name) && !name.includes('--');
}

/** Parse YAML frontmatter from SKILL.md content */
export function parseFrontmatter(content: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: { name: '', description: '' },
      body: content,
    };
  }

  const body = match[2];
  const frontmatter = parseYamlFrontmatterFields(match[1]);

  return {
    frontmatter: {
      name: frontmatter['name'] || '',
      description: frontmatter['description'] || '',
      license: frontmatter['license'],
      compatibility: frontmatter['compatibility'],
      'allowed-tools': frontmatter['allowed-tools'],
    },
    body,
  };
}

export function validateSkillFrontmatter(
  frontmatter: SkillFrontmatter,
  options: { skillFilePath?: string } = {}
): SkillValidationIssue[] {
  const description = frontmatter.description ?? '';
  const issues: SkillValidationIssue[] = [];

  if (!description.trim()) {
    issues.push({
      severity: 'error',
      agent: 'codex',
      field: 'description',
      code: 'codex-description-required',
      message: 'invalid description: is required',
      path: options.skillFilePath,
    });
  }

  if (description.length > CODEX_SKILL_DESCRIPTION_MAX_LENGTH) {
    issues.push({
      severity: 'error',
      agent: 'codex',
      field: 'description',
      code: 'codex-description-too-long',
      message: `invalid description: exceeds maximum length of ${CODEX_SKILL_DESCRIPTION_MAX_LENGTH} characters`,
      path: options.skillFilePath,
      max: CODEX_SKILL_DESCRIPTION_MAX_LENGTH,
      actual: description.length,
    });
  }

  return issues;
}

const TOP_LEVEL_FIELD_REGEX = /^([A-Za-z0-9_-]+):\s*(.*)$/;

function parseYamlFrontmatterFields(yamlBlock: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = yamlBlock.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const fieldMatch = lines[i].match(TOP_LEVEL_FIELD_REGEX);
    if (!fieldMatch) continue;

    const key = fieldMatch[1];
    const value = fieldMatch[2].trim();
    const blockStyle = getBlockScalarStyle(value);
    if (blockStyle) {
      const blockLines: string[] = [];
      i += 1;

      for (; i < lines.length; i += 1) {
        const blockLine = lines[i];
        if (blockLine.trim() && TOP_LEVEL_FIELD_REGEX.test(blockLine)) {
          i -= 1;
          break;
        }
        blockLines.push(blockLine);
      }

      fields[key] = formatBlockScalar(blockLines, blockStyle);
      continue;
    }

    fields[key] = unquoteYamlScalar(value);
  }

  return fields;
}

function getBlockScalarStyle(value: string): 'folded' | 'literal' | null {
  if (/^>[+-]?$/.test(value)) return 'folded';
  if (/^\|[+-]?$/.test(value)) return 'literal';
  return null;
}

function formatBlockScalar(lines: string[], style: 'folded' | 'literal'): string {
  const normalized = stripCommonIndent(lines);
  if (style === 'literal') return normalized.join('\n').trim();

  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of normalized) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length > 0) {
        paragraphs.push(current.join(' '));
        current = [];
      }
      paragraphs.push('');
      continue;
    }
    current.push(trimmed);
  }

  if (current.length > 0) paragraphs.push(current.join(' '));
  return paragraphs.join('\n').trim();
}

function stripCommonIndent(lines: string[]): string[] {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => (line.trim() ? line.slice(minIndent) : ''));
}

function unquoteYamlScalar(value: string): string {
  const wasDoubleQuoted = value.startsWith('"') && value.endsWith('"');
  const wasSingleQuoted = value.startsWith("'") && value.endsWith("'");
  if (!wasDoubleQuoted && !wasSingleQuoted) return value;

  const unquoted = value.slice(1, -1);
  if (wasDoubleQuoted) return unquoted.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return unquoted.replace(/''/g, "'");
}

function escapeYamlDoubleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function generateSkillMd(name: string, description: string, body?: string): string {
  const escapedName = escapeYamlDoubleQuoted(name);
  const escapedDesc = escapeYamlDoubleQuoted(description);
  const defaultBody = `# ${name}\n\n${description}\n`;
  const content = body && body.trim() ? body.trim() : defaultBody;
  return `---
name: "${escapedName}"
description: "${escapedDesc}"
---

${content}
`;
}
