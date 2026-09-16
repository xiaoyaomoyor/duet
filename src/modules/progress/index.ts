/**
 * 进度条模块
 *
 * 两种数据来源：
 *   1. 绑定一个音频/视频资源 → 实时跟随该侧播放进度（M2 已可用）
 *   2. 手工填写时长 → 静态展示（用于"生成耗时对比"这类场景）
 *
 * 拖动跳转（seek）属于 M4 的双轨同步范围：M2 它是**只读展示**，
 * 因此不会出现"看起来能拖、其实拖不动"的假交互。
 *
 * 类型定义在 ./data.ts —— 见 text/data.ts 顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import type { ProgressData } from './data'

const definition: ModuleDefinition<ProgressData> = {
  type: 'progress',
  meta: {
    titleKey: 'modules.progress',
    icon: 'progress',
    category: 'data',
    keywords: ['progress', '进度', '时间轴', 'timeline', 'seek'],
  },
  schema: {
    create: () => ({ showTime: true, showWaveform: true }),
    isData: (value): value is ProgressData => typeof value === 'object' && value !== null,
  },
  editor: defineAsyncComponent(() => import('./ProgressEditor.vue')),
  renderer: defineAsyncComponent(() => import('./ProgressRenderer.vue')),
  /**
   * 进度条永远可见：即使没绑定资源，它也表达"这一方没有时长信息"，
   * 直接隐藏反而会让左右两栏失去对应关系（§7.5 对齐）。
   */
  isEmpty: () => false,
}

registerModule(definition as AnyModuleDefinition)

export default definition
