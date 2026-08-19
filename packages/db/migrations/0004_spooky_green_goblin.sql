PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rubric_version` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rubric_version_number_check" CHECK("__new_rubric_version"."version_number" > 0),
	CONSTRAINT "rubric_version_status_check" CHECK("__new_rubric_version"."status" in ('DRAFT', 'ACTIVE', 'ARCHIVED', 'RETIRED'))
);
--> statement-breakpoint
INSERT INTO `__new_rubric_version`("id", "competition_id", "version_number", "label", "status", "created_at", "updated_at") SELECT "id", "competition_id", "version_number", "label", "status", "created_at", "updated_at" FROM `rubric_version`;--> statement-breakpoint
DROP TABLE `rubric_version`;--> statement-breakpoint
ALTER TABLE `__new_rubric_version` RENAME TO `rubric_version`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `rubric_version_competition_version_unique` ON `rubric_version` (`competition_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `rubric_version_competition_id_index` ON `rubric_version` (`competition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rubric_version_one_active_per_competition` ON `rubric_version` (`competition_id`) WHERE "rubric_version"."status" = 'ACTIVE';--> statement-breakpoint
CREATE TABLE `__new_template_version` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`structural_profile` text DEFAULT '{"expectedLanguage":"tr","sections":[]}' NOT NULL,
	`storage_key` text,
	`sha256` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "template_version_number_check" CHECK("__new_template_version"."version_number" > 0),
	CONSTRAINT "template_version_status_check" CHECK("__new_template_version"."status" in ('DRAFT', 'ACTIVE', 'ARCHIVED', 'RETIRED'))
);
--> statement-breakpoint
INSERT INTO `__new_template_version`("id", "competition_id", "version_number", "label", "status", "structural_profile", "storage_key", "sha256", "created_at", "updated_at") SELECT "id", "competition_id", "version_number", "label", "status", "structural_profile", "storage_key", "sha256", "created_at", "updated_at" FROM `template_version`;--> statement-breakpoint
DROP TABLE `template_version`;--> statement-breakpoint
ALTER TABLE `__new_template_version` RENAME TO `template_version`;--> statement-breakpoint
CREATE UNIQUE INDEX `template_version_competition_version_unique` ON `template_version` (`competition_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `template_version_competition_id_index` ON `template_version` (`competition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `template_version_one_active_per_competition` ON `template_version` (`competition_id`) WHERE "template_version"."status" = 'ACTIVE';