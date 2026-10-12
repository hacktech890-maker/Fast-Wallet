import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { audit } from "@/server/utils/audit";
import { ApiError } from "@/server/utils/api";
import {
  settingsSchema,
  DEFAULT_SETTINGS,
  PUBLIC_SETTING_KEYS,
  type PlatformConfig,
  type SettingKey,
} from "@/server/config/settings-schema";

export { settingsSchema, DEFAULT_SETTINGS, PUBLIC_SETTING_KEYS };
export type { PlatformConfig, SettingKey };

/**
 * Database-backed operational configuration. Secrets never live here —
 * only non-sensitive operational policy that admins may change at runtime.
 */
/** Short-lived cache so hot paths don't hit the DB on every request. */
let cache: { value: PlatformConfig; at: number } | null = null;
const TTL_MS = 10_000;

export function invalidateSettingsCache(): void {
  cache = null;
}

export async function getSettings(): Promise<PlatformConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let rows: { key: string; value: unknown }[] = [];
  try {
    rows = await db.select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings);
  } catch {
    // Table missing (pre-migration) — fall back to defaults rather than 500.
    return DEFAULT_SETTINGS;
  }

  const raw: Record<string, unknown> = {};
  for (const row of rows) raw[row.key] = row.value;

  const parsed = settingsSchema.safeParse(raw);
  const value = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  cache = { value, at: Date.now() };
  return value;
}

export async function getPublicSettings(): Promise<Partial<PlatformConfig>> {
  const all = await getSettings();
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_SETTING_KEYS) out[key] = all[key];
  return out as Partial<PlatformConfig>;
}

export interface SettingsUpdateResult {
  changes: { key: string; previous: unknown; next: unknown }[];
  settings: PlatformConfig;
}

/**
 * Apply a partial settings update. Records previous → next for every key in
 * the audit log together with the mandatory reason.
 */
export async function updateSettings(
  adminId: string,
  patch: Partial<PlatformConfig>,
  reason: string,
  ip: string,
): Promise<SettingsUpdateResult> {
  const current = await getSettings();
  const merged = settingsSchema.parse({ ...current, ...patch });

  const keys = Object.keys(patch) as SettingKey[];
  if (keys.length === 0) throw ApiError.badRequest("NO_CHANGES", "No settings were supplied");

  const changes = keys
    .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(merged[key]))
    .map((key) => ({ key, previous: current[key], next: merged[key] }));

  if (changes.length === 0) {
    return { changes: [], settings: current };
  }

  await db.transaction(async (tx) => {
    for (const change of changes) {
      await tx
        .insert(platformSettings)
        .values({ key: change.key, value: merged[change.key as SettingKey] as never, updatedBy: adminId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: { value: merged[change.key as SettingKey] as never, updatedBy: adminId, updatedAt: new Date() },
        });
    }
    await audit(
      {
        actorId: adminId,
        action: "settings.updated",
        targetType: "platform_settings",
        targetId: changes.map((c) => c.key).join(","),
        metadata: { reason, changes },
        ip,
      },
      tx,
    );
  });

  invalidateSettingsCache();
  return { changes, settings: merged };
}

/** Reset the cache helper for tests. */
export async function listSettingRows() {
  return db.select().from(platformSettings).where(inArray(platformSettings.key, Object.keys(DEFAULT_SETTINGS)));
}

export async function getSetting<K extends SettingKey>(key: K): Promise<PlatformConfig[K]> {
  const settings = await getSettings();
  return settings[key];
}

export async function deleteSetting(key: SettingKey): Promise<void> {
  await db.delete(platformSettings).where(eq(platformSettings.key, key));
  invalidateSettingsCache();
}
