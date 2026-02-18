ALTER TABLE "PurchaseRecords" RENAME COLUMN "supplierEntityId" TO "sellerEntityId";--> statement-breakpoint
ALTER TABLE "PurchaseRecords" DROP CONSTRAINT "PurchaseRecords_supplierEntityId_Entities_id_fk";
--> statement-breakpoint
ALTER TABLE "PurchaseRecords" ADD CONSTRAINT "PurchaseRecords_sellerEntityId_Entities_id_fk" FOREIGN KEY ("sellerEntityId") REFERENCES "public"."Entities"("id") ON DELETE no action ON UPDATE no action;