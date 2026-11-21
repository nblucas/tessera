CREATE SCHEMA "read";
--> statement-breakpoint
CREATE TABLE "read"."batches" (
	"association" text NOT NULL,
	"event_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"price_cents" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"opening_sold" integer DEFAULT 0 NOT NULL,
	"opening_amount_cents" bigint DEFAULT 0 NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "batches_association_event_id_batch_id_pk" PRIMARY KEY("association","event_id","batch_id")
);
--> statement-breakpoint
CREATE TABLE "read"."board_terms" (
	"association" text NOT NULL,
	"term" integer NOT NULL,
	"members" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "board_terms_association_term_pk" PRIMARY KEY("association","term")
);
--> statement-breakpoint
CREATE TABLE "read"."expenses" (
	"expense_id" text PRIMARY KEY NOT NULL,
	"association" text NOT NULL,
	"proposer" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"category" text NOT NULL,
	"event_id" text,
	"receipt_sha256" text NOT NULL,
	"approvals" jsonb NOT NULL,
	"rejections" jsonb NOT NULL,
	"status" text NOT NULL,
	"proposed_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "read"."handovers" (
	"association" text NOT NULL,
	"handover_id" text NOT NULL,
	"proposer" text NOT NULL,
	"members" jsonb NOT NULL,
	"approvals" jsonb NOT NULL,
	"status" text NOT NULL,
	"proposed_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "handovers_association_handover_id_pk" PRIMARY KEY("association","handover_id")
);
--> statement-breakpoint
CREATE TABLE "read"."indexer_cursor" (
	"name" text PRIMARY KEY NOT NULL,
	"cursor" text
);
--> statement-breakpoint
CREATE TABLE "read"."tickets" (
	"ticket_id" text PRIMARY KEY NOT NULL,
	"association" text NOT NULL,
	"event_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"owner" text NOT NULL,
	"price_cents" bigint NOT NULL,
	"order_ref" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL
);
