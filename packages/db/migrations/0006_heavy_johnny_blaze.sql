CREATE TABLE `analysis_run` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`category_id` text NOT NULL,
	`template_version_id` text NOT NULL,
	`rubric_version_id` text NOT NULL,
	`source_sha256` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`stage` text DEFAULT 'INGEST_AND_EXTRACT' NOT NULL,
	`workflow_instance_id` text NOT NULL,
	`document_artifact_key` text,
	`page_count` integer,
	`character_count` integer,
	`extraction_warnings` text DEFAULT '[]' NOT NULL,
	`error_code` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`submission_id`) REFERENCES `submission`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`template_version_id`) REFERENCES `template_version`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rubric_version_id`) REFERENCES `rubric_version`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "analysis_run_status_check" CHECK("analysis_run"."status" in ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
	CONSTRAINT "analysis_run_stage_check" CHECK("analysis_run"."stage" = 'INGEST_AND_EXTRACT'),
	CONSTRAINT "analysis_run_source_sha256_check" CHECK(length("analysis_run"."source_sha256") = 64 and "analysis_run"."source_sha256" = lower("analysis_run"."source_sha256")),
	CONSTRAINT "analysis_run_page_count_check" CHECK("analysis_run"."page_count" is null or "analysis_run"."page_count" > 0),
	CONSTRAINT "analysis_run_character_count_check" CHECK("analysis_run"."character_count" is null or "analysis_run"."character_count" >= 0),
	CONSTRAINT "analysis_run_warnings_json_check" CHECK(json_valid("analysis_run"."extraction_warnings")),
	CONSTRAINT "analysis_run_completion_check" CHECK(("analysis_run"."status" not in ('SUCCEEDED', 'FAILED')) or "analysis_run"."completed_at" is not null),
	CONSTRAINT "analysis_run_success_artifact_check" CHECK("analysis_run"."status" <> 'SUCCEEDED' or ("analysis_run"."document_artifact_key" is not null and "analysis_run"."page_count" is not null and "analysis_run"."character_count" is not null)),
	CONSTRAINT "analysis_run_failure_error_check" CHECK("analysis_run"."status" <> 'FAILED' or ("analysis_run"."error_code" is not null and "analysis_run"."error_message" is not null))
);
--> statement-breakpoint
CREATE INDEX `analysis_run_submission_created_index` ON `analysis_run` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `analysis_run_category_id_index` ON `analysis_run` (`category_id`);--> statement-breakpoint
CREATE INDEX `analysis_run_template_version_id_index` ON `analysis_run` (`template_version_id`);--> statement-breakpoint
CREATE INDEX `analysis_run_rubric_version_id_index` ON `analysis_run` (`rubric_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_workflow_instance_unique` ON `analysis_run` (`workflow_instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_one_in_flight_per_submission` ON `analysis_run` (`submission_id`) WHERE "analysis_run"."status" in ('QUEUED', 'PROCESSING');