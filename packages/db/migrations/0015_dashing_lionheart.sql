CREATE TABLE `reviewer_criterion_score` (
	`id` text PRIMARY KEY NOT NULL,
	`reviewer_evaluation_id` text NOT NULL,
	`rubric_version_id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`score` integer NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`reviewer_evaluation_id`) REFERENCES `reviewer_evaluation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criterion_id`) REFERENCES `criterion`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_evaluation_id`,`rubric_version_id`) REFERENCES `reviewer_evaluation`(`id`,`rubric_version_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rubric_version_id`,`criterion_id`) REFERENCES `criterion`(`rubric_version_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reviewer_criterion_score_score_check" CHECK("reviewer_criterion_score"."score" >= 0),
	CONSTRAINT "reviewer_criterion_score_note_length_check" CHECK("reviewer_criterion_score"."note" is null or length("reviewer_criterion_score"."note") between 1 and 600)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_criterion_score_evaluation_criterion_unique` ON `reviewer_criterion_score` (`reviewer_evaluation_id`,`criterion_id`);--> statement-breakpoint
CREATE INDEX `reviewer_criterion_score_evaluation_id_index` ON `reviewer_criterion_score` (`reviewer_evaluation_id`);--> statement-breakpoint
CREATE INDEX `reviewer_criterion_score_criterion_id_index` ON `reviewer_criterion_score` (`criterion_id`);