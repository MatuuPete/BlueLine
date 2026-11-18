import type {
  CreateSlipInput,
  FavoriteDTO,
  FavoriteInput,
  PresetDTO,
  SavePresetInput,
  SlipDTO,
  UserSettings,
} from '@blueline/contracts';
import {
  and,
  asc,
  desc,
  eq,
  favorites,
  filterPresets,
  inArray,
  players,
  slipLegs,
  slips,
  userSettings,
  users,
  type Db,
  type InferSelectModel,
} from '../index';

// Every function takes the owner's userId and filters by it. A row owned by someone
// else is indistinguishable from a missing row (callers answer 404, never 403).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Create the users row if missing (dev bypass and first sign-in). Idempotent. */
export async function ensureUser(
  db: Db,
  u: { id: string; email: string; name?: string | null },
): Promise<void> {
  await db
    .insert(users)
    .values({ id: u.id, email: u.email, name: u.name ?? null })
    .onConflictDoNothing();
}

// --- favorites -------------------------------------------------------------

export async function listFavorites(db: Db, userId: string): Promise<FavoriteDTO[]> {
  const rows = await db
    .select()
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt), asc(favorites.playerId));
  return rows.map((r) => ({
    playerId: r.playerId,
    market: r.market,
    side: r.side,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Adds the favorite, or removes it when present. */
export async function toggleFavorite(
  db: Db,
  userId: string,
  f: FavoriteInput,
): Promise<{ favorited: boolean }> {
  const key = and(
    eq(favorites.userId, userId),
    eq(favorites.playerId, f.playerId),
    eq(favorites.market, f.market),
    eq(favorites.side, f.side),
  );
  const removed = await db.delete(favorites).where(key).returning({ p: favorites.playerId });
  if (removed.length > 0) return { favorited: false };
  await db
    .insert(favorites)
    .values({ userId, playerId: f.playerId, market: f.market, side: f.side })
    .onConflictDoNothing();
  return { favorited: true };
}

// --- slips -----------------------------------------------------------------

async function loadSlips(
  db: Db,
  rows: InferSelectModel<typeof slips>[],
): Promise<SlipDTO[]> {
  if (rows.length === 0) return [];
  const legs = await db
    .select({ leg: slipLegs, playerName: players.name })
    .from(slipLegs)
    .innerJoin(players, eq(players.id, slipLegs.playerId))
    .where(
      inArray(
        slipLegs.slipId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(slipLegs.id));
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    book: s.book,
    stake: s.stake,
    createdAt: s.createdAt.toISOString(),
    legs: legs
      .filter((l) => l.leg.slipId === s.id)
      .map(({ leg, playerName }) => ({
        id: leg.id,
        gameId: leg.gameId,
        playerId: leg.playerId,
        playerName,
        market: leg.market,
        side: leg.side,
        line: leg.line,
        price: leg.price,
        result: leg.result,
      })),
  }));
}

export async function listSlips(db: Db, userId: string): Promise<SlipDTO[]> {
  const rows = await db
    .select()
    .from(slips)
    .where(eq(slips.userId, userId))
    .orderBy(desc(slips.createdAt), asc(slips.id));
  return loadSlips(db, rows);
}

export async function getSlip(db: Db, userId: string, id: string): Promise<SlipDTO | null> {
  if (!UUID.test(id)) return null;
  const rows = await db
    .select()
    .from(slips)
    .where(and(eq(slips.id, id), eq(slips.userId, userId)));
  return (await loadSlips(db, rows))[0] ?? null;
}

export async function createSlip(db: Db, userId: string, input: CreateSlipInput): Promise<SlipDTO> {
  const id = await db.transaction(async (tx) => {
    const [s] = await tx
      .insert(slips)
      .values({ userId, name: input.name, book: input.book, stake: input.stake })
      .returning({ id: slips.id });
    await tx.insert(slipLegs).values(input.legs.map((l) => ({ ...l, slipId: s!.id })));
    return s!.id;
  });
  return (await getSlip(db, userId, id))!;
}

/** Returns false when the slip does not exist or belongs to someone else. */
export async function deleteSlip(db: Db, userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .delete(slips)
    .where(and(eq(slips.id, id), eq(slips.userId, userId)))
    .returning({ id: slips.id });
  return rows.length > 0;
}

// --- presets ---------------------------------------------------------------

function toPreset(r: InferSelectModel<typeof filterPresets>): PresetDTO {
  return { id: r.id, name: r.name, filter: r.filterState, createdAt: r.createdAt.toISOString() };
}

export async function listPresets(db: Db, userId: string): Promise<PresetDTO[]> {
  const rows = await db
    .select()
    .from(filterPresets)
    .where(eq(filterPresets.userId, userId))
    .orderBy(asc(filterPresets.createdAt), asc(filterPresets.name));
  return rows.map(toPreset);
}

/** Upserts by (user, name). */
export async function savePreset(
  db: Db,
  userId: string,
  input: SavePresetInput,
): Promise<PresetDTO> {
  const [row] = await db
    .insert(filterPresets)
    .values({ userId, name: input.name, filterState: input.filter })
    .onConflictDoUpdate({
      target: [filterPresets.userId, filterPresets.name],
      set: { filterState: input.filter },
    })
    .returning();
  return toPreset(row!);
}

export async function deletePreset(db: Db, userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .delete(filterPresets)
    .where(and(eq(filterPresets.id, id), eq(filterPresets.userId, userId)))
    .returning({ id: filterPresets.id });
  return rows.length > 0;
}

// --- settings --------------------------------------------------------------

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  oddsFormat: 'american',
  books: [],
  skipIntro: false,
};

export async function getSettings(db: Db, userId: string): Promise<UserSettings> {
  const [r] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!r) return { ...DEFAULT_SETTINGS };
  return { theme: r.theme, oddsFormat: r.oddsFormat, books: r.books, skipIntro: r.skipIntro };
}

export async function saveSettings(
  db: Db,
  userId: string,
  s: UserSettings,
): Promise<UserSettings> {
  const values = {
    theme: s.theme,
    oddsFormat: s.oddsFormat,
    books: s.books,
    skipIntro: s.skipIntro,
    updatedAt: new Date(),
  };
  await db
    .insert(userSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userSettings.userId, set: values });
  return getSettings(db, userId);
}
