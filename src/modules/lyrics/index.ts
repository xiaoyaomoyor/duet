/**
 * 歌词模块
 *
 * 三种内容形态，模块必须全部支持（这是音乐对比场景的核心）：
 *   1. 手输 / 粘贴纯文本歌词
 *   2. 导入 .txt（纯文本）
 *   3. 导入 .lrc（带时间轴 → 可与音频同步）
 *
 * isEmpty 只看正文：只有时间轴没有文字时仍算"有内容"，
 * 因为那代表"这段是纯音乐"，本身就是有意义的对比信息。
 *
 * 类型定义在 ./data.ts —— 见 text/data.ts 顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import type { LyricsData } from './data'

const definition: ModuleDefinition<LyricsData> = {
  type: 'lyrics',
  meta: {
    titleKey: 'modules.lyrics',
    icon: 'music',
    category: 'text',
    keywords: ['lyrics', '歌词', 'lrc', '字幕'],
  },
  schema: {
    create: () => ({ text: '', syncWithAudio: true, maxHeight: 240 }),
    isData: (value): value is LyricsData => {
      if (typeof value !== 'object' || value === null) return false
      return typeof (value as LyricsData).text === 'string'
    },
  },
  editor: defineAsyncComponent(() => import('./LyricsEditor.vue')),
  renderer: defineAsyncComponent(() => import('./LyricsRenderer.vue')),
  isEmpty: (data) => !data || data.text.trim() === '',
}

registerModule(definition as AnyModuleDefinition)

export default definition
