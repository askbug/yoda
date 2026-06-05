import { asc, eq, inArray } from 'drizzle-orm';
import type { Issue } from '@shared/tasks';
import { db } from '@main/db/client';
import {
  issueRecords,
  taskIssueLinks,
  tasks,
  type IssueRecordInsert,
  type IssueRecordRow,
  type TaskRow,
} from '@main/db/schema';

function issueToInsert(issue: Issue): IssueRecordInsert {
  return {
    url: issue.url,
    provider: issue.provider,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    branchName: issue.branchName ?? null,
    status: issue.status ?? null,
    assignees: issue.assignees ?? null,
    project: issue.project ?? null,
    updatedAt: issue.updatedAt ?? null,
    fetchedAt: issue.fetchedAt ?? null,
  };
}

function rowToIssue(row: IssueRecordRow): Issue {
  return {
    provider: row.provider as Issue['provider'],
    url: row.url,
    title: row.title,
    identifier: row.identifier,
    description: row.description ?? undefined,
    branchName: row.branchName ?? undefined,
    status: row.status ?? undefined,
    assignees: row.assignees ?? undefined,
    project: row.project ?? undefined,
    updatedAt: row.updatedAt ?? undefined,
    fetchedAt: row.fetchedAt ?? undefined,
  };
}

function uniqueIssues(issues: Issue[]): Issue[] {
  const byUrl = new Map<string, Issue>();
  for (const issue of issues) {
    if (!issue.url.trim()) continue;
    byUrl.set(issue.url, issue);
  }
  return [...byUrl.values()];
}

export async function upsertIssueRecords(issues: Issue[]): Promise<Issue[]> {
  const unique = uniqueIssues(issues);

  for (const issue of unique) {
    const row = issueToInsert(issue);
    await db
      .insert(issueRecords)
      .values(row)
      .onConflictDoUpdate({
        target: issueRecords.url,
        set: {
          provider: row.provider,
          identifier: row.identifier,
          title: row.title,
          description: row.description,
          branchName: row.branchName,
          status: row.status,
          assignees: row.assignees,
          project: row.project,
          updatedAt: row.updatedAt,
          fetchedAt: row.fetchedAt,
        },
      });
  }

  return unique;
}

export async function replaceTaskIssueLinks(taskId: string, issues: Issue[]): Promise<TaskRow[]> {
  const unique = await upsertIssueRecords(issues);

  await db.delete(taskIssueLinks).where(eq(taskIssueLinks.taskId, taskId));

  if (unique.length > 0) {
    await db
      .insert(taskIssueLinks)
      .values(unique.map((issue) => ({ taskId, issueUrl: issue.url })))
      .onConflictDoNothing();
  }

  return db
    .update(tasks)
    .set({
      linkedIssue: unique[0] ? JSON.stringify(unique[0]) : null,
    })
    .where(eq(tasks.id, taskId))
    .returning();
}

export async function getIssuesForTasks(taskIds: string[]): Promise<Map<string, Issue[]>> {
  const map = new Map<string, Issue[]>();
  if (taskIds.length === 0) return map;

  const rows = await db
    .select({
      taskId: taskIssueLinks.taskId,
      issue: issueRecords,
    })
    .from(taskIssueLinks)
    .innerJoin(issueRecords, eq(taskIssueLinks.issueUrl, issueRecords.url))
    .where(inArray(taskIssueLinks.taskId, taskIds))
    .orderBy(asc(taskIssueLinks.createdAt));

  for (const row of rows) {
    const issues = map.get(row.taskId) ?? [];
    issues.push(rowToIssue(row.issue));
    map.set(row.taskId, issues);
  }

  return map;
}
