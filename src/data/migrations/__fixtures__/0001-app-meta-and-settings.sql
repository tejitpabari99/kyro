-- Fixture dump (M1-01 acceptance gate, 08 §5.3): a database at schema
-- version 1 (M0-09's migration 0001 — `app_meta` + `settings` only) with
-- some seeded settings data, committed so the migration-0002 fixture-upgrade
-- test (`../__tests__/0002-full-v1-schema.test.ts`) can seed at N-1 and
-- migrate forward without depending on the *current* migration 0001 SQL
-- file (which must never change once applied, 05 §10) — this fixture is a
-- frozen snapshot of what that migration produces, independent of any
-- future refactor of this repo's migration-generation tooling.
--
-- Statements are separated by the same breakpoint marker migration files use
-- (see `manifest.ts`'s doc comment for the exact token) so the test can
-- reuse the same statement-splitting helper the real runner uses.
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `app_meta` (`key`, `value`) VALUES ('schema_version', '1');
--> statement-breakpoint
INSERT INTO `app_meta` (`key`, `value`) VALUES ('dataset_version', 'seed-fixture-v0');
--> statement-breakpoint
INSERT INTO `settings` (`key`, `value`) VALUES ('weight_unit', '"lbs"');
--> statement-breakpoint
INSERT INTO `settings` (`key`, `value`) VALUES ('theme', '"dark"');
--> statement-breakpoint
INSERT INTO `settings` (`key`, `value`) VALUES ('default_rest_seconds', '120');
--> statement-breakpoint
INSERT INTO `settings` (`key`, `value`) VALUES ('sounds', '{"timer_sound":"bell","timer_volume":"high","set_check_volume":"normal","notification_volume":"low"}');
