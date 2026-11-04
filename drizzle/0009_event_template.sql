CREATE TABLE `event_template` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`template_id` text NOT NULL,
	`language` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_template_event_lang_id_unique` ON `event_template` (`event_id`,`language`,`template_id`);
--> statement-breakpoint
CREATE INDEX `event_template_event_id_idx` ON `event_template` (`event_id`);
