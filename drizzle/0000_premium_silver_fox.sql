CREATE TABLE "Entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gstin" text NOT NULL,
	"name" text NOT NULL,
	"place" text,
	"pin" text,
	"isBuyer" boolean DEFAULT false NOT NULL,
	"isSeller" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Entities_gstin_unique" UNIQUE("gstin")
);
--> statement-breakpoint
CREATE TABLE "HSNCodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"chemical_name" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PurchaseRecords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplierEntityId" uuid,
	"buyerEntityId" uuid,
	"hsnCodeId" uuid,
	"invoiceNo" text,
	"invoiceDate" timestamp,
	"state" text,
	"ewbNo" text,
	"ewbDate" timestamp,
	"assessVal" numeric,
	"taxVal" numeric,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "PurchaseRecords" ADD CONSTRAINT "PurchaseRecords_supplierEntityId_Entities_id_fk" FOREIGN KEY ("supplierEntityId") REFERENCES "public"."Entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PurchaseRecords" ADD CONSTRAINT "PurchaseRecords_buyerEntityId_Entities_id_fk" FOREIGN KEY ("buyerEntityId") REFERENCES "public"."Entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PurchaseRecords" ADD CONSTRAINT "PurchaseRecords_hsnCodeId_HSNCodes_id_fk" FOREIGN KEY ("hsnCodeId") REFERENCES "public"."HSNCodes"("id") ON DELETE no action ON UPDATE no action;