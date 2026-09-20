import { getDb } from '@/db/db'
import { getAll, putOne, deleteOne } from '@/db/core'
import { STORE } from '@/db/schema'
import { uuid } from '@/lib/id'
import { validAppearance, type AppearancePreset } from '@/types/appearance'
const prefix = 'appearance:'
export async function listAppearancePresets(): Promise<AppearancePreset[]> {
  const rows = await getAll<{ key: string; value: AppearancePreset }>(await getDb(), STORE.meta)
  return rows
    .filter(
      (r) =>
        r.key.startsWith(prefix) &&
        typeof r.value?.name === 'string' &&
        validAppearance(r.value.appearance),
    )
    .map((r) => r.value)
}
export async function saveAppearancePreset(
  preset: Omit<AppearancePreset, 'id'>,
): Promise<AppearancePreset> {
  if (!validAppearance(preset.appearance)) throw new Error('预设仅支持外观选项')
  const p = {
    id: uuid(),
    name: preset.name.trim().slice(0, 60) || '个人风格',
    appearance: { ...preset.appearance },
  }
  await putOne(await getDb(), STORE.meta, { key: prefix + p.id, value: p })
  return p
}
export async function removeAppearancePreset(id: string): Promise<void> {
  await deleteOne(await getDb(), STORE.meta, prefix + id)
}
