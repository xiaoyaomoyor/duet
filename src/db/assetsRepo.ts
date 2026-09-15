/**
 * 资源（媒体）仓储
 *
 * 资源是唯一存放 Blob 的地方。读取时返回的 Asset 含 Blob，
 * 因此**绝不允许整体放进 Vue 的响应式对象**（§18 K6）——
 * store 中只保存元数据，Blob 由 mediaResolver 按需取用。
 */

import { getDb } from './db'
import { STORE } from './schema'
import { clearStore, count, deleteMany, deleteOne, getAll, getOne, putOne } from './core'
import type { Asset, AssetKind } from '@/types'

export async function listAssets(): Promise<Asset[]> {
  const db = await getDb()
  return getAll<Asset>(db, STORE.assets)
}

export async function getAsset(id: string): Promise<Asset | undefined> {
  const db = await getDb()
  return getOne<Asset>(db, STORE.assets, id)
}

export async function putAsset(asset: Asset): Promise<void> {
  const db = await getDb()
  await putOne(db, STORE.assets, asset)
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await getDb()
  await deleteOne(db, STORE.assets, id)
}

export async function deleteAssets(ids: readonly string[]): Promise<void> {
  const db = await getDb()
  await deleteMany(db, STORE.assets, ids)
}

export async function countAssets(): Promise<number> {
  const db = await getDb()
  return count(db, STORE.assets)
}

export async function clearAssets(): Promise<void> {
  const db = await getDb()
  await clearStore(db, STORE.assets)
}

/** 按 kind 归类统计（存储面板使用） */
export function summarizeByKind(assets: readonly Asset[]): Record<AssetKind, number> {
  const summary: Record<AssetKind, number> = {
    image: 0,
    audio: 0,
    video: 0,
    text: 0,
    icon: 0,
    model3d: 0,
  }
  for (const asset of assets) summary[asset.kind] += 1
  return summary
}

/** 资源总占用字节数 */
export function totalBytes(assets: readonly Asset[]): number {
  return assets.reduce((sum, asset) => sum + (asset.size || 0), 0)
}
