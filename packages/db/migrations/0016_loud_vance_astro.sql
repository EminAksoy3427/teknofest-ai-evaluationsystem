CREATE TABLE `contestant_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`source_reviewer_evaluation_id` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`summary` text,
	`strengths_json` text DEFAULT '[]' NOT NULL,
	`improvements_json` text DEFAULT '[]' NOT NULL,
	`recommendations_json` text DEFAULT '[]' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`published_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`published_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`,`source_reviewer_evaluation_id`) REFERENCES `reviewer_evaluation`(`submission_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "contestant_feedback_status_check" CHECK("contestant_feedback"."status" in ('DRAFT', 'PUBLISHED')),
	CONSTRAINT "contestant_feedback_publication_check" CHECK(("contestant_feedback"."status" = 'PUBLISHED' and "contestant_feedback"."published_at" is not null and "contestant_feedback"."published_by_user_id" is not null) or ("contestant_feedback"."status" = 'DRAFT' and "contestant_feedback"."published_at" is null and "contestant_feedback"."published_by_user_id" is null)),
	CONSTRAINT "contestant_feedback_summary_length_check" CHECK("contestant_feedback"."summary" is null or length("contestant_feedback"."summary") between 1 and 2000),
	CONSTRAINT "contestant_feedback_strengths_json_check" CHECK(json_valid("contestant_feedback"."strengths_json")),
	CONSTRAINT "contestant_feedback_improvements_json_check" CHECK(json_valid("contestant_feedback"."improvements_json")),
	CONSTRAINT "contestant_feedback_recommendations_json_check" CHECK(json_valid("contestant_feedback"."recommendations_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contestant_feedback_submission_unique` ON `contestant_feedback` (`submission_id`);--> statement-breakpoint
CREATE INDEX `contestant_feedback_competition_id_index` ON `contestant_feedback` (`competition_id`);--> statement-breakpoint
CREATE TABLE `submission_participant` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competition_id`,`submission_id`) REFERENCES `submission`(`competition_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competition_id`,`user_id`) REFERENCES `competition_member`(`competition_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_participant_submission_user_unique` ON `submission_participant` (`submission_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `submission_participant_competition_id_index` ON `submission_participant` (`competition_id`);--> statement-breakpoint
CREATE INDEX `submission_participant_submission_id_index` ON `submission_participant` (`submission_id`);--> statement-breakpoint
CREATE INDEX `submission_participant_user_id_index` ON `submission_participant` (`user_id`);--> statement-breakpoint
ALTER TABLE `template_version` ADD `original_filename` text;--> statement-breakpoint
ALTER TABLE `template_version` ADD `mime_type` text;--> statement-breakpoint
ALTER TABLE `template_version` ADD `size_bytes` integer;--> statement-breakpoint
ALTER TABLE `template_version` ADD `etag` text;--> statement-breakpoint
ALTER TABLE `template_version` ADD `file_uploaded_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_evaluation_submission_scope_unique` ON `reviewer_evaluation` (`submission_id`,`id`);