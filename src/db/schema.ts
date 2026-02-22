import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const uploads = pgTable("Uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileName: text("fileName").notNull(),
  fileSize: integer("fileSize").notNull(),
  fileType: text("fileType").notNull(),
  reverted: boolean("reverted").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

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
  sellerEntityId: uuid("sellerEntityId").references(() => entities.id),
  buyerEntityId: uuid("buyerEntityId").references(() => entities.id),
  hsnCodeId: uuid("hsnCodeId").references(() => hsnCodes.id),
  invoiceNo: text("invoiceNo"),
  invoiceDate: timestamp("invoiceDate"),
  state: text("state"),
  ewbNo: text("ewbNo"),
  ewbDate: timestamp("ewbDate"),
  assessVal: numeric("assessVal"),
  taxVal: numeric("taxVal"),
  uploadId: uuid("uploadId")
    .references(() => uploads.id)
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const uploadsRelations = relations(uploads, ({ many }) => ({
  entities: many(entities),
  hsnCodes: many(hsnCodes),
  purchaseRecords: many(purchaseRecords),
}));

export const entitiesRelations = relations(entities, ({ many }) => ({
  sellerPurchases: many(purchaseRecords, { relationName: "sellerEntity" }),
  buyerPurchases: many(purchaseRecords, { relationName: "buyerEntity" }),
}));

export const hsnCodesRelations = relations(hsnCodes, ({ many }) => ({
  purchases: many(purchaseRecords),
}));

export const purchaseRecordsRelations = relations(
  purchaseRecords,
  ({ one }) => ({
    sellerEntity: one(entities, {
      fields: [purchaseRecords.sellerEntityId],
      references: [entities.id],
      relationName: "sellerEntity",
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
    upload: one(uploads, {
      fields: [purchaseRecords.uploadId],
      references: [uploads.id],
    }),
  }),
);
