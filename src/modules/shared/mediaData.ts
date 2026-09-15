/**
 * 媒体型模块的通用内容结构
 *
 * 所有涉及本地文件的模块都存成这个形状，好处是：
 *   - 渲染层只需认一个结构（MediaImage / MediaAudio / MediaVideo 直接消费）
 *   - 外链与本地走同一条解析路径，"仅引用"与"已镜像"只差一个字段
 */
export interface MediaData {
  /** 本地资源 id（已镜像或本地上传） */
  assetId?: string
  /** 外链地址（未镜像时使用） */
  sourceUrl?: string
  /** 展示名 */
  name?: string
}

export function createMediaData(): MediaData {
  return {}
}

export function isMediaData(value: unknown): value is MediaData {
  if (typeof value !== 'object' || value === null) return false
  const data = value as MediaData
  if (data.assetId !== undefined && typeof data.assetId !== 'string') return false
  if (data.sourceUrl !== undefined && typeof data.sourceUrl !== 'string') return false
  return true
}

/** 是否已选媒体（图片/音频/视频模块的 isEmpty 依据） */
export function isMediaEmpty(data: MediaData | undefined): boolean {
  if (!data) return true
  return !data.assetId && !data.sourceUrl
}

/**
 * 同上，但对**任意**输入都安全。
 *
 * isEmpty 会在渲染期被调用，data 可能是 `{}` 或残缺对象；
 * 用 unknown 入参可以强制调用方不假定形状（见 guards.ts 的说明）。
 */
export function isMediaEmptySafe(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return true
  const record = data as Record<string, unknown>
  return !record.assetId && !record.sourceUrl
}
