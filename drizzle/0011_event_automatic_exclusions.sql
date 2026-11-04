ALTER TABLE `event` ADD `allow_self_draw` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `event` ADD `avoid_past_pairings` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `event`
SET
  `allow_self_draw` = (
    SELECT `allow_self_draw` FROM `draw`
    WHERE `draw`.`event_id` = `event`.`id`
    ORDER BY `draw`.`created_at` DESC, `draw`.`id` DESC
    LIMIT 1
  ),
  `avoid_past_pairings` = (
    SELECT `avoid_past_pairings` FROM `draw`
    WHERE `draw`.`event_id` = `event`.`id`
    ORDER BY `draw`.`created_at` DESC, `draw`.`id` DESC
    LIMIT 1
  )
WHERE EXISTS (
  SELECT 1 FROM `draw` WHERE `draw`.`event_id` = `event`.`id`
);
--> statement-breakpoint
UPDATE `event`
SET `avoid_past_pairings` = 1
WHERE `id` IN (
  SELECT `id` FROM (
    SELECT `e`.`id` AS `id` FROM `event` AS `e`
    WHERE NOT EXISTS (
      SELECT 1 FROM `draw` WHERE `draw`.`event_id` = `e`.`id`
    )
    AND EXISTS (
      SELECT 1 FROM `event` AS `earlier`
      WHERE `earlier`.`series_id` = `e`.`series_id`
      AND `earlier`.`id` != `e`.`id`
      AND `earlier`.`occurs_on` < `e`.`occurs_on`
    )
  )
);
