CREATE TABLE `submission_file` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`original_filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`etag` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submission`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "submission_file_size_positive_check" CHECK("submission_file"."size_bytes" > 0),
	CONSTRAINT "submission_file_mime_pdf_check" CHECK("submission_file"."mime_type" = 'application/pdf'),
	CONSTRAINT "submission_file_sha256_check" CHECK(length("submission_file"."sha256") = 64 and "submission_file"."sha256" = lower("submission_file"."sha256"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_file_submission_id_unique` ON `submission_file` (`submission_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `submission_file_storage_key_unique` ON `submission_file` (`storage_key`);--> statement-breakpoint
CREATE INDEX `submission_file_sha256_index` ON `submission_file` (`sha256`);--> statement-breakpoint
CREATE TABLE `submission` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`category_id` text NOT NULL,
	`application_code` text NOT NULL,
	`project_title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_competition_application_code_unique` ON `submission` (`competition_id`,`application_code`);--> statement-breakpoint
CREATE INDEX `submission_competition_id_index` ON `submission` (`competition_id`);--> statement-breakpoint
CREATE INDEX `submission_category_id_index` ON `submission` (`category_id`);