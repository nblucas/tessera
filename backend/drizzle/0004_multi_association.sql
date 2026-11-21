-- Keys become unique per association, so several associations can share one database.
CREATE TABLE "read"."applied_events" (
	"hash" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger"."entries" ADD COLUMN "submitted_by" text;
--> statement-breakpoint
ALTER TABLE "app"."sessions" ADD COLUMN "association" text;
--> statement-breakpoint
UPDATE "app"."sessions" s SET "association" = a."association" FROM "app"."accounts" a WHERE a."id" = s."account_id";
--> statement-breakpoint
ALTER TABLE "app"."sessions" ALTER COLUMN "association" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app"."address_challenges" ADD COLUMN "association" text;
--> statement-breakpoint
UPDATE "app"."address_challenges" c SET "association" = a."association" FROM "app"."accounts" a WHERE a."id" = c."account_id";
--> statement-breakpoint
ALTER TABLE "app"."address_challenges" ALTER COLUMN "association" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app"."batch_names" DROP CONSTRAINT "batch_names_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "app"."batch_names" DROP CONSTRAINT "batch_names_event_id_batch_id_pk";
--> statement-breakpoint
ALTER TABLE "app"."batch_names" ADD COLUMN "association" text;
--> statement-breakpoint
UPDATE "app"."batch_names" b SET "association" = e."association" FROM "app"."events" e WHERE e."id" = b."event_id";
--> statement-breakpoint
ALTER TABLE "app"."batch_names" ALTER COLUMN "association" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app"."events" DROP CONSTRAINT "events_pkey";
--> statement-breakpoint
ALTER TABLE "app"."events" ADD CONSTRAINT "events_association_id_pk" PRIMARY KEY("association","id");
--> statement-breakpoint
ALTER TABLE "app"."batch_names" ADD CONSTRAINT "batch_names_association_event_id_batch_id_pk" PRIMARY KEY("association","event_id","batch_id");
--> statement-breakpoint
ALTER TABLE "app"."batch_names" ADD CONSTRAINT "batch_names_association_event_id_events_association_id_fk" FOREIGN KEY ("association","event_id") REFERENCES "app"."events"("association","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app"."expense_details" DROP CONSTRAINT "expense_details_pkey";
--> statement-breakpoint
ALTER TABLE "app"."expense_details" ADD CONSTRAINT "expense_details_association_expense_id_pk" PRIMARY KEY("association","expense_id");
--> statement-breakpoint
ALTER TABLE "app"."expense_details" ADD CONSTRAINT "expense_details_receipt_id_unique" UNIQUE("receipt_id");
--> statement-breakpoint
ALTER TABLE "read"."expenses" DROP CONSTRAINT "expenses_pkey";
--> statement-breakpoint
ALTER TABLE "read"."expenses" ADD CONSTRAINT "expenses_association_expense_id_pk" PRIMARY KEY("association","expense_id");
--> statement-breakpoint
ALTER TABLE "read"."tickets" DROP CONSTRAINT "tickets_pkey";
--> statement-breakpoint
ALTER TABLE "read"."tickets" ADD CONSTRAINT "tickets_association_ticket_id_pk" PRIMARY KEY("association","ticket_id");
