/**
 * 图片模块
 *
 * M7 起它同时承担原「封面图」模块的职责——两者本来就只差默认值
 * （封面默认 1:1 + cover 裁切，图片默认 auto + contain 完整显示），
 * 选项集合早已是超集。保留两个"长得几乎一样"的模块只会让选择变累，
 * 因此合并为一个，用 `fit` 与 `ratio` 覆盖两种用法。
 *
 * 旧工程文件里的 `cover` 模块会在 v2→v3 迁移中自动转成本模块（fit=cover, ratio=1/1）。
 *
 * 类型定义在 ./data.ts —— 见 text/data.ts 顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createMediaData, isMediaData, isMediaEmpty, type MediaData } from '../shared/mediaData'
import type { ImageProps } from './data'

const definition: ModuleDefinition<MediaData, ImageProps> = {
  type: 'image',
  meta: {
    titleKey: 'modules.image',
    icon: 'image',
    category: 'media',
    keywords: ['image', '图片', '照片', '生图', 'cover', '封面', '主图', 'poster'],
  },
  schema: { create: createMediaData, isData: isMediaData },
  defaultProps: { fit: 'contain', ratio: 'auto' },
  options: [
    {
      key: 'fit',
      labelKey: 'moduleOption.fit',
      type: 'select',
      values: [
        { value: 'contain', labelKey: 'moduleOption.fitContain' },
        { value: 'cover', labelKey: 'moduleOption.fitCover' },
      ],
      default: 'contain',
    },
    {
      key: 'ratio',
      labelKey: 'moduleOption.ratio',
      type: 'select',
      values: [
        { value: 'auto', labelKey: 'moduleOption.ratioAuto' },
        { value: '1/1', labelKey: 'moduleOption.ratio1x1' },
        { value: '4/3', labelKey: 'moduleOption.ratio4x3' },
        { value: '16/9', labelKey: 'moduleOption.ratio16x9' },
        { value: '3/4', labelKey: 'moduleOption.ratio3x4' },
      ],
      default: 'auto',
    },
  ],
  editor: defineAsyncComponent(() => import('./ImageEditor.vue')),
  renderer: defineAsyncComponent(() => import('./ImageRenderer.vue')),
  isEmpty: (data) => isMediaEmpty(data),
}

registerModule(definition as AnyModuleDefinition)

export default definition
