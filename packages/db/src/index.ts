// @blueline/db: schema, client and (Wave 2) queries.
import * as schema from './schema';

export { schema };
export * from './schema';
export {
  closeDb,
  createDb,
  MIGRATIONS_FOLDER,
  runMigrations,
  type Db,
  type Schema,
} from './client';

// Query helpers re-exported so apps (worker, web) don't need their own drizzle-orm
// dependency (pnpm is strict; a second copy could also diverge).
export {
  and,
  asc,
  avg,
  between,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  min,
  ne,
  not,
  notInArray,
  or,
  sql,
  sum,
  type InferInsertModel,
  type InferSelectModel,
  type SQL,
} from 'drizzle-orm';
