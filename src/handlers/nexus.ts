import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Context } from "elysia";
import { db } from "../db";
import { entities, hsnCodes, purchaseRecords } from "../db/schema";
import {
  RawGraphRecord,
  validateNexusGraphQuery,
  type GraphNode,
  type GraphResponse,
  type NexusFilterOptionsResponse,
  type ValidatedNexusGraphQuery,
} from "../dto/nexus.dto";
import { loggerWithContext } from "../lib/logger";

const sellerEntity = alias(entities, "seller_entity");
const buyerEntity = alias(entities, "buyer_entity");

export type NexusDependencies = {
  db: typeof db;
  loggerWithContext: Pick<typeof loggerWithContext, "info" | "error">;
};

function getGraphFilterConditions(
  query: ValidatedNexusGraphQuery,
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];
  if (query.fromDate) {
    conditions.push(gte(purchaseRecords.invoiceDate, query.fromDate));
  }
  if (query.toDate) {
    conditions.push(lte(purchaseRecords.invoiceDate, query.toDate));
  }
  if (query.hsnCodes.length > 0) {
    conditions.push(inArray(hsnCodes.code, query.hsnCodes));
  }
  return conditions;
}

function mapNodesFromRecords(
  records: RawGraphRecord[],
  selectedEntityIds: Set<string>,
): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();
  const entityRoles = new Map<
    string,
    { isBuyer: boolean; isSeller: boolean }
  >();

  for (const record of records) {
    // Track seller role
    if (!entityRoles.has(record.sellerId)) {
      entityRoles.set(record.sellerId, { isBuyer: false, isSeller: false });
    }
    entityRoles.get(record.sellerId)!.isSeller = true;

    // Track buyer role
    if (!entityRoles.has(record.buyerId)) {
      entityRoles.set(record.buyerId, { isBuyer: false, isSeller: false });
    }
    entityRoles.get(record.buyerId)!.isBuyer = true;

    // Add seller node if not exists
    if (!nodes.has(record.sellerId)) {
      nodes.set(record.sellerId, {
        id: record.sellerId,
        name: record.sellerName,
        gstin: record.sellerGstin,
        isBuyer: false, // Will be updated after processing all records
        isSeller: false,
        isSelected: selectedEntityIds.has(record.sellerId),
      });
    }

    // Add buyer node if not exists
    if (!nodes.has(record.buyerId)) {
      nodes.set(record.buyerId, {
        id: record.buyerId,
        name: record.buyerName,
        gstin: record.buyerGstin,
        isBuyer: false,
        isSeller: false,
        isSelected: selectedEntityIds.has(record.buyerId),
      });
    }
  }

  // Update nodes with computed roles based on filtered records only
  for (const [entityId, roles] of entityRoles) {
    const node = nodes.get(entityId);
    if (node) {
      node.isBuyer = roles.isBuyer;
      node.isSeller = roles.isSeller;
    }
  }

  return nodes;
}

function mapLinksFromRecords(records: RawGraphRecord[]): Map<
  string,
  {
    source: string;
    target: string;
    hsnDetails: Map<string, { code: string; chemicalName: string }>;
  }
> {
  const links = new Map<
    string,
    {
      source: string;
      target: string;
      hsnDetails: Map<string, { code: string; chemicalName: string }>;
    }
  >();

  for (const record of records) {
    const linkKey = `${record.sellerId}_${record.buyerId}`;

    if (!links.has(linkKey)) {
      links.set(linkKey, {
        source: record.sellerId,
        target: record.buyerId,
        hsnDetails: new Map(),
      });
    }

    const link = links.get(linkKey)!;
    const hsnKey = record.hsnCode;

    if (!link.hsnDetails.has(hsnKey)) {
      link.hsnDetails.set(hsnKey, {
        code: record.hsnCode,
        chemicalName: record.chemicalName,
      });
    }
  }

  return links;
}

export function createHandleGetNexusGraph(deps: NexusDependencies) {
  return async function handleGetNexusGraph({
    query,
  }: Context): Promise<GraphResponse> {
    const validatedQuery = validateNexusGraphQuery(
      query as Record<string, unknown>,
    );
    const selectedEntityIds = new Set(validatedQuery.entityIds);

    // Build base filter conditions (date range and optional HSN codes)
    const baseConditions = getGraphFilterConditions(validatedQuery);

    // Condition: seller OR buyer is in selected entities
    const entityCondition = or(
      inArray(purchaseRecords.sellerEntityId, validatedQuery.entityIds),
      inArray(purchaseRecords.buyerEntityId, validatedQuery.entityIds),
    );

    // First, get all records connected to selected entities (as seller or buyer)
    const dbRecords = await deps.db
      .select({
        sellerId: sellerEntity.id,
        sellerName: sellerEntity.name,
        sellerGstin: sellerEntity.gstin,
        buyerId: buyerEntity.id,
        buyerName: buyerEntity.name,
        buyerGstin: buyerEntity.gstin,
        hsnCode: hsnCodes.code,
        chemicalName: hsnCodes.chemicalName,
      })
      .from(purchaseRecords)
      .innerJoin(
        sellerEntity,
        eq(purchaseRecords.sellerEntityId, sellerEntity.id),
      )
      .innerJoin(buyerEntity, eq(purchaseRecords.buyerEntityId, buyerEntity.id))
      .innerJoin(hsnCodes, eq(purchaseRecords.hsnCodeId, hsnCodes.id))
      .where(and(...baseConditions, entityCondition));

    const records = dbRecords as RawGraphRecord[];

    const nodesMap = mapNodesFromRecords(records, selectedEntityIds);
    const linksMap = mapLinksFromRecords(records);

    deps.loggerWithContext.info(
      {
        selectedEntities: validatedQuery.entityIds.length,
        selectedHsnCodes: validatedQuery.hsnCodes.length,
        nodeCount: nodesMap.size,
        linkCount: linksMap.size,
      },
      "Nexus graph data fetched successfully",
    );

    return {
      nodes: Array.from(nodesMap.values()),
      links: Array.from(linksMap.values()).map((link) => ({
        source: link.source,
        target: link.target,
        hsnDetails: Array.from(link.hsnDetails.values()),
      })),
    };
  };
}

export const handleGetNexusGraph = createHandleGetNexusGraph({
  db,
  loggerWithContext,
});

export function createHandleGetNexusFilterOptions(deps: NexusDependencies) {
  return async function handleGetNexusFilterOptions(): Promise<NexusFilterOptionsResponse> {
    const [entityRows, hsnCodeRows] = await Promise.all([
      deps.db
        .select({
          id: entities.id,
          name: entities.name,
          gstin: entities.gstin,
        })
        .from(entities)
        .orderBy(asc(entities.name)),
      deps.db
        .selectDistinctOn([hsnCodes.code], {
          code: hsnCodes.code,
        })
        .from(hsnCodes)
        .where(and(isNotNull(hsnCodes.code), ne(hsnCodes.code, "")))
        .orderBy(asc(hsnCodes.code)),
    ]);

    deps.loggerWithContext.info("Nexus filter options fetched successfully");

    return {
      entities: entityRows,
      hsnCodes: hsnCodeRows,
    };
  };
}

export const handleGetNexusFilterOptions = createHandleGetNexusFilterOptions({
  db,
  loggerWithContext,
});
