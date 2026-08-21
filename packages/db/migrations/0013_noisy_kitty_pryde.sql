CREATE TABLE `reviewer_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`assigned_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competition_id`,`submission_id`) REFERENCES `submission`(`competition_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competition_id`,`reviewer_user_id`) REFERENCES `competition_member`(`competition_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_assignment_submission_reviewer_unique` ON `reviewer_assignment` (`submission_id`,`reviewer_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_assignment_submission_scope_unique` ON `reviewer_assignment` (`id`,`submission_id`);--> statement-breakpoint
CREATE INDEX `reviewer_assignment_competition_id_index` ON `reviewer_assignment` (`competition_id`);--> statement-breakpoint
CREATE INDEX `reviewer_assignment_competition_reviewer_index` ON `reviewer_assignment` (`competition_id`,`reviewer_user_id`);--> statement-breakpoint
CREATE INDEX `reviewer_assignment_submission_id_index` ON `reviewer_assignment` (`submission_id`);