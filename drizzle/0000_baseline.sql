CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment" (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draw_id` integer NOT NULL,
	`giver_id` integer NOT NULL,
	`receiver_id` integer NOT NULL,
	`reveal_token` text NOT NULL,
	`reveal_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL, `opened_at` integer, `wishlist_seen_at` integer, `delivered_whatsapp` integer DEFAULT false NOT NULL, `delivered_signal` integer DEFAULT false NOT NULL, `delivered_email` integer DEFAULT false NOT NULL, `delivered_manual` integer DEFAULT false NOT NULL, `email_failed` integer DEFAULT false NOT NULL, `email_failed_reason` text,
	FOREIGN KEY (`draw_id`) REFERENCES `draw`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`giver_id`) REFERENCES `guest`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`receiver_id`) REFERENCES `guest`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "draw" (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`name` text NOT NULL,
	`budget` integer,
	`deliver_whatsapp` integer DEFAULT false NOT NULL,
	`deliver_signal` integer DEFAULT false NOT NULL,
	`deliver_email` integer DEFAULT false NOT NULL,
	`allow_self_draw` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`executed_at` integer,
	`created_at` integer NOT NULL, `avoid_past_pairings` integer DEFAULT false NOT NULL, `currency` text, `duration_ms` integer, `attempts` integer, `relaxed_restrictions` integer DEFAULT false NOT NULL, `history_layers` integer, `layers_dropped` integer,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`code` text NOT NULL,
	`occurs_on` text NOT NULL,
	`created_at` integer NOT NULL, `name` text NOT NULL DEFAULT '', `budget` integer, `currency` text NOT NULL DEFAULT 'EUR', `name_en` text, `name_pl` text, `name_dopelniacz` text, `name_celownik` text, `name_biernik` text, `name_narzednik` text, `name_miejscownik` text, `name_wolacz` text,
	FOREIGN KEY (`series_id`) REFERENCES `event_series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exclusion" (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`a_id` integer NOT NULL,
	`b_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`a_id`) REFERENCES `guest`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`b_id`) REFERENCES `guest`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `guest` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`created_at` integer NOT NULL, `wishlist_updated_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `guest_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignment_id` integer NOT NULL,
	`kind` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`browser` text,
	`os` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invitation_send` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draw_id` integer NOT NULL,
	`assignment_id` integer NOT NULL,
	`batch_id` text NOT NULL,
	`source` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`draw_id`) REFERENCES `draw`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `person` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`user_id` text,
	`created_at` integer NOT NULL, `email` text, `language` text NOT NULL DEFAULT 'pl', `photo` text, `name_dopelniacz` text, `name_celownik` text, `name_biernik` text, `name_narzednik` text, `name_miejscownik` text, `name_wolacz` text, `gender` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text,
	`banned` integer,
	`ban_reason` text,
	`ban_expires` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_item" (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guest_id` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guest`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_draw_giver_unique` ON `assignment` (`draw_id`,`giver_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_draw_receiver_unique` ON `assignment` (`draw_id`,`receiver_id`);
--> statement-breakpoint
CREATE INDEX `assignment_giver_id_idx` ON `assignment` (`giver_id`);
--> statement-breakpoint
CREATE INDEX `assignment_receiver_id_idx` ON `assignment` (`receiver_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_reveal_token_unique` ON `assignment` (`reveal_token`);
--> statement-breakpoint
CREATE INDEX `draw_event_created_idx` ON `draw` (`event_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_code_unique` ON `event` (`code`);
--> statement-breakpoint
CREATE INDEX `event_series_id_idx` ON `event` (`series_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_series_slug_unique` ON `event_series` (`slug`);
--> statement-breakpoint
CREATE INDEX `exclusion_event_id_idx` ON `exclusion` (`event_id`);
--> statement-breakpoint
CREATE INDEX `guest_activity_assignment_idx` ON `guest_activity` (`assignment_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_event_person_unique` ON `guest` (`event_id`,`person_id`);
--> statement-breakpoint
CREATE INDEX `guest_person_id_idx` ON `guest` (`person_id`);
--> statement-breakpoint
CREATE INDEX `invitation_send_assignment_idx` ON `invitation_send` (`assignment_id`);
--> statement-breakpoint
CREATE INDEX `invitation_send_batch_idx` ON `invitation_send` (`batch_id`);
--> statement-breakpoint
CREATE INDEX `invitation_send_draw_idx` ON `invitation_send` (`draw_id`);
--> statement-breakpoint
CREATE INDEX `person_email_idx` ON `person` (`email`);
--> statement-breakpoint
CREATE INDEX `person_phone_idx` ON `person` (`phone`);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_user_unique` ON `person` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscription` (`endpoint`);
--> statement-breakpoint
CREATE INDEX `push_subscription_user_id_idx` ON `push_subscription` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
--> statement-breakpoint
CREATE INDEX `wishlist_item_guest_id_idx` ON `wishlist_item` (`guest_id`);
