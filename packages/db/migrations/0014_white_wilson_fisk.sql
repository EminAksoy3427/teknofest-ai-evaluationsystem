CREATE TABLE `reviewer_evaluation` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`analysis_run_id` text NOT NULL,
	`rubric_version_id` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`overall_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`submitted_at` integer,
	FOREIGN KEY (`assignment_id`) REFERENCES `reviewer_assignment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`,`submission_id`) REFERENCES `reviewer_assignment`(`id`,`submission_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`,`analysis_run_id`) REFERENCES `analysis_run`(`submission_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_run_id`,`rubric_version_id`) REFERENCES `analysis_run`(`id`,`rubric_version_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reviewer_evaluation_status_check" CHECK("reviewer_evaluation"."status" in ('DRAFT', 'SUBMITTED')),
	CONSTRAINT "reviewer_evaluation_submitted_at_check" CHECK(("reviewer_evaluation"."status" = 'SUBMITTED' and "reviewer_evaluation"."submitted_at" is not null) or ("reviewer_evaluation"."status" = 'DRAFT' and "reviewer_evaluation"."submitted_at" is null)),
	CONSTRAINT "reviewer_evaluation_overall_note_length_check" CHECK("reviewer_evaluation"."overall_note" is null or length("reviewer_evaluation"."overall_note") between 1 and 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_evaluation_assignment_unique` ON `reviewer_evaluation` (`assignment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_evaluation_rubric_version_scope_unique` ON `reviewer_evaluation` (`id`,`rubric_version_id`);--> statement-breakpoint
CREATE INDEX `reviewer_evaluation_analysis_run_id_index` ON `reviewer_evaluation` (`analysis_run_id`);