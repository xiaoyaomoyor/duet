/**
 * 音频控制台模块（通用模块）
 *
 * 用途：两侧音频的同时播放 / 暂停 / 定位、Solo、静音、漂移显示。
 *
 * 为什么从"固定控制栏"改成模块（用户反馈）：
 *   它原先是一条常驻在画布上方的控制栏，只要两侧都有音频就自动出现。
 *   但"我这次要不要用双轨同步"其实是**内容层面的决定**，
 *   和"要不要放歌词""要不要放评分"是同一类事情。
 *   做成模块之后，它可以被放在任意位置、可以被删除、也会出现在成稿里
 *   （原先带 no-export，导出时长图里根本没有它）。
 *
 * 它没有内容数据：整块状态都来自音频引擎，因此 `data` 恒为 `{}`，
 * 且 `isEmpty` 恒为 false——用户既然主动加了它，就不该让它凭空消失；
 * 真正没准备好时（只有一侧有音轨），组件内部会说明原因。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'

export interface AudioConsoleData {
  /** 占位：本模块没有用户可填内容，保留字段以便将来扩展（如默认主轨） */
  _?: never
}

const definition: ModuleDefinition<AudioConsoleData> = {
  type: 'audioConsole',
  meta: {
    titleKey: 'modules.audioConsole',
    icon: 'play',
    category: 'data',
    keywords: ['sync', '同步', '对轨', 'solo', '独听', '静音', '音频控制台', 'ab'],
  },
  // 通用模块：它要同时操纵两侧，放进某一侧没有意义
  scope: 'common',
  schema: {
    create: (): AudioConsoleData => ({}),
    isData: (value): value is AudioConsoleData => typeof value === 'object' && value !== null,
  },
  editor: defineAsyncComponent(() => import('./AudioConsoleEditor.vue')),
  renderer: defineAsyncComponent(() => import('./AudioConsoleRenderer.vue')),
  // 恒不为空：用户主动添加的东西不该凭空消失（详见文件头部说明）
  isEmpty: () => false,
}

registerModule(definition as AnyModuleDefinition)

export default definition
