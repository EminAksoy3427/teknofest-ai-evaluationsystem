CREATE TABLE `analysis_check` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_run_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`details_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_run`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "analysis_check_status_check" CHECK("analysis_check"."status" in ('PASS', 'WARN', 'FAIL')),
	CONSTRAINT "analysis_check_summary_length_check" CHECK(length("analysis_check"."summary") between 1 and 500),
	CONSTRAINT "analysis_check_details_json_check" CHECK(json_valid("analysis_check"."details_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_check_run_type_unique` ON `analysis_check` (`analysis_run_id`,`type`);--> statement-breakpoint
CREATE INDEX `analysis_check_run_id_index` ON `analysis_check` (`analysis_run_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_analysis_run` (
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
	CONSTRAINT "analysis_run_status_check" CHECK("__new_analysis_run"."status" in ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
	CONSTRAINT "analysis_run_stage_check" CHECK("__new_analysis_run"."stage" in ('INGEST_AND_EXTRACT', 'STRUCTURAL_CHECKS')),
	CONSTRAINT "analysis_run_source_sha256_check" CHECK(length("__new_analysis_run"."source_sha256") = 64 and "__new_analysis_run"."source_sha256" = lower("__new_analysis_run"."source_sha256")),
	CONSTRAINT "analysis_run_page_count_check" CHECK("__new_analysis_run"."page_count" is null or "__new_analysis_run"."page_count" > 0),
	CONSTRAINT "analysis_run_character_count_check" CHECK("__new_analysis_run"."character_count" is null or "__new_analysis_run"."character_count" >= 0),
	CONSTRAINT "analysis_run_warnings_json_check" CHECK(json_valid("__new_analysis_run"."extraction_warnings")),
	CONSTRAINT "analysis_run_completion_check" CHECK(("__new_analysis_run"."status" not in ('SUCCEEDED', 'FAILED')) or "__new_analysis_run"."completed_at" is not null),
	CONSTRAINT "analysis_run_success_artifact_check" CHECK("__new_analysis_run"."status" <> 'SUCCEEDED' or ("__new_analysis_run"."document_artifact_key" is not null and "__new_analysis_run"."page_count" is not null and "__new_analysis_run"."character_count" is not null)),
	CONSTRAINT "analysis_run_failure_error_check" CHECK("__new_analysis_run"."status" <> 'FAILED' or ("__new_analysis_run"."error_code" is not null and "__new_analysis_run"."error_message" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_analysis_run`("id", "submission_id", "category_id", "template_version_id", "rubric_version_id", "source_sha256", "status", "stage", "workflow_instance_id", "document_artifact_key", "page_count", "character_count", "extraction_warnings", "error_code", "error_message", "created_at", "started_at", "completed_at") SELECT "id", "submission_id", "category_id", "template_version_id", "rubric_version_id", "source_sha256", "status", "stage", "workflow_instance_id", "document_artifact_key", "page_count", "character_count", "extraction_warnings", "error_code", "error_message", "created_at", "started_at", "completed_at" FROM `analysis_run`;--> statement-breakpoint
DROP TABLE `analysis_run`;--> statement-breakpoint
ALTER TABLE `__new_analysis_run` RENAME TO `analysis_run`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `analysis_run_submission_created_index` ON `analysis_run` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `analysis_run_category_id_index` ON `analysis_run` (`category_id`);--> statement-breakpoint
CREATE INDEX `analysis_run_template_version_id_index` ON `analysis_run` (`template_version_id`);--> statement-breakpoint
CREATE INDEX `analysis_run_rubric_version_id_index` ON `analysis_run` (`rubric_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_workflow_instance_unique` ON `analysis_run` (`workflow_instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_one_in_flight_per_submission` ON `analysis_run` (`submission_id`) WHERE "analysis_run"."status" in ('QUEUED', 'PROCESSING');