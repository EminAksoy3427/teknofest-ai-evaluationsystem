CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "category_sort_order_check" CHECK("category"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_competition_code_unique` ON `category` (`competition_id`,`code`);--> statement-breakpoint
CREATE INDEX `category_competition_id_index` ON `category` (`competition_id`);--> statement-breakpoint
CREATE TABLE `competition` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`expected_language` text DEFAULT 'tr' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "competition_status_check" CHECK("competition"."status" in ('DRAFT', 'ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_slug_unique` ON `competition` (`slug`);--> statement-breakpoint
CREATE TABLE `criterion` (
	`id` text PRIMARY KEY NOT NULL,
	`rubric_version_id` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`max_score` integer NOT NULL,
	`weight_basis_points` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`rubric_version_id`) REFERENCES `rubric_version`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "criterion_max_score_check" CHECK("criterion"."max_score" > 0),
	CONSTRAINT "criterion_weight_basis_points_check" CHECK("criterion"."weight_basis_points" >= 0 and "criterion"."weight_basis_points" <= 10000),
	CONSTRAINT "criterion_sort_order_check" CHECK("criterion"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `criterion_rubric_code_unique` ON `criterion` (`rubric_version_id`,`code`);--> statement-breakpoint
CREATE INDEX `criterion_rubric_version_id_index` ON `criterion` (`rubric_version_id`);--> statement-breakpoint
CREATE TABLE `rubric_version` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rubric_version_number_check" CHECK("rubric_version"."version_number" > 0),
	CONSTRAINT "rubric_version_status_check" CHECK("rubric_version"."status" in ('DRAFT', 'ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rubric_version_competition_version_unique` ON `rubric_version` (`competition_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `rubric_version_competition_id_index` ON `rubric_version` (`competition_id`);--> statement-breakpoint
CREATE TABLE `template_version` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`storage_key` text,
	`sha256` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "template_version_number_check" CHECK("template_version"."version_number" > 0),
	CONSTRAINT "template_version_status_check" CHECK("template_version"."status" in ('DRAFT', 'ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_version_competition_version_unique` ON `template_version` (`competition_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `template_version_competition_id_index` ON `template_version` (`competition_id`);