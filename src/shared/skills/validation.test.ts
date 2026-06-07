import { describe, expect, it } from 'vitest';
import {
  CODEX_SKILL_DESCRIPTION_MAX_LENGTH,
  parseFrontmatter,
  validateSkillFrontmatter,
} from './validation';

describe('parseFrontmatter', () => {
  it('parses folded YAML block scalars in skill frontmatter', () => {
    const { frontmatter, body } = parseFrontmatter(`---
name: lovstudio-any2deck
description: >
  Generate professional slide deck images from content (Markdown, text, URLs).
  Creates outlines with style instructions, then generates individual slide images.
  Supports PPTX/PDF export.
compatibility: >
  Requires an image generation skill and Node.js for PPTX/PDF merge.
  Cross-platform: macOS, Windows, Linux.
---

# Slide Deck Generator
`);

    expect(frontmatter.name).toBe('lovstudio-any2deck');
    expect(frontmatter.description).toBe(
      'Generate professional slide deck images from content (Markdown, text, URLs). Creates outlines with style instructions, then generates individual slide images. Supports PPTX/PDF export.'
    );
    expect(frontmatter.compatibility).toBe(
      'Requires an image generation skill and Node.js for PPTX/PDF merge. Cross-platform: macOS, Windows, Linux.'
    );
    expect(body).toBe('\n# Slide Deck Generator\n');
  });

  it('parses literal YAML block scalars in skill frontmatter', () => {
    const { frontmatter } = parseFrontmatter(`---
name: literal-skill
description: |
  Keep this line.
  Keep the next line.
allowed-tools: |
  Read
  Write
---

# Literal Skill
`);

    expect(frontmatter.description).toBe('Keep this line.\nKeep the next line.');
    expect(frontmatter['allowed-tools']).toBe('Read\nWrite');
  });

  it('detects Codex-incompatible skill descriptions', () => {
    const description = 'x'.repeat(CODEX_SKILL_DESCRIPTION_MAX_LENGTH + 1);
    const issues = validateSkillFrontmatter(
      { name: 'long-description', description },
      { skillFilePath: '/Users/mark/.agents/skills/long-description/SKILL.md' }
    );

    expect(issues).toEqual([
      {
        severity: 'error',
        agent: 'codex',
        field: 'description',
        code: 'codex-description-too-long',
        message: 'invalid description: exceeds maximum length of 1024 characters',
        path: '/Users/mark/.agents/skills/long-description/SKILL.md',
        max: 1024,
        actual: 1025,
      },
    ]);
  });
});
