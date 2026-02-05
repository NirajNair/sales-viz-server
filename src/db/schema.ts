import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const entities = pgTable("entities", {
  id: uuid("id").defaultRandom().primaryKey(),
  gstin: text("gstin").notNull().unique(),
  name: text("name").notNull(),
  place: text("place"),
  pin: text("pin"),
  isBuyer: boolean("is_buyer").notNull().default(false),
  isSeller: boolean("is_seller").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const hsnCodes = pgTable("hsn_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  chemicalName: text("chemical_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const purchaseRecords = pgTable("purchase_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  supplierEntityId: uuid("supplier_entity_id").references(() => entities.id),
  buyerEntityId: uuid("buyer_entity_id").references(() => entities.id),
  hsnCodeId: uuid("hsn_code_id").references(() => hsnCodes.id),
  invoiceNo: text("invoice_no"),
  invoiceDate: date("invoice_date"),
  state: text("state"),
  ewbNo: text("ewb_no"),
  ewbDate: date("ewb_date"),
  assessVal: numeric("assess_val"),
  taxVal: numeric("tax_val"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const entitiesRelations = relations(entities, ({ many }) => ({
  supplierPurchases: many(purchaseRecords, { relationName: "supplierEntity" }),
  buyerPurchases: many(purchaseRecords, { relationName: "buyerEntity" }),
}));

export const hsnCodesRelations = relations(hsnCodes, ({ many }) => ({
  purchases: many(purchaseRecords),
}));

export const purchaseRecordsRelations = relations(
  purchaseRecords,
  ({ one }) => ({
    supplierEntity: one(entities, {
      fields: [purchaseRecords.supplierEntityId],
      references: [entities.id],
      relationName: "supplierEntity",
    }),
    buyerEntity: one(entities, {
      fields: [purchaseRecords.buyerEntityId],
      references: [entities.id],
      relationName: "buyerEntity",
    }),
    hsnCode: one(hsnCodes, {
      fields: [purchaseRecords.hsnCodeId],
      references: [hsnCodes.id],
    }),
  }),
);
