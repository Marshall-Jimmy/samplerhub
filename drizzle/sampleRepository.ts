import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  like,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  categories,
  recentSamples,
  samples,
  sampleTags,
  tags,
} from './schema';
import { sampleListSelection } from './sampleListSelection';

export type SampleSortField =
  | 'fileName'
  | 'duration'
  | 'bpm'
  | 'key'
  | 'createdAt'
  | 'playCount'
  | 'fileSize';

export interface SampleSearchFilters {
  query?: string;
  categoryId?: number;
  folderPath?: string;
  isFavorite?: boolean;
  fileType?: string;
  bpmMin?: number;
  bpmMax?: number;
  durationMin?: number;
  durationMax?: number;
  key?: string;
  tagIds?: number[];
  sortField?: SampleSortField;
  sortDirection?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface SamplePage<T = Record<string, unknown>> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

// Kept structural so this repository works with better-sqlite3, libSQL and
// other Drizzle SQLite drivers without forcing a driver-specific import.
type DrizzleDatabase = any;

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizePagination(filters: SampleSearchFilters): { offset: number; limit: number } {
  return {
    offset: clampInteger(filters.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    limit: clampInteger(filters.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
  };
}

function buildWhere(db: DrizzleDatabase, filters: SampleSearchFilters): SQL | undefined {
  const conditions: SQL[] = [];

  const query = filters.query?.trim();
  if (query) {
    const pattern = `%${query}%`;
    conditions.push(or(
      like(samples.fileName, pattern),
      like(samples.filePath, pattern),
      like(samples.tags, pattern),
    ) as SQL);
  }

  if (filters.categoryId !== undefined) {
    conditions.push(eq(samples.categoryId, filters.categoryId));
  }

  const folderPath = filters.folderPath?.trim().replace(/[\\/]+$/, '');
  if (folderPath) {
    conditions.push(or(
      like(samples.filePath, `${folderPath}/%`),
      like(samples.filePath, `${folderPath}\\%`),
    ) as SQL);
  }

  if (filters.isFavorite !== undefined) {
    conditions.push(eq(samples.isFavorite, filters.isFavorite));
  }
  if (filters.fileType) {
    conditions.push(eq(samples.fileType, filters.fileType));
  }
  if (filters.bpmMin !== undefined) {
    conditions.push(gte(samples.bpm, filters.bpmMin));
  }
  if (filters.bpmMax !== undefined) {
    conditions.push(lte(samples.bpm, filters.bpmMax));
  }
  if (filters.durationMin !== undefined) {
    conditions.push(gte(samples.duration, filters.durationMin));
  }
  if (filters.durationMax !== undefined) {
    conditions.push(lte(samples.duration, filters.durationMax));
  }
  if (filters.key) {
    conditions.push(eq(samples.key, filters.key));
  }

  const requestedTagIds = [...new Set(filters.tagIds ?? [])]
    .map(Number)
    .filter(Number.isInteger);

  if (requestedTagIds.length > 0) {
    // Require all selected tags, without multiplying result rows in the main
    // query. The subquery returns only sample IDs matching every requested tag.
    const taggedSamples = db
      .select({ sampleId: sampleTags.sampleId })
      .from(sampleTags)
      .where(inArray(sampleTags.tagId, requestedTagIds))
      .groupBy(sampleTags.sampleId)
      .having(eq(sql<number>`count(DISTINCT ${sampleTags.tagId})`, requestedTagIds.length));

    conditions.push(inArray(samples.id, taggedSamples));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function getOrderBy(filters: SampleSearchFilters): unknown[] {
  const column = {
    fileName: samples.fileName,
    duration: samples.duration,
    bpm: samples.bpm,
    key: samples.key,
    createdAt: samples.createdAt,
    playCount: samples.playCount,
    fileSize: samples.fileSize,
  }[filters.sortField ?? 'fileName'];

  const direction = filters.sortDirection === 'desc' ? desc : asc;
  return [direction(column), direction(samples.id)];
}

const categorySelection = {
  categoryDbId: categories.id,
  categoryName: categories.name,
  categoryParentId: categories.parentId,
  categoryIsSystem: categories.isSystem,
  categorySortOrder: categories.sortOrder,
  categoryCreatedAt: categories.createdAt,
} as const;

async function readTagsForSamples(db: DrizzleDatabase, sampleIds: number[]) {
  if (sampleIds.length === 0) return new Map<number, Array<Record<string, unknown>>>();

  const rows = await db
    .select({
      sampleId: sampleTags.sampleId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
    })
    .from(sampleTags)
    .innerJoin(tags, eq(sampleTags.tagId, tags.id))
    .where(inArray(sampleTags.sampleId, sampleIds))
    .orderBy(asc(tags.name));

  const grouped = new Map<number, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const list = grouped.get(row.sampleId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color, createdAt: row.createdAt });
    grouped.set(row.sampleId, list);
  }
  return grouped;
}

function hydrateListRows(
  rows: Array<Record<string, any>>,
  tagsBySample: Map<number, Array<Record<string, unknown>>>,
) {
  return rows.map((row) => {
    const {
      categoryDbId,
      categoryName,
      categoryParentId,
      categoryIsSystem,
      categorySortOrder,
      categoryCreatedAt,
      ...sample
    } = row;

    return {
      ...sample,
      category: categoryDbId == null ? null : {
        id: categoryDbId,
        name: categoryName,
        parentId: categoryParentId,
        isSystem: categoryIsSystem,
        sortOrder: categorySortOrder,
        createdAt: categoryCreatedAt,
      },
      tags: tagsBySample.get(row.id) ?? [],
    };
  });
}

/**
 * Optimized replacement for list/search IPC queries.
 *
 * It enforces pagination, performs a separate COUNT, excludes heavy fields,
 * and hydrates categories/tags only for the current page.
 */
export async function searchSamplesPage(
  db: DrizzleDatabase,
  filters: SampleSearchFilters = {},
): Promise<SamplePage> {
  const { offset, limit } = normalizePagination(filters);
  const whereClause = buildWhere(db, filters);

  let listQuery = db
    .select({ ...sampleListSelection, ...categorySelection })
    .from(samples)
    .leftJoin(categories, eq(samples.categoryId, categories.id))
    .$dynamic();

  let countQuery = db
    .select({ total: sql<number>`count(*)` })
    .from(samples)
    .$dynamic();

  if (whereClause) {
    listQuery = listQuery.where(whereClause);
    countQuery = countQuery.where(whereClause);
  }

  const [rows, totalRows] = await Promise.all([
    listQuery.orderBy(...getOrderBy(filters)).limit(limit).offset(offset),
    countQuery,
  ]);

  const tagsBySample = await readTagsForSamples(db, rows.map((row: any) => row.id));
  const total = Number(totalRows[0]?.total ?? 0);

  return {
    items: hydrateListRows(rows, tagsBySample),
    total,
    offset,
    limit,
  };
}

export async function getSamplesPage(
  db: DrizzleDatabase,
  input: Pick<SampleSearchFilters, 'offset' | 'limit'> = {},
): Promise<SamplePage> {
  return searchSamplesPage(db, input);
}

export async function getFavoritesPage(
  db: DrizzleDatabase,
  input: Omit<SampleSearchFilters, 'isFavorite'> = {},
): Promise<SamplePage> {
  return searchSamplesPage(db, { ...input, isFavorite: true });
}

/** Returns unique recent samples, ordered by their latest recent_samples row. */
export async function getRecentSamplesPage(
  db: DrizzleDatabase,
  input: Pick<SampleSearchFilters, 'offset' | 'limit'> = {},
): Promise<SamplePage> {
  const { offset, limit } = normalizePagination(input);
  const latestPlayedAt = sql<number>`max(${recentSamples.playedAt})`;

  const [recentRows, totalRows] = await Promise.all([
    db
      .select({ sampleId: recentSamples.sampleId, playedAt: latestPlayedAt })
      .from(recentSamples)
      .groupBy(recentSamples.sampleId)
      .orderBy(desc(latestPlayedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(DISTINCT ${recentSamples.sampleId})` }).from(recentSamples),
  ]);

  const sampleIds = recentRows.map((row: any) => row.sampleId as number);
  if (sampleIds.length === 0) {
    return { items: [], total: Number(totalRows[0]?.total ?? 0), offset, limit };
  }

  const rows = await db
    .select({ ...sampleListSelection, ...categorySelection })
    .from(samples)
    .leftJoin(categories, eq(samples.categoryId, categories.id))
    .where(inArray(samples.id, sampleIds));

  const order = new Map<number, number>(sampleIds.map((id, index): [number, number] => [id, index]));
  rows.sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const tagsBySample = await readTagsForSamples(db, sampleIds);
  return {
    items: hydrateListRows(rows, tagsBySample),
    total: Number(totalRows[0]?.total ?? 0),
    offset,
    limit,
  };
}

/** Full record for a single detail panel. Heavy columns are read only here. */
export async function getSampleDetail(db: DrizzleDatabase, sampleId: number) {
  const [row] = await db
    .select()
    .from(samples)
    .where(eq(samples.id, sampleId))
    .limit(1);

  if (!row) return null;

  const [categoryRows, tagsBySample] = await Promise.all([
    row.categoryId == null
      ? Promise.resolve([])
      : db.select().from(categories).where(eq(categories.id, row.categoryId)).limit(1),
    readTagsForSamples(db, [sampleId]),
  ]);

  const { tags: inferredTags, ...sample } = row;
  return {
    ...sample,
    inferredTags,
    category: categoryRows[0] ?? null,
    tags: tagsBySample.get(sampleId) ?? [],
  };
}

export async function getSampleCount(db: DrizzleDatabase): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(samples);
  return Number(row?.total ?? 0);
}

export function createSampleRepository(db: DrizzleDatabase) {
  return {
    search: (filters?: SampleSearchFilters) => searchSamplesPage(db, filters),
    page: (input?: Pick<SampleSearchFilters, 'offset' | 'limit'>) => getSamplesPage(db, input),
    favorites: (input?: Omit<SampleSearchFilters, 'isFavorite'>) => getFavoritesPage(db, input),
    recent: (input?: Pick<SampleSearchFilters, 'offset' | 'limit'>) => getRecentSamplesPage(db, input),
    detail: (sampleId: number) => getSampleDetail(db, sampleId),
    count: () => getSampleCount(db),
  };
}
