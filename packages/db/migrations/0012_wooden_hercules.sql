CREATE TABLE `rubric_suggestion` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_run_id` text NOT NULL,
	`rubric_version_id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`suggested_score` integer NOT NULL,
	`reason` text NOT NULL,
	`evidence_strength` text NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`missing_points_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criterion_id`) REFERENCES `criterion`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`analysis_run_id`,`rubric_version_id`) REFERENCES `analysis_run`(`id`,`rubric_version_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rubric_version_id`,`criterion_id`) REFERENCES `criterion`(`rubric_version_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "rubric_suggestion_score_check" CHECK("rubric_suggestion"."suggested_score" >= 0),
	CONSTRAINT "rubric_suggestion_reason_length_check" CHECK(length("rubric_suggestion"."reason") between 1 and 600),
	CONSTRAINT "rubric_suggestion_evidence_strength_check" CHECK("rubric_suggestion"."evidence_strength" in ('HIGH', 'MEDIUM', 'LOW')),
	CONSTRAINT "rubric_suggestion_evidence_json_check" CHECK(json_valid("rubric_suggestion"."evidence_json")),
	CONSTRAINT "rubric_suggestion_missing_points_json_check" CHECK(json_valid("rubric_suggestion"."missing_points_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rubric_suggestion_run_criterion_unique` ON `rubric_suggestion` (`analysis_run_id`,`criterion_id`);--> statement-breakpoint
CREATE INDEX `rubric_suggestion_analysis_run_id_index` ON `rubric_suggestion` (`analysis_run_id`);--> statement-breakpoint
CREATE INDEX `rubric_suggestion_criterion_id_index` ON `rubric_suggestion` (`criterion_id`);