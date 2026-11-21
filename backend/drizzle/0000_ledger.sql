CREATE SCHEMA "ledger";
--> statement-breakpoint
CREATE TABLE "ledger"."entries" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"association" text NOT NULL,
	"kind" text NOT NULL,
	"actor" text,
	"nonce" bigint,
	"record" jsonb NOT NULL,
	"signature" text,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE INDEX "entries_association_idx" ON "ledger"."entries" USING btree ("association","seq");--> statement-breakpoint
CREATE INDEX "entries_actor_idx" ON "ledger"."entries" USING btree ("actor","nonce");