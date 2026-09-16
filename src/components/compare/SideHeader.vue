<script setup lang="ts">
/**
 * 对比方头部（工具卡片）
 *
 * 布局（M6 按用户实测反馈重做）：
 *   ┌─┬────────────────────────────────┐
 *   │█│  ┌──────┐                      │
 *   │█│  │ LOGO │   工具名  版本        │
 *   │█│  └──────┘   备注                │
 *   └─┴────────────────────────────────┘
 *
 * 与旧版的区别：
 *   1. 强调色条从**上侧**移到**左侧**（用户明确要求）
 *   2. LOGO 明显放大，成为卡片左侧的主体
 *   3. 名称字号加大并居中，版本**紧随名称之后**（不再另起一行）
 *   4. 备注在名称的下一行
 *   5. 卡片呈现的是**最终效果**：不再显示"版本""备注"这类占位提示——
 *      它们是编辑态的提示语，出现在成稿里就成了噪音。
 *      需要修改时点右上角的编辑按钮打开弹窗。
 *
 * 只读态（展示视图 / 导出）不渲染编辑按钮，其余完全一致，
 * 因此"编辑视图看到的样子"确实等于成稿。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import ToolIcon from '@/components/common/ToolIcon.vue'
import SideEditorDialog from './SideEditorDialog.vue'
import { clampScale } from './sideScale'
import { useToolsStore } from '@/stores/useToolsStore'
import type { Side } from '@/types/project'

const props = defineProps<{
  side: Side
  readonly?: boolean
  /** 聚光灯「色彩弱化」：没在播放的一侧整体退到后面 */
  dimmed?: boolean
  /** 写入侧字段 */
  patch?: (patch: Record<string, unknown>) => void
}>()

const { t } = useI18n()
const tools = useToolsStore()

const editing = ref(false)

const tool = computed(() => tools.resolve(props.side.toolRef))
const displayName = computed(() => props.side.labelOverride ?? tool.value.name)

/** 各元素的显示开关；省略 = 显示 */
const showIcon = computed(() => props.side.showIcon !== false)
const showName = computed(() => props.side.showName !== false)
const showVersion = computed(() => props.side.showVersion !== false)
const showNote = computed(() => props.side.showNote !== false)

/** 本侧专属图标优先于工具自带图标 */
const iconAssetId = computed(() => props.side.iconAssetId ?? tool.value.iconAssetId)

/** 版本号统一带 v 前缀（用户输入 "1.6" 也显示成 "v1.6"，避免两种写法混用） */
const versionLabel = computed(() => {
  const raw = (props.side.modelVersion ?? '').trim()
  if (!raw) return ''
  return /^v/i.test(raw) ? raw : `v${raw}`
})

const headerStyle = computed(() => ({
  '--accent': props.side.accent,
  '--accent-soft': `color-mix(in srgb, ${props.side.accent} 10%, transparent)`,
  /*
   * 字号倍率以 CSS 变量下发，由样式表里的 calc() 乘到基准字号上。
   * 这样"默认字号"仍然只定义在 CSS 一处，JS 只负责给倍率，
   * 不会出现"改样式表忘了改 JS 里的 px"的漂移。
   */
  '--name-scale': String(clampScale(props.side.nameScale ?? 1)),
  '--version-scale': String(clampScale(props.side.versionScale ?? 1)),
}))

/** 三行都没内容时整块文本区不占位 */
const hasText = computed(() => showName.value || showVersion.value || showNote.value)

function onPatch(patch: Record<string, unknown>): void {
  props.patch?.(patch)
}
</script>

<template>
  <header class="side-head" :class="{ 'side-head--dimmed': dimmed }" :style="headerStyle">
    <!-- 强调色条：左侧竖条 -->
    <span class="side-head__bar" aria-hidden="true" />

    <div class="side-head__body">
      <ToolIcon
        v-if="showIcon"
        class="side-head__logo"
        :name="displayName"
        :color="tool.color"
        :icon-asset-id="iconAssetId"
        :logo-key="tool.builtinKey ?? tool.id"
        :size="72"
      />

      <div v-if="hasText" class="side-head__text">
        <p class="side-head__line">
          <span v-if="showName" class="side-head__name">{{ displayName }}</span>
          <!-- 版本紧随名称之后，而不是另起一行 -->
          <span v-if="showVersion && versionLabel" class="side-head__version">
            {{ versionLabel }}
          </span>
        </p>
        <p v-if="showNote && side.note" class="side-head__note">{{ side.note }}</p>
      </div>

      <!-- 编辑入口：只读态不出现 -->
      <button
        v-if="!readonly"
        class="side-head__edit"
        type="button"
        :title="t('compare.editSideShort')"
        :aria-label="t('compare.editSideShort')"
        @click="editing = true"
      >
        <AppIcon name="edit" :size="14" />
      </button>
    </div>

    <SideEditorDialog
      :open="editing"
      :side="side"
      :display-name="displayName"
      @close="editing = false"
      @patch="onPatch"
    />
  </header>
</template>

<style scoped>
.side-head {
  display: flex;
  overflow: hidden;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

/* 聚光灯「色彩弱化」：与模块格用完全相同的处理，否则工具头会显得"没跟上" */
.side-head--dimmed {
  opacity: 0.35;
  filter: saturate(0.35);
  transition:
    opacity var(--dur-slow) var(--ease-out),
    filter var(--dur-slow) var(--ease-out);
}

/* 左侧强调条：占满整卡高度，颜色随本侧主题色 */
.side-head__bar {
  flex: none;
  width: 5px;
  background: var(--accent, var(--accent-500));
}

.side-head__body {
  position: relative;
  display: flex;
  flex: 1;
  gap: var(--sp-4);
  align-items: center;
  min-width: 0;
  padding: var(--sp-4);
  /* 本侧主题色的极淡底，让左右两张卡片有整体区分 */
  background: var(--accent-soft);
}

/*
 * LOGO 用 flex:none 固定宽度，不随文本长度伸缩——
 * 这样左右两张卡片的图标大小一致，并排看才整齐。
 */
.side-head__logo {
  flex: none;
}

.side-head__text {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.side-head__line {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: baseline;
  justify-content: center;
}

.side-head__name {
  font-size: calc(var(--fs-2xl) * var(--name-scale, 1));
  font-weight: 700;
  line-height: var(--lh-tight);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.side-head__version {
  font-family: var(--font-mono);
  font-size: calc(var(--fs-sm) * var(--version-scale, 1));
  color: var(--text-secondary);
}

.side-head__note {
  margin-top: var(--sp-1);
  font-size: var(--fs-sm);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.side-head__edit {
  position: absolute;
  top: var(--sp-2);
  right: var(--sp-2);
  display: flex;
  padding: var(--sp-1);
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}

.side-head:hover .side-head__edit,
.side-head__edit:focus-visible {
  opacity: 1;
}

.side-head__edit:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
</style>
