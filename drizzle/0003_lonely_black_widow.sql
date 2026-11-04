PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_draw` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`name` text NOT NULL,
	`budget` real,
	`currency` text,
	`budget_eur` real,
	`budget_pln` real,
	`budget_jpy` real,
	`deliver_whatsapp` integer DEFAULT false NOT NULL,
	`deliver_signal` integer DEFAULT false NOT NULL,
	`deliver_email` integer DEFAULT false NOT NULL,
	`allow_self_draw` integer DEFAULT false NOT NULL,
	`avoid_past_pairings` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`executed_at` integer,
	`duration_ms` integer,
	`attempts` integer,
	`history_layers` integer,
	`layers_dropped` integer,
	`relaxed_restrictions` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_draw`("id", "event_id", "name", "budget", "currency", "budget_eur", "budget_pln", "budget_jpy", "deliver_whatsapp", "deliver_signal", "deliver_email", "allow_self_draw", "avoid_past_pairings", "status", "executed_at", "duration_ms", "attempts", "history_layers", "layers_dropped", "relaxed_restrictions", "created_at") SELECT "id", "event_id", "name", "budget", "currency", "budget_eur", "budget_pln", "budget_jpy", "deliver_whatsapp", "deliver_signal", "deliver_email", "allow_self_draw", "avoid_past_pairings", "status", "executed_at", "duration_ms", "attempts", "history_layers", "layers_dropped", "relaxed_restrictions", "created_at" FROM `draw`;--> statement-breakpoint
DROP TABLE `draw`;--> statement-breakpoint
ALTER TABLE `__new_draw` RENAME TO `draw`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `draw_event_created_idx` ON `draw` (`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`name_pl` text,
	`name_dopelniacz` text,
	`name_celownik` text,
	`name_biernik` text,
	`name_narzednik` text,
	`name_miejscownik` text,
	`name_wolacz` text,
	`occurs_on` text NOT NULL,
	`budget` real,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`budget_eur` real,
	`budget_pln` real,
	`budget_jpy` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `event_series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_event`("id", "series_id", "code", "name", "name_pl", "name_dopelniacz", "name_celownik", "name_biernik", "name_narzednik", "name_miejscownik", "name_wolacz", "occurs_on", "budget", "currency", "budget_eur", "budget_pln", "budget_jpy", "created_at") SELECT "id", "series_id", "code", "name", "name_pl", "name_dopelniacz", "name_celownik", "name_biernik", "name_narzednik", "name_miejscownik", "name_wolacz", "occurs_on", "budget", "currency", "budget_eur", "budget_pln", "budget_jpy", "created_at" FROM `event`;--> statement-breakpoint
DROP TABLE `event`;--> statement-breakpoint
ALTER TABLE `__new_event` RENAME TO `event`;--> statement-breakpoint
CREATE UNIQUE INDEX `event_code_unique` ON `event` (`code`);--> statement-breakpoint
CREATE INDEX `event_series_id_idx` ON `event` (`series_id`);