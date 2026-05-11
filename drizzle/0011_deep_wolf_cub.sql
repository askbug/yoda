ALTER TABLE `projects` ADD `archived_at` text;--> statement-breakpoint
CREATE INDEX `idx_projects_archived_at` ON `projects` (`archived_at`);