CREATE TABLE "app"."payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"association" text NOT NULL,
	"txid" text NOT NULL,
	"e2eid" text,
	"amount_cents" bigint NOT NULL,
	"outcome" text NOT NULL,
	"order_id" uuid,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "read"."oracle_changes" (
	"association" text NOT NULL,
	"proposal_id" text NOT NULL,
	"proposer" text NOT NULL,
	"new_oracle" text NOT NULL,
	"approvals" jsonb NOT NULL,
	"status" text NOT NULL,
	"proposed_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "oracle_changes_association_proposal_id_pk" PRIMARY KEY("association","proposal_id")
);
--> statement-breakpoint
CREATE TABLE "read"."payment_reports" (
	"association" text NOT NULL,
	"payment_ref" text NOT NULL,
	"kind" text NOT NULL,
	"oracle" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"ticket_id" text,
	"order_ref" text,
	"reason" text,
	"reported_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_reports_association_payment_ref_kind_pk" PRIMARY KEY("association","payment_ref","kind")
);
--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "kind" text DEFAULT 'ticket' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "listed_ticket_id" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "payout_cents" bigint;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "payout_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "e2eid" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "payment_ref" text;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "paid_cents" bigint;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "simulate_settlement_failure" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "read"."batches" ADD COLUMN "resale_cap_percent" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "read"."tickets" ADD COLUMN "kind" text DEFAULT 'sale' NOT NULL;--> statement-breakpoint
ALTER TABLE "read"."tickets" ADD COLUMN "status" text DEFAULT 'valid' NOT NULL;--> statement-breakpoint
ALTER TABLE "read"."tickets" ADD COLUMN "listing_price_cents" bigint;--> statement-breakpoint
ALTER TABLE "read"."tickets" ADD COLUMN "payment_ref" text;--> statement-breakpoint
ALTER TABLE "read"."tickets" ADD COLUMN "resold_from" text;--> statement-breakpoint
ALTER TABLE "read"."tickets" ADD COLUMN "royalty_cents" bigint;--> statement-breakpoint
ALTER TABLE "read"."tickets" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_payment_ref_unique" UNIQUE("payment_ref");