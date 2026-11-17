CREATE TABLE "api_usage" (
	"provider" text NOT NULL,
	"month" text NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_pk" PRIMARY KEY("provider","month")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" text NOT NULL,
	"player_id" text NOT NULL,
	"market" text NOT NULL,
	"side" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_pk" PRIMARY KEY("user_id","player_id","market","side")
);
--> statement-breakpoint
CREATE TABLE "filter_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"filter_state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"espn_id" text,
	"season" integer NOT NULL,
	"date" date NOT NULL,
	"tip_at" timestamp with time zone NOT NULL,
	"home_team_id" text NOT NULL,
	"away_team_id" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"spread" double precision,
	"total" double precision,
	CONSTRAINT "games_espn_id_unique" UNIQUE("espn_id")
);
--> statement-breakpoint
CREATE TABLE "injuries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "injuries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"player_id" text NOT NULL,
	"team_id" text,
	"status" text NOT NULL,
	"detail" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"units" integer,
	"error" text,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "player_game_logs" (
	"player_id" text NOT NULL,
	"game_id" text NOT NULL,
	"team_id" text NOT NULL,
	"opp_team_id" text NOT NULL,
	"is_home" boolean NOT NULL,
	"started" boolean DEFAULT false NOT NULL,
	"minutes" double precision DEFAULT 0 NOT NULL,
	"pts" integer DEFAULT 0 NOT NULL,
	"reb" integer DEFAULT 0 NOT NULL,
	"ast" integer DEFAULT 0 NOT NULL,
	"fg3m" integer DEFAULT 0 NOT NULL,
	"stl" integer DEFAULT 0 NOT NULL,
	"blk" integer DEFAULT 0 NOT NULL,
	"tov" integer DEFAULT 0 NOT NULL,
	"fga" integer DEFAULT 0 NOT NULL,
	"fta" integer DEFAULT 0 NOT NULL,
	"usage_proxy" double precision,
	"dnp" boolean DEFAULT false NOT NULL,
	CONSTRAINT "player_game_logs_pk" PRIMARY KEY("player_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"espn_id" text,
	"name" text NOT NULL,
	"team_id" text,
	"position" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "players_espn_id_unique" UNIQUE("espn_id")
);
--> statement-breakpoint
CREATE TABLE "prop_metrics" (
	"prop_key" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"player_id" text NOT NULL,
	"market" text NOT NULL,
	"side" text NOT NULL,
	"line" double precision NOT NULL,
	"player_name" text NOT NULL,
	"position" text NOT NULL,
	"team_id" text NOT NULL,
	"team_abbr" text NOT NULL,
	"opp_team_id" text NOT NULL,
	"opp_abbr" text NOT NULL,
	"is_home" boolean NOT NULL,
	"tip_at" timestamp with time zone NOT NULL,
	"recent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hits_l5" integer DEFAULT 0 NOT NULL,
	"n_l5" integer DEFAULT 0 NOT NULL,
	"rate_l5" double precision,
	"hits_l10" integer DEFAULT 0 NOT NULL,
	"n_l10" integer DEFAULT 0 NOT NULL,
	"rate_l10" double precision,
	"hits_l20" integer DEFAULT 0 NOT NULL,
	"n_l20" integer DEFAULT 0 NOT NULL,
	"rate_l20" double precision,
	"hits_season" integer DEFAULT 0 NOT NULL,
	"n_season" integer DEFAULT 0 NOT NULL,
	"rate_season" double precision,
	"hits_h2h" integer DEFAULT 0 NOT NULL,
	"n_h2h" integer DEFAULT 0 NOT NULL,
	"rate_h2h" double precision,
	"hits_last_season" integer DEFAULT 0 NOT NULL,
	"n_last_season" integer DEFAULT 0 NOT NULL,
	"rate_last_season" double precision,
	"avg" double precision,
	"median" double precision,
	"edge_avg" double precision,
	"edge_median" double precision,
	"streak" integer DEFAULT 0 NOT NULL,
	"best_price" integer,
	"best_book" text,
	"implied_prob_novig" double precision,
	"value" double precision,
	"dvp_rank" integer,
	"dvp_tier" text,
	"rest_days" integer,
	"is_b2b" boolean DEFAULT false NOT NULL,
	"minutes_l5" double precision,
	"usage_l10" double precision,
	"is_starter" boolean DEFAULT false NOT NULL,
	"injury_status" text,
	"teammate_out" boolean DEFAULT false NOT NULL,
	"teammates_out" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"line_open" double precision,
	"line_move" double precision,
	"game_total" double precision,
	"game_spread" double precision,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prop_offers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "prop_offers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"game_id" text NOT NULL,
	"player_id" text NOT NULL,
	"market" text NOT NULL,
	"line" double precision NOT NULL,
	"over_price" integer,
	"under_price" integer,
	"book" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_closing" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_aliases" (
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_aliases_pk" PRIMARY KEY("provider","kind","external_id")
);
--> statement-breakpoint
CREATE TABLE "raw_payloads" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "raw_payloads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"body" jsonb
);
--> statement-breakpoint
CREATE TABLE "slip_legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slip_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"player_id" text NOT NULL,
	"market" text NOT NULL,
	"side" text NOT NULL,
	"line" double precision NOT NULL,
	"price" integer NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"graded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "slips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"book" text,
	"stake" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_dvp" (
	"team_id" text NOT NULL,
	"position" text NOT NULL,
	"market" text NOT NULL,
	"window" text NOT NULL,
	"allowed_per_game" double precision NOT NULL,
	"rank" integer NOT NULL,
	"tier" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_dvp_pk" PRIMARY KEY("team_id","position","market","window")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"abbr" text NOT NULL,
	"name" text NOT NULL,
	"espn_id" text,
	CONSTRAINT "teams_abbr_unique" UNIQUE("abbr"),
	CONSTRAINT "teams_espn_id_unique" UNIQUE("espn_id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"odds_format" text DEFAULT 'american' NOT NULL,
	"books" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skip_intro" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_presets" ADD CONSTRAINT "filter_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_logs" ADD CONSTRAINT "player_game_logs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_logs" ADD CONSTRAINT "player_game_logs_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_logs" ADD CONSTRAINT "player_game_logs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_logs" ADD CONSTRAINT "player_game_logs_opp_team_id_teams_id_fk" FOREIGN KEY ("opp_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_metrics" ADD CONSTRAINT "prop_metrics_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_metrics" ADD CONSTRAINT "prop_metrics_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_offers" ADD CONSTRAINT "prop_offers_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_offers" ADD CONSTRAINT "prop_offers_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slip_legs" ADD CONSTRAINT "slip_legs_slip_id_slips_id_fk" FOREIGN KEY ("slip_id") REFERENCES "public"."slips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slip_legs" ADD CONSTRAINT "slip_legs_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slip_legs" ADD CONSTRAINT "slip_legs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slips" ADD CONSTRAINT "slips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_dvp" ADD CONSTRAINT "team_dvp_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "filter_presets_user_name_uq" ON "filter_presets" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "games_date_idx" ON "games" USING btree ("date");--> statement-breakpoint
CREATE INDEX "games_tip_at_idx" ON "games" USING btree ("tip_at");--> statement-breakpoint
CREATE INDEX "games_home_team_idx" ON "games" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "games_away_team_idx" ON "games" USING btree ("away_team_id");--> statement-breakpoint
CREATE INDEX "injuries_player_captured_idx" ON "injuries" USING btree ("player_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_runs_job_started_idx" ON "job_runs" USING btree ("job","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pgl_game_idx" ON "player_game_logs" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "pgl_team_game_idx" ON "player_game_logs" USING btree ("team_id","game_id");--> statement-breakpoint
CREATE INDEX "pgl_opp_team_idx" ON "player_game_logs" USING btree ("opp_team_id");--> statement-breakpoint
CREATE INDEX "players_team_idx" ON "players" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prop_metrics_natural_uq" ON "prop_metrics" USING btree ("game_id","player_id","market","side");--> statement-breakpoint
CREATE INDEX "prop_metrics_game_idx" ON "prop_metrics" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "prop_metrics_player_idx" ON "prop_metrics" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "prop_metrics_market_idx" ON "prop_metrics" USING btree ("market");--> statement-breakpoint
CREATE INDEX "prop_metrics_tip_at_idx" ON "prop_metrics" USING btree ("tip_at");--> statement-breakpoint
CREATE INDEX "prop_metrics_team_abbr_idx" ON "prop_metrics" USING btree ("team_abbr");--> statement-breakpoint
CREATE INDEX "prop_metrics_rate_l5_idx" ON "prop_metrics" USING btree ("rate_l5");--> statement-breakpoint
CREATE INDEX "prop_metrics_rate_l10_idx" ON "prop_metrics" USING btree ("rate_l10");--> statement-breakpoint
CREATE INDEX "prop_metrics_rate_l20_idx" ON "prop_metrics" USING btree ("rate_l20");--> statement-breakpoint
CREATE INDEX "prop_metrics_rate_season_idx" ON "prop_metrics" USING btree ("rate_season");--> statement-breakpoint
CREATE INDEX "prop_metrics_rate_h2h_idx" ON "prop_metrics" USING btree ("rate_h2h");--> statement-breakpoint
CREATE INDEX "prop_metrics_rate_last_season_idx" ON "prop_metrics" USING btree ("rate_last_season");--> statement-breakpoint
CREATE INDEX "prop_metrics_edge_avg_idx" ON "prop_metrics" USING btree ("edge_avg");--> statement-breakpoint
CREATE INDEX "prop_metrics_value_idx" ON "prop_metrics" USING btree ("value");--> statement-breakpoint
CREATE INDEX "prop_metrics_best_price_idx" ON "prop_metrics" USING btree ("best_price");--> statement-breakpoint
CREATE INDEX "prop_metrics_line_move_idx" ON "prop_metrics" USING btree ("line_move");--> statement-breakpoint
CREATE INDEX "prop_metrics_streak_idx" ON "prop_metrics" USING btree ("streak");--> statement-breakpoint
CREATE INDEX "prop_metrics_dvp_rank_idx" ON "prop_metrics" USING btree ("dvp_rank");--> statement-breakpoint
CREATE INDEX "prop_offers_lookup_idx" ON "prop_offers" USING btree ("game_id","player_id","market","book","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "prop_offers_captured_idx" ON "prop_offers" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "provider_aliases_internal_idx" ON "provider_aliases" USING btree ("kind","internal_id");--> statement-breakpoint
CREATE INDEX "raw_payloads_provider_fetched_idx" ON "raw_payloads" USING btree ("provider","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "slip_legs_slip_idx" ON "slip_legs" USING btree ("slip_id");--> statement-breakpoint
CREATE INDEX "slip_legs_result_game_idx" ON "slip_legs" USING btree ("result","game_id");--> statement-breakpoint
CREATE INDEX "slips_user_created_idx" ON "slips" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE VIEW "public"."prop_current" AS (select distinct on (game_id, player_id, market, book) id, game_id, player_id, market, line, over_price, under_price, book, captured_at, is_closing from prop_offers order by game_id, player_id, market, book, captured_at desc, id desc);