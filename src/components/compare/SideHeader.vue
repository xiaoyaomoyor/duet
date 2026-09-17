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
 * 只读态（演示视图 / 导出）不渲染编辑按钮，其余完全一致，
 * 因此"编辑视图看到的样子"确实等于成稿。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolIcon from '@/components/common/ToolIcon.vue'
import { clampScale } from './sideScale'
import { sideTint } from '@/lib/color'
import { useProjectStore } from '@/stores/useProjectStore'
import { useToolsStore } from '@/stores/useToolsStore'
import type { Side } from '@/types/project'

const props = defineProps<{
  side: Side
  readonly?: boolean
  /** 聚光灯「色彩弱化」：没在播放的一侧整体退到后面 */
  dimmed?: boolean
}>()

const { t } = useI18n()
const tools = useToolsStore()
const project = useProjectStore()

const tool = computed(() => tools.resolve(props.side.toolRef))
const displayName = computed(() => props.side.labelOverride ?? tool.value.name)
const anonymousLabel = computed(() => t('compare.anonymousTool', {
  n: Math.max(0, project.current?.sheet.sides.findIndex((side) => side.id === props.side.id) ?? 0) + 1,
}))

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

/** 三个可匿名的字段，连锁模式要一起切 */
const ANON_FIELDS = ['name', 'version', 'icon'] as const
type AnonField = (typeof ANON_FIELDS)[number]

/**
 * 连锁匿名（v0.5.0，在对比配置里开关）。
 *
 * 开启后点任意一处黑框，这一侧的**全部**匿名内容一起显现 / 一起遮回去。
 * 交付演示时很实用：讲到"这是哪家的模型"时一键全部露出来，
 * 讲完再一键全部遮上，不必点三次。
 */
const chainAnonymize = computed(() => project.current?.sheet.layout.chainAnonymize === true)

/** 该侧是否所有被匿名的字段都已经露出来了（连锁模式据此决定"开还是关"） */
const allRevealed = computed(() =>
  ANON_FIELDS.every((field) => !isAnonymized(field) || revealed.value.has(field)),
)

function isAnonymized(field: AnonField): boolean {
  if (field === 'name') return props.side.anonymizeName === true
  if (field === 'version') return props.side.anonymizeVersion === true
  return props.side.anonymizeIcon === true
}

