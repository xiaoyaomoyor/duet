<script setup lang="ts">
/**
 * 模块的**规范呈现**（标题 + 渲染器）
 *
 * 为什么必须抽成独立组件：
 *   用户的要求是"编辑视图里默认看到的效果，就是最终展示的效果"。
 *   如果编辑视图和展示视图各自写一遍"标题 + 渲染器"，
 *   两者迟早会漂移（改了一边忘了另一边），而且漂移了很难发现——
 *   要等到导出成稿才看出来。放在这里之后，
 *   "编辑即所见"是**结构上的保证**，不是靠自觉维持的约定。
 *
 * 职责边界：
 *   - 本组件只负责"一个模块长什么样"，不管空模块占位、按钮、拖拽。
 *   - 空模块的占位与"点击填写"属于编辑态专属，放在 ModuleCard 里。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getModule } from '@/modules/registry'
import type { ModuleInstance, SideId } from '@/types/project'

const props = defineProps<{
  module: ModuleInstance
  sideId: SideId
  accent: string
  /** 只读渲染（展示视图 / 导出长图 / 只读 HTML） */
  readonly?: boolean
}>()

const { t } = useI18n()

const definition = computed(() => getModule(props.module.type))

/**
 * 是否显示标题。
 *
 * 约定：**标题为空即不显示**。这样用户不需要额外的开关就能去掉标题——
 * 把标题清空即可。默认新建的模块会带类型名（如「文字」）作为标题，
 * 便于编辑期辨认；成稿前改成自己想要的维度名或清空。
 */
const showTitle = computed(() => props.module.title.trim().length > 0)
</script>

<template>
  <section class="module-view" :style="{ '--accent': accent }">
    <h4 v-if="showTitle" class="module-view__title">{{ module.title }}</h4>

    <!--
      正文默认是模块渲染器；编辑视图在模块为空时会传入 #body 插槽，
      用"点击填写"的占位框替换掉它。
      标题始终由本组件渲染——否则空模块的标题会跑到占位框里，
      同一个信息出现两条 DOM 路径，两边样式与测试都会各自漂移。
    -->
    <slot name="body">
      <component
        :is="definition?.renderer"
        v-if="definition"
        :module="module"
        :side-id="sideId"
        :accent="accent"
        :readonly="readonly === true"
      />

      <!-- 注册表里没有这个类型：多半是旧文件用了新版本才有的模块，如实说明而不是空白 -->
      <p v-else class="module-view__unknown">
        {{ t('module.unknownType', { type: module.type }) }}
      </p>
    </slot>
  </section>
</template>

<style scoped>
.module-view {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}

/*
 * 标题的字号刻意小于正文标题（h3），且用次要色：
 * 它是"维度标签"而不是内容主角，抢戏会让对比页变得很吵。
 */
.module-view__title {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.01em;
}

.module-view__unknown {
  padding: var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--warning);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-sm);
}
</style>
