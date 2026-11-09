CREATE TABLE `event_photo` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` integer NOT NULL,
	`original_name` text NOT NULL,
	`mime` text NOT NULL,
	`ext` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`captured_at` integer NOT NULL,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_photo_event_id_idx` ON `event_photo` (`event_id`);
--> statement-breakpoint
CREATE INDEX `event_photo_event_captured_idx` ON `event_photo` (`event_id`,`captured_at`);
--> statement-breakpoint
CREATE TABLE `event_photo_variant` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`photo_id` text NOT NULL,
	`variant` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`duration_ms` integer,
	`bytes` integer,
	FOREIGN KEY (`photo_id`) REFERENCES `event_photo`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_photo_variant_photo_variant_unique` ON `event_photo_variant` (`photo_id`,`variant`);
--> statement-breakpoint
CREATE INDEX `event_photo_variant_status_idx` ON `event_photo_variant` (`status`,`variant`);
