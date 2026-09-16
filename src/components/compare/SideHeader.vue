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
import { sideTint } from '@/lib/color'
import { useToolsStore } from '@/stores/useToolsStore'
import { useResolvedTheme } from '@/composables/useResolvedTheme'
import { mosaicDataUri } from '@/lib/mosaic'
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
const theme = useResolvedTheme()

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
  /* 与模块卡片共用同一个派生函数（见 lib/color.ts 的 sideTint） */
  '--accent-soft': sideTint(props.side.accent),
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

// ——————————————————————————————————————————————————————————
// 匿名处理（v0.3.5）
// ——————————————————————————————————————————————————————————

/**
 * 临时显现的字段。
 *
 * 与 `side.anonymizeXxx` 的关系：那个是**持久设置**（存进工程、导出也是黑的），
 * 这个只是"这次我想看一眼"——点击黑框显现、再点一次收回，**不写数据**。
 * 交付演示时非常常见：大部分时间遮着，讲到某一条时点开。
 */
const revealed = ref<Set<'name' | 'version' | 'icon'>>(new Set())

function toggleReveal(field: 'name' | 'version' | 'icon'): void {
  const next = new Set(revealed.value)
  if (next.has(field)) next.delete(field)
  else next.add(field)
  revealed.value = next
}

const nameHidden = computed(() => props.side.anonymizeName === true && !revealed.value.has('name'))
const versionHidden = computed(
  () => props.side.anonymizeVersion === true && !revealed.value.has('version'),
)
const iconHidden = computed(() => props.side.anonymizeIcon === true && !revealed.value.has('icon'))

/**
 * 马赛克底图。
 *
 * 刻意**不带 seed**：所有工具、左右两栏共用同一张图，
 * 这样观者看到的是"两处被遮住"，而不是"两个不同的图案"。
 * 明暗两档跟着主题走，否则黑块压在深色卡片上会看不见。
 */
const mosaic = computed(() =>
  mosaicDataUri({
    dark: theme.value === 'light' ? '#6b7280' : '#4b5563',
    light: theme.value === 'light' ? '#cbd5e1' : '#94a3b8',
  }),
)

function onPatch(patch: Record<string, unknown>): void {
  props.patch?.(patch)
}
</script>

<template>
  <header class="side-head" :class="{ 'side-head--dimmed': dimmed }" :style="headerStyle">
    <!-- 强调色条：左侧竖条 -->
    <span class="side-head__bar" aria-hidden="true" />

    <div class="side-head__body">
      <!--
        LOGO 的匿名：整块换成**统一的马赛克图**（所有工具共用同一张）。
        为什么不用"模糊原图"：模糊会把品牌色与大致形状留在那里，
        等于没遮住；而统一的马赛克还能顺带传达"这两处被有意遮住了"。
      -->
      <button
        v-if="showIcon && iconHidden"
        class="side-head__logo side-head__logo--masked"
        type="button"
        :title="t('compare.revealIcon')"
        :aria-label="t('compare.revealIcon')"
        :style="{ backgroundImage: `url('${mosaic}')` }"
        @click="toggleReveal('icon')"
      />
      <button
        v-else-if="showIcon && revealed.has('icon') && props.side.anonymizeIcon === true"
        class="side-head__logo side-head__logo--reveal"
        type="button"
        :title="t('compare.hideIcon')"
        :aria-label="t('compare.hideIcon')"
        @click="toggleReveal('icon')"
      >
        <ToolIcon
          :name="displayName"
          :color="tool.color"
          :icon-asset-id="iconAssetId"
          :logo-key="tool.builtinKey ?? tool.id"
          :size="72"
        />
      </button>
      <ToolIcon
        v-else-if="showIcon"
        class="side-head__logo"
        :name="displayName"
        :color="tool.color"
        :icon-asset-id="iconAssetId"
        :logo-key="tool.builtinKey ?? tool.id"
        :size="72"
      />

      <div v-if="hasText" class="side-head__text">
        <p class="side-head__line">
          <!-- 名称匿名：文字变成黑框，点一下显现、再点一下遮回去 -->
          <button
            v-if="showName && props.side.anonymizeName === true"
            class="side-head__mask"
            :class="{ 'side-head__mask--hidden': nameHidden }"
            type="button"
            :title="nameHidden ? t('compare.revealName') : t('compare.hideName')"
            :aria-label="nameHidden ? t('compare.revealName') : t('compare.hideName')"
            @click="toggleReveal('name')"
          >
            {{ displayName }}
          </button>
          <span v-else-if="showName" class="side-head__name">{{ displayName }}</span>

          <!-- 版本紧随名称之后，而不是另起一行 -->
          <template v-if="showVersion && versionLabel">
            <button
              v-if="props.side.anonymizeVersion === true"
              class="side-head__mask side-head__mask--version"
              :class="{ 'side-head__mask--hidden': versionHidden }"
              type="button"
              :title="versionHidden ? t('compare.revealVersion') : t('compare.hideVersion')"
              :aria-label="versionHidden ? t('compare.revealVersion') : t('compare.hideVersion')"
              @click="toggleReveal('version')"
            >
              {{ versionLabel }}
            </button>
            <span v-else class="side-head__version">{{ versionLabel }}</span>
          </template>
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

/* ——————————————————————————————————————————————————————————
 * 匿名处理
 *
 * 遮住时是一个**纯黑块**（用户要求"文字变成黑框"）：文字仍然在 DOM 里
 * （因此宽度、行高、排版与未遮住时完全一致，不会因为打码把版式挤变形），
 * 只是被 `color: transparent` 藏起来。用 `::selection` 也一并禁用，
 * 否则拖选仍然能把内容复制出去——那就白遮了。
 * ————————————————————————————————————————————————————————— */

.side-head__mask {
  font: inherit;
  color: transparent;
  cursor: pointer;
  background: #000;
  border: none;
  border-radius: var(--radius-xs);
  padding: 0 2px;
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.side-head__mask--version {
  font-family: var(--font-mono);
  font-size: calc(var(--fs-sm) * var(--version-scale, 1));
}

.side-head__mask--hidden {
  user-select: none;
}

.side-head__mask:not(.side-head__mask--hidden) {
  /* 显现态：去掉黑底、恢复文字色，让"这一刻是露出来的"一眼可辨 */
  color: inherit;
  background: var(--accent-soft);
}

.side-head__mask:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}

/*
 * LOGO 的马赛克块。尺寸与正常 LOGO 完全一致（72px），
 * 这样打码不会让左右两栏的头部高度发生变化。
 */
.side-head__logo--masked {
  display: block;
  padding: 0;
  cursor: pointer;
  background-color: transparent;
  background-repeat: repeat;
  background-size: 16px 16px;
  border: none;
  border-radius: var(--radius-sm);
}

.side-head__logo--reveal {
  display: block;
  padding: 0;
  cursor: pointer;
  background: var(--accent-soft);
  border: none;
  border-radius: var(--radius-sm);
}
</style>
