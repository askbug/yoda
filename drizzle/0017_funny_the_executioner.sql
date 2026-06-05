CREATE TABLE `issues` (
	`url` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`identifier` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`branch_name` text,
	`status` text,
	`assignees` text,
	`project` text,
	`updated_at` text,
	`fetched_at` text
);
--> statement-breakpoint
CREATE TABLE `task_issues` (
	`task_id` text NOT NULL,
	`issue_url` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`task_id`, `issue_url`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issue_url`) REFERENCES `issues`(`url`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_issues_provider` ON `issues` (`provider`);--> statement-breakpoint
CREATE INDEX `idx_issues_identifier` ON `issues` (`identifier`);--> statement-breakpoint
CREATE INDEX `idx_task_issues_issue_url` ON `task_issues` (`issue_url`);