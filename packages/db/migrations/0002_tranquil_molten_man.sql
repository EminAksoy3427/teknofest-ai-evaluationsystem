CREATE TABLE `competition_member` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "competition_member_role_check" CHECK("competition_member"."role" in ('COMPETITION_MANAGER', 'REVIEWER', 'CONTESTANT', 'EVALUATION_MANAGER'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_member_competition_user_unique` ON `competition_member` (`competition_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `competition_member_competition_id_index` ON `competition_member` (`competition_id`);--> statement-breakpoint
CREATE INDEX `competition_member_user_id_index` ON `competition_member` (`user_id`);--> statement-breakpoint
CREATE INDEX `competition_member_competition_role_index` ON `competition_member` (`competition_id`,`role`);