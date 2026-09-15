/**
 * 封面图模块
 *
 * 与"图片"模块的区别：封面默认 1:1 且 object-fit: cover（裁切填满），
 * 用于工具头下方那张"作品主视觉"。
 *
 * 类型定义在 ./data.ts —— 见该文件顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createMediaData, isMediaData, isMediaEmpty, type MediaData } from '../shared/mediaData'
import type { CoverProps } from './data'

const definition: ModuleDefinition<MediaData, CoverProps> = {
  type: 'cover',
  meta: {
    titleKey: 'modules.cover',
    icon: 'image',
    category: 'media',
    keywords: ['cover', '封面', '主图', 'poster'],
  },
  schema: { create: createMediaData, isData: isMediaData },
  defaultProps: { ratio: '1/1' },
  options: [
    {
      key: 'ratio',
      labelKey: 'moduleOption.ratio',
      type: 'select',
      values: [
        { value: '1/1', labelKey: 'moduleOption.ratio1x1' },
        { value: '4/3', labelKey: 'moduleOption.ratio4x3' },
        { value: '16/9', labelKey: 'moduleOption.ratio16x9' },
        { value: '3/4', labelKey: 'moduleOption.ratio3x4' },
        { value: 'auto', labelKey: 'moduleOption.ratioAuto' },
      ],
      default: '1/1',
    },
  ],
  editor: defineAsyncComponent(() => import('./CoverEditor.vue')),
  renderer: defineAsyncComponent(() => import('./CoverRenderer.vue')),
  isEmpty: (data) => isMediaEmpty(data),
}

registerModule(definition as AnyModuleDefinition)

export default definition
