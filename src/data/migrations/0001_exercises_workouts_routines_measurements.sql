CREATE TABLE `body_measurements` (
	`date` text PRIMARY KEY NOT NULL,
	`weight_kg` real,
	`fat_percent` real,
	`lean_mass_kg` real,
	`neck_cm` real,
	`shoulders_cm` real,
	`chest_cm` real,
	`left_bicep_cm` real,
	`right_bicep_cm` real,
	`left_forearm_cm` real,
	`right_forearm_cm` real,
	`abdomen_cm` real,
	`waist_cm` real,
	`hips_cm` real,
	`left_thigh_cm` real,
	`right_thigh_cm` real,
	`left_calf_cm` real,
	`right_calf_cm` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`exercise_type` text NOT NULL,
	`primary_muscle_group` text NOT NULL,
	`secondary_muscle_groups` text DEFAULT '[]' NOT NULL,
	`equipment` text DEFAULT 'none' NOT NULL,
	`instructions` text DEFAULT '[]' NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`animation_uri` text,
	`is_custom` integer DEFAULT 0 NOT NULL,
	`uses_custom_metric` integer DEFAULT 0 NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "exercises_exercise_type_check" CHECK("exercises"."exercise_type" IN ('weight_reps', 'reps_only', 'bodyweight_reps', 'bodyweight_assisted_reps', 'duration', 'weight_duration', 'distance_duration', 'short_distance_weight')),
	CONSTRAINT "exercises_primary_muscle_group_check" CHECK("exercises"."primary_muscle_group" IN ('abdominals', 'shoulders', 'biceps', 'triceps', 'forearms', 'quadriceps', 'hamstrings', 'calves', 'glutes', 'abductors', 'adductors', 'lats', 'upper_back', 'traps', 'lower_back', 'chest', 'cardio', 'neck', 'full_body', 'other')),
	CONSTRAINT "exercises_equipment_check" CHECK("exercises"."equipment" IN ('none', 'barbell', 'dumbbell', 'kettlebell', 'machine', 'plate', 'resistance_band', 'suspension', 'other'))
);
--> statement-breakpoint
CREATE INDEX `idx_exercises_name` ON `exercises` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_exercises_name_active` ON `exercises` ("name" COLLATE NOCASE) WHERE "exercises"."archived_at" IS NULL;--> statement-breakpoint
CREATE TABLE `progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`file_name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`date`) REFERENCES `body_measurements`(`date`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_photos_date` ON `progress_photos` (`date`);--> statement-breakpoint
CREATE TABLE `routine_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`superset_id` integer,
	`notes` text,
	`rest_seconds` integer,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_re_routine` ON `routine_exercises` (`routine_id`,`position`);--> statement-breakpoint
CREATE TABLE `routine_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`collapsed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`set_type` text DEFAULT 'normal' NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`rep_range_start` integer,
	`rep_range_end` integer,
	`distance_meters` real,
	`duration_seconds` integer,
	`custom_metric` real,
	FOREIGN KEY (`routine_exercise_id`) REFERENCES `routine_exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "routine_sets_set_type_check" CHECK("routine_sets"."set_type" IN ('normal', 'warmup', 'failure', 'dropset')),
	CONSTRAINT "routine_sets_reps_xor_range_check" CHECK(NOT ("routine_sets"."reps" IS NOT NULL AND "routine_sets"."rep_range_start" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`folder_id` integer,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `routine_folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`set_type` text DEFAULT 'normal' NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`distance_meters` real,
	`duration_seconds` integer,
	`rpe` real,
	`custom_metric` real,
	`is_completed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sets_set_type_check" CHECK("sets"."set_type" IN ('normal', 'warmup', 'failure', 'dropset')),
	CONSTRAINT "sets_rpe_check" CHECK("sets"."rpe" IS NULL OR "sets"."rpe" IN (6, 7, 7.5, 8, 8.5, 9, 9.5, 10))
);
--> statement-breakpoint
CREATE INDEX `idx_sets_we` ON `sets` (`workout_exercise_id`,`position`);--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`superset_id` integer,
	`notes` text,
	`rest_seconds` integer,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_we_workout` ON `workout_exercises` (`workout_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_we_exercise` ON `workout_exercises` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`routine_id` text,
	`state` text DEFAULT 'completed' NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer,
	`duration_pause_offset_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "workouts_state_check" CHECK("workouts"."state" IN ('active', 'completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_one_active_workout` ON `workouts` (`state`) WHERE "workouts"."state" = 'active' AND "workouts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_workouts_start` ON `workouts` ("start_time" DESC) WHERE "workouts"."deleted_at" IS NULL;