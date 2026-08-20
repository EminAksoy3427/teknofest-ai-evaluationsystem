CREATE TABLE `similarity_pair` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`submission_a_id` text NOT NULL,
	`submission_b_id` text NOT NULL,
	`analysis_run_a_id` text NOT NULL,
	`analysis_run_b_id` text NOT NULL,
	`lexical_score` real NOT NULL,
	`semantic_score` real,
	`combined_score` real NOT NULL,
	`mode` text NOT NULL,
	`level` text NOT NULL,
	`exact_document_match` integer DEFAULT false NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competition_id`,`submission_a_id`) REFERENCES `submission`(`competition_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competition_id`,`submission_b_id`) REFERENCES `submission`(`competition_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_a_id`,`analysis_run_a_id`) REFERENCES `analysis_run`(`submission_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_b_id`,`analysis_run_b_id`) REFERENCES `analysis_run`(`submission_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "similarity_pair_canonical_order_check" CHECK("similarity_pair"."submission_a_id" < "similarity_pair"."submission_b_id"),
	CONSTRAINT "similarity_pair_lexical_score_check" CHECK("similarity_pair"."lexical_score" between 0 and 1),
	CONSTRAINT "similarity_pair_semantic_score_check" CHECK("similarity_pair"."semantic_score" is null or "similarity_pair"."semantic_score" between 0 and 1),
	CONSTRAINT "similarity_pair_combined_score_check" CHECK("similarity_pair"."combined_score" between 0 and 1),
	CONSTRAINT "similarity_pair_mode_check" CHECK("similarity_pair"."mode" in ('LEXICAL_ONLY', 'HYBRID')),
	CONSTRAINT "similarity_pair_level_check" CHECK("similarity_pair"."level" in ('LOW', 'MEDIUM', 'HIGH')),
	CONSTRAINT "similarity_pair_mode_semantic_check" CHECK(("similarity_pair"."mode" = 'LEXICAL_ONLY' and "similarity_pair"."semantic_score" is null) or ("similarity_pair"."mode" = 'HYBRID' and "similarity_pair"."semantic_score" is not null)),
	CONSTRAINT "similarity_pair_evidence_json_check" CHECK(json_valid("similarity_pair"."evidence_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `similarity_pair_competition_runs_unique` ON `similarity_pair` (`competition_id`,`analysis_run_a_id`,`analysis_run_b_id`);--> statement-breakpoint
CREATE INDEX `similarity_pair_competition_submissions_index` ON `similarity_pair` (`competition_id`,`submission_a_id`,`submission_b_id`);--> statement-breakpoint
CREATE INDEX `similarity_pair_submission_a_index` ON `similarity_pair` (`competition_id`,`submission_a_id`);--> statement-breakpoint
CREATE INDEX `similarity_pair_submission_b_index` ON `similarity_pair` (`competition_id`,`submission_b_id`);--> statement-breakpoint
CREATE INDEX `similarity_pair_run_b_index` ON `similarity_pair` (`competition_id`,`analysis_run_b_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_analysis_run` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`category_id` text NOT NULL,
	`template_version_id` text NOT NULL,
	`rubric_version_id` text NOT NULL,
	`source_sha256` text NOT NULL,
	`ai_provider` text,
	`model_id` text,
	`prompt_bundle_version` text,
	`category_snapshot` text,
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
	CONSTRAINT "analysis_run_stage_check" CHECK("__new_analysis_run"."stage" in ('INGEST_AND_EXTRACT', 'STRUCTURAL_CHECKS', 'SEMANTIC_CHECKS', 'SIMILARITY_CHECKS')),
	CONSTRAINT "analysis_run_source_sha256_check" CHECK(length("__new_analysis_run"."source_sha256") = 64 and "__new_analysis_run"."source_sha256" = lower("__new_analysis_run"."source_sha256")),
	CONSTRAINT "analysis_run_page_count_check" CHECK("__new_analysis_run"."page_count" is null or "__new_analysis_run"."page_count" > 0),
	CONSTRAINT "analysis_run_character_count_check" CHECK("__new_analysis_run"."character_count" is null or "__new_analysis_run"."character_count" >= 0),
	CONSTRAINT "analysis_run_warnings_json_check" CHECK(json_valid("__new_analysis_run"."extraction_warnings")),
	CONSTRAINT "analysis_run_ai_snapshot_check" CHECK(("__new_analysis_run"."ai_provider" is null and "__new_analysis_run"."model_id" is null and "__new_analysis_run"."prompt_bundle_version" is null and "__new_analysis_run"."category_snapshot" is null) or ("__new_analysis_run"."ai_provider" is not null and "__new_analysis_run"."model_id" is not null and "__new_analysis_run"."prompt_bundle_version" is not null and "__new_analysis_run"."category_snapshot" is not null and json_valid("__new_analysis_run"."category_snapshot"))),
	CONSTRAINT "analysis_run_completion_check" CHECK(("__new_analysis_run"."status" not in ('SUCCEEDED', 'FAILED')) or "__new_analysis_run"."completed_at" is not null),
	CONSTRAINT "analysis_run_success_artifact_check" CHECK("__new_analysis_run"."status" <> 'SUCCEEDED' or ("__new_analysis_run"."document_artifact_key" is not null and "__new_analysis_run"."page_count" is not null and "__new_analysis_run"."character_count" is not null)),
	CONSTRAINT "analysis_run_failure_error_check" CHECK("__new_analysis_run"."status" <> 'FAILED' or ("__new_analysis_run"."error_code" is not null and "__new_analysis_run"."error_message" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_analysis_run`("id", "submission_id", "category_id", "template_version_id", "rubric_version_id", "source_sha256", "ai_provider", "model_id", "prompt_bundle_version", "category_snapshot", "status", "stage", "workflow_instance_id", "document_artifact_key", "page_count", "character_count", "extraction_warnings", "error_code", "error_message", "created_at", "started_at", "completed_at") SELECT "id", "submission_id", "category_id", "template_version_id", "rubric_version_id", "source_sha256", "ai_provider", "model_id", "prompt_bundle_version", "category_snapshot", "status", "stage", "workflow_instance_id", "document_artifact_key", "page_count", "character_count", "extraction_warnings", "error_code", "error_message", "created_at", "started_at", "completed_at" FROM `analysis_run`;--> statement-breakpoint
DROP TABLE `analysis_run`;--> statement-breakpoint
ALTER TABLE `__new_analysis_run` RENAME TO `analysis_run`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `analysis_run_submission_created_index` ON `analysis_run` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `analysis_run_category_id_index` ON `analysis_run` (`category_id`);--> statement-breakpoint
CREATE INDEX `analysis_run_template_version_id_index` ON `analysis_run` (`template_version_id`);--> statement-breakpoint
CREATE INDEX `analysis_run_rubric_version_id_index` ON `analysis_run` (`rubric_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_workflow_instance_unique` ON `analysis_run` (`workflow_instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_submission_scope_unique` ON `analysis_run` (`submission_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_one_in_flight_per_submission` ON `analysis_run` (`submission_id`) WHERE "analysis_run"."status" in ('QUEUED', 'PROCESSING');--> statement-breakpoint
CREATE UNIQUE INDEX `submission_competition_scope_unique` ON `submission` (`competition_id`,`id`);