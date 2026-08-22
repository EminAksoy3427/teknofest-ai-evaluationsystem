PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_template_version` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`structural_profile` text DEFAULT '{"expectedLanguage":"tr","sections":[]}' NOT NULL,
	`storage_key` text,
	`sha256` text,
	`original_filename` text,
	`mime_type` text,
	`size_bytes` integer,
	`etag` text,
	`file_uploaded_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "template_version_number_check" CHECK("__new_template_version"."version_number" > 0),
	CONSTRAINT "template_version_status_check" CHECK("__new_template_version"."status" in ('DRAFT', 'ACTIVE', 'ARCHIVED', 'RETIRED')),
	CONSTRAINT "template_version_file_size_check" CHECK("__new_template_version"."size_bytes" is null or "__new_template_version"."size_bytes" > 0),
	CONSTRAINT "template_version_file_sha256_check" CHECK("__new_template_version"."sha256" is null or (length("__new_template_version"."sha256") = 64 and "__new_template_version"."sha256" = lower("__new_template_version"."sha256"))),
	CONSTRAINT "template_version_file_mime_check" CHECK("__new_template_version"."mime_type" is null or "__new_template_version"."mime_type" = 'application/pdf'),
	CONSTRAINT "template_version_file_all_or_nothing_check" CHECK(("__new_template_version"."storage_key" is null and "__new_template_version"."sha256" is null and "__new_template_version"."original_filename" is null and "__new_template_version"."mime_type" is null and "__new_template_version"."size_bytes" is null and "__new_template_version"."file_uploaded_at" is null) or ("__new_template_version"."storage_key" is not null and "__new_template_version"."sha256" is not null and "__new_template_version"."original_filename" is not null and "__new_template_version"."mime_type" is not null and "__new_template_version"."size_bytes" is not null and "__new_template_version"."file_uploaded_at" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_template_version`("id", "competition_id", "version_number", "label", "status", "structural_profile", "storage_key", "sha256", "original_filename", "mime_type", "size_bytes", "etag", "file_uploaded_at", "created_at", "updated_at") SELECT "id", "competition_id", "version_number", "label", "status", "structural_profile", "storage_key", "sha256", "original_filename", "mime_type", "size_bytes", "etag", "file_uploaded_at", "created_at", "updated_at" FROM `template_version`;--> statement-breakpoint
DROP TABLE `template_version`;--> statement-breakpoint
ALTER TABLE `__new_template_version` RENAME TO `template_version`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `template_version_competition_version_unique` ON `template_version` (`competition_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `template_version_competition_id_index` ON `template_version` (`competition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `template_version_one_active_per_competition` ON `template_version` (`competition_id`) WHERE "template_version"."status" = 'ACTIVE';