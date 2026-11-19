CREATE TABLE "bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"placed_on" date NOT NULL,
	"book" text NOT NULL,
	"sport" text DEFAULT 'NBA' NOT NULL,
	"event" text,
	"description" text NOT NULL,
	"bet_type" text DEFAULT 'single' NOT NULL,
	"legs" integer DEFAULT 1 NOT NULL,
	"odds_decimal" numeric(8, 3) NOT NULL,
	"stake" numeric(12, 2) NOT NULL,
	"currency" char(3) DEFAULT 'PHP' NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"payout" numeric(13, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bets_stake_pos" CHECK ("bets"."stake" > 0),
	CONSTRAINT "bets_odds_range" CHECK ("bets"."odds_decimal" between 1.01 and 1000),
	CONSTRAINT "bets_legs_range" CHECK ("bets"."legs" between 1 and 20),
	CONSTRAINT "bets_payout_nonneg" CHECK ("bets"."payout" is null or "bets"."payout" >= 0),
	CONSTRAINT "bets_result_valid" CHECK ("bets"."result" in ('pending', 'win', 'loss', 'push', 'void', 'cashout')),
	CONSTRAINT "bets_type_valid" CHECK ("bets"."bet_type" in ('single', 'parlay')),
	CONSTRAINT "bets_currency_fmt" CHECK ("bets"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bets_user_placed_idx" ON "bets" USING btree ("user_id","placed_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bets_user_result_idx" ON "bets" USING btree ("user_id","result");