/**
 * 分割线模块
 *
 * 存在感最低但使用率很高：用户靠它给对比页分节（"生成质量" / "速度" / "价格"）。
 * 注意 isEmpty 恒为 false —— 分割线本身就是内容，没有"未填写"状态。
 *
 * 类型定义在 ./data.ts —— 见 text/data.ts 顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import type { DividerData } from './data'

const definition: ModuleDefinition<DividerData> = {
  type: 'divider',
  meta: {
    titleKey: 'modules.divider',
    icon: 'divider',
    category: 'layout',
    keywords: ['divider', '分割线', '分节', 'hr'],
  },
  schema: {
    create: () => ({ style: 'solid', label: '' }),
    isData: (value): value is DividerData => typeof value === 'object' && value !== null,
  },
  // 分割线纯粹是排版手段，两侧与整行都用得上
  scope: 'both',
  editor: defineAsyncComponent(() => import('./DividerEditor.vue')),
  renderer: defineAsyncComponent(() => import('./DividerRenderer.vue')),
  // 分割线永远有内容（§7.4 的特例，写在这里以免后人误判为 bug）
  isEmpty: () => false,
}

registerModule(definition as AnyModuleDefinition)

export default definition
