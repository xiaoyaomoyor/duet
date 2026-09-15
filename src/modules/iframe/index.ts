/**
 * 网页嵌入模块
 *
 * 用途：把对方的在线作品（可灵分享页、CodePen、YouTube…）直接嵌进对比页。
 *
 * 安全纪律（这条比功能重要）：
 *   iframe 默认**强制 sandbox**，且不允许通过配置放宽到 `allow-same-origin + allow-scripts`
 *   的危险组合——那等于给外部页面完整的同源权限，可以读写本应用的 IndexedDB。
 *   因此这里固定 `sandbox="allow-scripts allow-popups"`（不含 allow-same-origin）。
 *   同时明确告诉用户"嵌的是别人的页面，是否加载由对方决定"。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { isBlankText } from '../shared/guards'
import type { IframeData } from './data'

const definition: ModuleDefinition<IframeData> = {
  type: 'iframe',
  meta: {
    titleKey: 'modules.iframe',
    icon: 'link',
    category: 'advanced',
    keywords: ['iframe', '嵌入', '网页', 'embed'],
  },
  schema: {
    create: () => ({ url: '', height: 360 }),
    isData: (value): value is IframeData => {
      if (typeof value !== 'object' || value === null) return false
      return typeof (value as IframeData).url === 'string'
    },
  },
  editor: defineAsyncComponent(() => import('./IframeEditor.vue')),
  renderer: defineAsyncComponent(() => import('./IframeRenderer.vue')),
  isEmpty: (data) => isBlankText(data?.url ?? ''),
}

registerModule(definition as AnyModuleDefinition)

export default definition
