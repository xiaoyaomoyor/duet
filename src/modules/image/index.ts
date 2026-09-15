/**
 * 图片模块
 *
 * 与封面图的区别：默认 object-fit: contain（完整显示不裁切），
 * 用于需要"看清细节"的对比（如生图效果对比）。
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
    keywords: ['image', '图片', '照片', '生图'],
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
