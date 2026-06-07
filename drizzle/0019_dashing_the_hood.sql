CREATE TABLE `task_naming_snapshots` (
	`task_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`model` text,
	`context_json` text,
	`generated_task_name` text,
	`generated_branch_name` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `setup_status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `setup_error` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `setup_data` text;--> statement-breakpoint
CREATE INDEX `idx_task_naming_snapshots_project_id` ON `task_naming_snapshots` (`project_id`);