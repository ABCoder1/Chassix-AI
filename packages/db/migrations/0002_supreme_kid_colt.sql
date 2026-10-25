CREATE TABLE IF NOT EXISTS "run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"state" "branch_state" NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_run_event_run_sequence" UNIQUE("workspace_id","run_id","sequence")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "run_events" ADD CONSTRAINT "run_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
