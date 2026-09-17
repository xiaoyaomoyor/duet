/**
 * 「标题」模块（v0.5.0）
 *
 * 它原来是画布顶部**自动绘制**的工具名卡片。做成模块之后它和别的模块
 * 完全平等：能拖动、能折叠、能删掉、也能在任意行重新添加
 * （用户要求"最上面的工具名称卡片也进行模块化处理……也可以进行移动等操作"）。
 *
 * 数据真源仍然是 `Side`（见 ./data.ts 的说明），本模块只是一张可移动的视图。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'

const definition: ModuleDefinition<Record<string, never>, Record<string, never>> = {
  type: 'title',
  meta: {
    titleKey: 'modules.title',
    icon: 'heading',
    category: 'layout',
    keywords: ['title', 'header', 'tool', '标题', '工具名', '名称'],
  },
  scope: 'side',
  schema: {
    create: () => ({}),
    // 任何对象都算合法数据：这个模块本来就不存东西
    isData: (value): value is Record<string, never> =>
      typeof value === 'object' && value !== null,
  },
  defaultProps: {},
  options: [],
  editor: defineAsyncComponent(() => import('./TitleEditor.vue')),
  /*
   * 编辑器自己就是双列的（左工具列表、右名称与开关），因此要整幅宽度——
   * 否则会被弹窗默认的双列布局挤成两条窄缝（用户实测反馈"优化编辑标题模块的窗口布局"）。
   */
  editorWide: true,
  /*
   * 不画模块名那一行、卡片内边距更紧：它的内容就是工具名本身，
   * 上面再顶一行"标题"是重复信息，还白白多出二十几个像素。
   */
  headless: true,
  renderer: defineAsyncComponent(() => import('./TitleRenderer.vue')),
  /**
   * **永远不算空**。
   *
   * 其他模块"空"是指用户还没填内容，于是演示视图把它们藏起来；
   * 而标题模块显示的是这一侧是谁——只要这一侧存在，它就有内容。
   * 判成空的话，一张还没填任何内容的对比页在演示视图里会连
   * "左边是谁、右边是谁"都不显示，那就完全看不懂了。
   */
  isEmpty: () => false,
}

registerModule(definition as AnyModuleDefinition)

export default definition