function toggleReveal(field: AnonField): void {
  // 连锁：一次点击切换这一侧的全部匿名内容
  if (chainAnonymize.value) {
    revealed.value = allRevealed.value
      ? new Set()
      : new Set(ANON_FIELDS.filter((item) => isAnonymized(item)))
    return
  }

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
</script>

<template>
  <header class="side-head" :class="{ 'side-head--dimmed': dimmed }" :style="headerStyle"
    :data-side-id="side.id"
    :data-export-name="showName ? (side.anonymizeName ? anonymousLabel : displayName) : ''"
    :data-export-version="showVersion && !side.anonymizeVersion ? versionLabel : ''"
  >
    <!--
      左侧那根 5px 的强调条已经移除（v0.5.7）。
      它是工具卡片还是「画布顶部一张独立卡片」时加的；变成「标题」模块之后，
      模块卡片自己就有一条 border-left: 2px solid var(--accent)——
      两条竖线并排，看着像没对齐的双边框（用户实测反馈：
      「标题模块左侧不要再显示内部的旧的竖线了」）。
      外面那条才是这一层的语义，内部这条属于上一个时代。
    -->

    <div class="side-head__body">
      <!--
        LOGO 的匿名：换成**纯黑块**（v0.5.0 按实测反馈，此前用一张统一的马赛克图）。
        用户要的是"和文字一样的处理"——文字是黑框，图也应该是黑框；
        一整块实心黑既彻底遮住了品牌，也和旁边的黑框看起来是一套东西。
      -->
      <button
        v-if="showIcon && iconHidden"
        data-export-mask="icon"
        class="side-head__logo side-head__logo--masked"
        type="button"
        :title="t('compare.revealIcon')"
        :aria-label="t('compare.revealIcon')"
        @click="toggleReveal('icon')"
      />
      <button
        v-else-if="showIcon && revealed.has('icon') && props.side.anonymizeIcon === true"
        data-export-mask="icon"
        class="side-head__logo side-head__logo--reveal"
        type="button"
        :title="t('compare.hideIcon')"
        :aria-label="t('compare.hideIcon')"
        @click="toggleReveal('icon')"
      >
        <ToolIcon
          :name="displayName"
          :label="side.anonymizeName ? anonymousLabel : displayName"
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
        :label="side.anonymizeName ? anonymousLabel : displayName"
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
            data-export-mask="text"
            :data-export-label="anonymousLabel"
            class="side-head__mask"
            :class="{ 'side-head__mask--hidden': nameHidden }"
            type="button"
            :title="nameHidden ? t('compare.revealName') : t('compare.hideName')"
            :aria-label="nameHidden ? t('compare.revealName') : t('compare.hideName')"
            @click="toggleReveal('name')"
          >
            {{ nameHidden ? anonymousLabel : displayName }}
          </button>
          <span v-else-if="showName" class="side-head__name">{{ displayName }}</span>

          <!-- 版本紧随名称之后，而不是另起一行 -->
          <template v-if="showVersion && versionLabel">
            <button
              v-if="props.side.anonymizeVersion === true"
              data-export-mask="text"
              data-export-label="•••"
              class="side-head__mask side-head__mask--version"
              :class="{ 'side-head__mask--hidden': versionHidden }"
              type="button"
              :title="versionHidden ? t('compare.revealVersion') : t('compare.hideVersion')"
              :aria-label="versionHidden ? t('compare.revealVersion') : t('compare.hideVersion')"
              @click="toggleReveal('version')"
            >
              {{ versionHidden ? '•••' : versionLabel }}
            </button>
            <span v-else class="side-head__version">{{ versionLabel }}</span>
          </template>
        </p>
        <p v-if="showNote && side.note" class="side-head__note">{{ side.note }}</p>
      </div>

      <!--
        编辑入口已经移走（v0.5.0）：工具名卡片现在是一个普通模块，
        改名字/版本/图标统一走模块卡片的编辑按钮 →
        「标题」模块的编辑器（modules/title/TitleEditor.vue）。
        一张卡片两个编辑入口，只会让人猜哪个才是"真的"。
      -->
    </div>
  </header>
</template>

<style scoped>
/*
 * 工具名卡片。
 *
 * v0.5.3：**不再自带卡片外观**（用户："既然标题模块本身就存在模块卡片，
 * 就不要内嵌之前的卡片样式了"）。
 *
 * 它曾经是画布顶部一张独立的卡片，所以有底色、描边、圆角。
 * 变成「标题」模块之后，外面已经有一层 `.u-module-card`（模块卡片），
 * 再画一层就是"卡片里套卡片"——两张边框、两层底色，边界说不清是谁的。
 * 现在它只负责排布：左强调条 + 内容。
 */
.side-head {
  display: flex;
  overflow: hidden;
  background: none;
  border: none;
  border-radius: 0;
}

/* 聚光灯「色彩弱化」：与模块格用完全相同的处理，否则工具头会显得"没跟上" */
.side-head--dimmed {
  opacity: 0.35;
  filter: saturate(0.35);
  transition:
    opacity var(--dur-slow) var(--ease-out),
    filter var(--dur-slow) var(--ease-out);
}

/* 左侧强调条的样式已随元素一并移除（v0.5.7）：外面那条属于模块卡片 */

.side-head__body {
  position: relative;
  display: flex;
  flex: 1;
  gap: var(--sp-4);
  align-items: center;
  min-width: 0;
  /*
   * 内边距收紧（v0.5.5）：外面已经是模块卡片，它自己有 padding，
   * 这里再加一圈就把"标题"撑得比原来的工具名卡片厚一倍。
   */
  padding: var(--sp-2) 0;
  /*
   * **没有自己的底色**（v0.5.5）。
   *
   * 这里曾经铺着一层 `--accent-soft`：那时 `.side-head` 是画布顶部一张
   * 独立卡片，需要自己着色。变成「标题」模块之后，外面已经有模块卡片
   * （`.u-module-card`）铺了同一层色，于是同一块地方叠了两层——
   * 看起来就是"模块卡片里面还有一张卡片"。
   * 用户实测反馈："LOGO 与名称等内容直接出现在模块卡片上就好了，
   * 内部不再需要额外的背景着色。"
   */
  background: none;
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

/* ——————————————————————————————————————————————————————————
 * 匿名处理
 *
 * 遮住时是一个**纯黑块**（用户要求"文字变成黑框"）：文字仍然在 DOM 里
 * （因此宽度、行高、排版与未遮住时完全一致，不会因为打码把版式挤变形），
 * 只是被 `color: transparent` 藏起来。用 `::selection` 也一并禁用，
 * 否则拖选仍然能把内容复制出去——那就白遮了。
 * ————————————————————————————————————————————————————————— */

.side-head__mask {
  padding: 0 2px;
  cursor: pointer;
  background: #000;
  border: none;
  border-radius: var(--radius-xs);
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

/*
 * ⚠️ 字号与字重必须和**未遮住时的那个 span 完全一致**。
 *
 * `<button>` 不会继承兄弟元素的排版：它只从父元素（`.side-head__line`）
 * 继承，而那个父元素的字号是默认正文大小。M9 只写了 `font: inherit`，
 * 于是"匿名之后文字变小了一圈"（实测反馈）。
 * 现在两处显式对齐：名称用名称那套，版本用版本那套。
 */
.side-head__mask {
  font-family: inherit;
  font-size: calc(var(--fs-2xl) * var(--name-scale, 1));
  font-weight: 700;
  line-height: var(--lh-tight);
  color: transparent;
}

.side-head__mask--version {
  font-family: var(--font-mono);
  font-size: calc(var(--fs-sm) * var(--version-scale, 1));
  font-weight: 400;
}

.side-head__mask--hidden {
  user-select: none;
}

/*
 * 显现态：恢复文字色，**背景始终保持透明**。
 *
 * 用户反馈过两次：第一次是"显现后不要出现背景按钮"，第二次是
 * "鼠标悬浮在匿名的文字上不要显示文字的背景色"——连悬停底色也不要。
 * 那就一点都不给：它本来就只是一段文字，鼠标放上去变成可点的样子
 * 反而像那里有个按钮（而那里什么都没有，只有一个"点一下看内容"的约定）。
 * 可点性由 `cursor: pointer` 表达，那已经够了。
 */
.side-head__mask:not(.side-head__mask--hidden) {
  color: inherit;
  background: transparent;
}

.side-head__mask:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}

/*
 * LOGO 的匿名块：与文字黑框同一套语言，只是它是 72×72 的方块。
 *
 * ⚠️ 宽高**必须显式写出来**：这个元素是个 `<button>`，不像 `ToolIcon`
 * 那样自带 `width/height` 属性。M9 漏了这两行，于是它塌成 0×0 ——
 * 表现就是"匿名图片没有变化"（其实渲染了，只是没有面积）。
 */
.side-head__logo--masked {
  flex: none;
  width: 72px;
  height: 72px;
  padding: 0;
  cursor: pointer;
  background: #000;
  border: none;
  border-radius: var(--radius-sm);
}

.side-head__logo--reveal {
  display: block;
  width: 72px;
  height: 72px;
  padding: 0;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
}
</style>
