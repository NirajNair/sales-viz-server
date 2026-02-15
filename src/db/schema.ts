import { relations } from "drizzle-orm";
import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const entities = pgTable("Entities", {
  id: uuid("id").defaultRandom().primaryKey(),
  gstin: text("gstin").notNull().unique(),
  name: text("name").notNull(),
  place: text("place"),
  pin: text("pin"),
  isBuyer: boolean("isBuyer").notNull().default(false),
  isSeller: boolean("isSeller").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const hsnCodes = pgTable("HSNCodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  chemicalName: text("chemical_name").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const purchaseRecords = pgTable("PurchaseRecords", {
  id: uuid("id").defaultRandom().primaryKey(),
  supplierEntityId: uuid("supplierEntityId").references(() => entities.id),
  buyerEntityId: uuid("buyerEntityId").references(() => entities.id),
  hsnCodeId: uuid("hsnCodeId").references(() => hsnCodes.id),
  invoiceNo: text("invoiceNo"),
  invoiceDate: timestamp("invoiceDate"),
  state: text("state"),
  ewbNo: text("ewbNo"),
  ewbDate: timestamp("ewbDate"),
  assessVal: numeric("assessVal"),
  taxVal: numeric("taxVal"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
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
