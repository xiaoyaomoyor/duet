/**
 * 视频模块
 *
 * 与音频模块同样上报播放时钟，因此视频对比也能驱动进度条联动。
 * 默认 muted：展示视图里多数浏览器禁止带声音的自动播放（§13.4）。
 *
 * 类型定义在 ./data.ts —— 见 text/data.ts 顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createMediaData, isMediaData, isMediaEmpty, type MediaData } from '../shared/mediaData'
import type { VideoProps } from './data'

const definition: ModuleDefinition<MediaData, VideoProps> = {
  type: 'video',
  meta: {
    titleKey: 'modules.video',
    icon: 'video',
    category: 'media',
    keywords: ['video', '视频', 'mp4', '短片'],
  },
  schema: { create: createMediaData, isData: isMediaData },
  defaultProps: { autoplay: false, loop: true, muted: true, controls: true },
  options: [
    { key: 'loop', labelKey: 'moduleOption.loop', type: 'boolean', default: true },
    { key: 'muted', labelKey: 'moduleOption.muted', type: 'boolean', default: true },
    { key: 'controls', labelKey: 'moduleOption.controls', type: 'boolean', default: true },
  ],
  editor: defineAsyncComponent(() => import('./VideoEditor.vue')),
  renderer: defineAsyncComponent(() => import('./VideoRenderer.vue')),
  isEmpty: (data) => isMediaEmpty(data),
}

registerModule(definition as AnyModuleDefinition)

export default definition
