import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { isValidProviderId } from '@shared/agent-provider-registry';
import type { Agent, AgentDraft, AgentSource } from '@shared/agents';
import { db } from '@main/db/client';
import { agents, type AgentRow } from '@main/db/schema';

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'agent'
  );
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    systemPrompt: row.systemPrompt,
    enabledSkillIds: Array.isArray(row.enabledSkillIds) ? row.enabledSkillIds : [],
    preferredRuntimeProvider: isValidProviderId(row.preferredRuntimeProvider)
      ? row.preferredRuntimeProvider
      : null,
    model: row.model ?? null,
    source: row.source === 'imported' ? 'imported' : 'local',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sanitizeDraft(draft: AgentDraft): Omit<AgentDraft, 'name'> & { name: string } {
  return {
    name: draft.name.trim() || 'Untitled agent',
    description: draft.description.trim(),
    icon: draft.icon.trim(),
    systemPrompt: draft.systemPrompt,
    enabledSkillIds: [...new Set(draft.enabledSkillIds)],
    preferredRuntimeProvider: isValidProviderId(draft.preferredRuntimeProvider)
      ? draft.preferredRuntimeProvider
      : null,
    model: draft.model?.trim() ? draft.model.trim() : null,
  };
}

class AgentsConfigService {
  async list(): Promise<Agent[]> {
    const rows = await db.select().from(agents).orderBy(desc(agents.updatedAt)).execute();
    return rows.map(rowToAgent);
  }

  async get(id: string): Promise<Agent | null> {
    const [row] = await db.select().from(agents).where(eq(agents.id, id)).execute();
    return row ? rowToAgent(row) : null;
  }

  private async uniqueSlug(base: string): Promise<string> {
    const root = slugify(base);
    const existing = new Set(
      (await db.select({ slug: agents.slug }).from(agents).execute()).map((r) => r.slug)
    );
    if (!existing.has(root)) return root;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${root}-${i}`;
      if (!existing.has(candidate)) return candidate;
    }
    return `${root}-${randomUUID().slice(0, 8)}`;
  }

  async create(draft: AgentDraft, source: AgentSource = 'local'): Promise<Agent> {
    const clean = sanitizeDraft(draft);
    const id = randomUUID();
    const slug = await this.uniqueSlug(clean.name);
    await db
      .insert(agents)
      .values({
        id,
        slug,
        name: clean.name,
        description: clean.description,
        icon: clean.icon,
        systemPrompt: clean.systemPrompt,
        enabledSkillIds: clean.enabledSkillIds,
        preferredRuntimeProvider: clean.preferredRuntimeProvider,
        model: clean.model,
        source,
      })
      .execute();
    const created = await this.get(id);
    if (!created) throw new Error('Failed to read back created agent');
    return created;
  }

  async update(id: string, draft: AgentDraft): Promise<Agent> {
    const clean = sanitizeDraft(draft);
    await db
      .update(agents)
      .set({
        name: clean.name,
        description: clean.description,
        icon: clean.icon,
        systemPrompt: clean.systemPrompt,
        enabledSkillIds: clean.enabledSkillIds,
        preferredRuntimeProvider: clean.preferredRuntimeProvider,
        model: clean.model,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agents.id, id))
      .execute();
    const updated = await this.get(id);
    if (!updated) throw new Error(`Agent ${id} not found`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await db.delete(agents).where(eq(agents.id, id)).execute();
  }

  async duplicate(id: string): Promise<Agent> {
    const source = await this.get(id);
    if (!source) throw new Error(`Agent ${id} not found`);
    return this.create(
      {
        name: `${source.name} copy`,
        description: source.description,
        icon: source.icon,
        systemPrompt: source.systemPrompt,
        enabledSkillIds: source.enabledSkillIds,
        preferredRuntimeProvider: source.preferredRuntimeProvider,
        model: source.model,
      },
      'local'
    );
  }
}

export const agentsConfigService = new AgentsConfigService();
