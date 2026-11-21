CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"association" text NOT NULL,
	"email" text,
	"name" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "accounts_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "app"."address_challenges" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."associations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."auth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"association" text NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."batch_names" (
	"event_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "batch_names_event_id_batch_id_pk" PRIMARY KEY("event_id","batch_id")
);
--> statement-breakpoint
CREATE TABLE "app"."events" (
	"id" text PRIMARY KEY NOT NULL,
	"association" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"location" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."expense_details" (
	"expense_id" text PRIMARY KEY NOT NULL,
	"association" text NOT NULL,
	"description" text NOT NULL,
	"receipt_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."handover_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"association" text NOT NULL,
	"proposed_by" uuid NOT NULL,
	"members" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"association" text NOT NULL,
	"account_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"price_cents" bigint NOT NULL,
	"status" text NOT NULL,
	"txid" text NOT NULL,
	"pix_copy_paste" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ticket_id" text,
	"failure_reason" text,
	"seller_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_txid_unique" UNIQUE("txid")
);
--> statement-breakpoint
CREATE TABLE "app"."receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"association" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"erased_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."accounts" ADD CONSTRAINT "accounts_association_associations_id_fk" FOREIGN KEY ("association") REFERENCES "app"."associations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."address_challenges" ADD CONSTRAINT "address_challenges_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."batch_names" ADD CONSTRAINT "batch_names_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."events" ADD CONSTRAINT "events_association_associations_id_fk" FOREIGN KEY ("association") REFERENCES "app"."associations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."expense_details" ADD CONSTRAINT "expense_details_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "app"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."handover_drafts" ADD CONSTRAINT "handover_drafts_proposed_by_accounts_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "app"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_uploaded_by_accounts_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "app"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_idx" ON "app"."accounts" USING btree ("association","email");