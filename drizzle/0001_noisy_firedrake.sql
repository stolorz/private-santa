ALTER TABLE `person` ADD `name_normalized` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `person` SET `name_normalized` = lower(trim(`name`));--> statement-breakpoint
CREATE INDEX `person_name_normalized_idx` ON `person` (`name_normalized`);--> statement-breakpoint
UPDATE `exclusion` SET `a_id` = `b_id`, `b_id` = `a_id` WHERE `a_id` > `b_id`;--> statement-breakpoint
DELETE FROM `exclusion` WHERE EXISTS (
	SELECT 1 FROM `exclusion` AS `other`
	WHERE `other`.`event_id` = `exclusion`.`event_id`
	AND `other`.`a_id` = `exclusion`.`a_id`
	AND `other`.`b_id` = `exclusion`.`b_id`
	AND `other`.`id` < `exclusion`.`id`
);--> statement-breakpoint
CREATE UNIQUE INDEX `exclusion_event_pair_unique` ON `exclusion` (`event_id`,`a_id`,`b_id`);--> statement-breakpoint
CREATE INDEX `exclusion_b_id_idx` ON `exclusion` (`b_id`);
