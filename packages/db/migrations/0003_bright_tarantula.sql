ALTER TABLE `category` ADD `guidance` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `competition` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `criterion` ADD `evidence_expectation` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `criterion` ADD `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;--> statement-breakpoint
ALTER TABLE `rubric_version` ADD `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;--> statement-breakpoint
ALTER TABLE `template_version` ADD `structural_profile` text DEFAULT '{"expectedLanguage":"tr","sections":[]}' NOT NULL;--> statement-breakpoint
ALTER TABLE `template_version` ADD `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;