CREATE TABLE "Uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fileName" text NOT NULL,
	"fileSize" integer NOT NULL,
	"fileType" text NOT NULL,
	"reverted" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "PurchaseRecords" ADD COLUMN "uploadId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "PurchaseRecords" ADD CONSTRAINT "PurchaseRecords_uploadId_Uploads_id_fk" FOREIGN KEY ("uploadId") REFERENCES "public"."Uploads"("id") ON DELETE no action ON UPDATE no action;