ALTER TABLE `event` ADD `budget_kind` text;
--> statement-breakpoint
ALTER TABLE `draw` ADD `budget_kind` text;
--> statement-breakpoint
UPDATE `event` SET `budget_kind` = 'amount' WHERE `budget` IS NOT NULL AND `budget` > 0;
--> statement-breakpoint
UPDATE `draw` SET `budget_kind` = 'amount' WHERE `budget` IS NOT NULL AND `budget` > 0;
