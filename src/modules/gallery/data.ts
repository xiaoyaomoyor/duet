/**
 * 图片集模块的类型定义（见 text/data.ts 顶部关于循环依赖的说明）
 */

export interface GalleryItem {
  assetId?: string
  sourceUrl?: string
  name?: string
}

export interface GalleryData {
  items: GalleryItem[]
  columns: 2 | 3 | 4
}
