<script setup lang="ts">
/**
 * 模块卡片（编辑视图）
 *
 * 设计（M6 起，按用户实测反馈重做）：
 *   卡片**就是最终效果**——内容和展示视图完全一致，因为两边用的是同一个
 *   `ModuleView`。编辑视图额外提供的只有右上角的四个按钮
 *   （编辑 / 隐藏 / 复制 / 删除）与左侧拖拽手柄，它们悬浮在内容之上，
 *   不占据版式空间，所以"编辑视图看到的样子"确实等于"成稿的样子"。
 *
 * 为什么把编辑器搬进弹窗：
 *   原先卡片里同时塞了编辑器 + 预览两块，等于每张卡片都要两倍高度，
 *   而且用户得在脑子里把"输入框里的内容"映射成"预览里的样子"。
 *   现在卡片直接呈现结果，需要改细节时再打开弹窗——
 *   版式立刻清爽，且所见即所得。
 *
 * 拖动方式（M8 按用户实测反馈改）：
 *   去掉左侧那个悬浮才出现的拖拽手柄，改为**整张卡片的空白处都可以拖**。
 *   手柄的问题是它又小又只在悬浮时出现，用户根本不知道那里能抓；
 *   而卡片本来就是一块独立的、可排序的东西，直接拖它才符合直觉。
 *   卡片内部的按钮 / 输入框 / 链接由 SortableJS 的 filter 排除，不会误触发。
 *
 * 空模块例外：内容为空时没有东西可渲染，卡片会退化成"点击填写"的虚线框，
 * 否则用户将面对一个看不见也点不到的卡片。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import ModuleView from '@/components/compare/ModuleView.vue'
import ModuleEditorDialog from './ModuleEditorDialog.vue'
import { getModule } from '@/modules/registry'
import { isModuleEmpty } from '@/modules/visibility'
import type { ModuleInstance, SideId } from '@/types/project'

const props = defineProps<{
  module: ModuleInstance
  sideId: SideId
  accent: string
  /** 编辑器是否为只读（展示视图复用同一张卡片时用） */
  readonly?: boolean
  /** 是否显示拖拽手柄（展示视图不显示） */
  draggable?: boolean
  /** 子序号（2.1 / 2.2），由 CanvasRow 算好后透传给 ModuleView */
  number?: string | undefined
}>()

const emit = defineEmits<{
  patch: [patch: { title?: string; hidden?: boolean }]
  patchData: [patch: Record<string, unknown>]
  patchProps: [patch: Record<string, unknown>]
  remove: []
  duplicate: []
}>()

const { t } = useI18n()

const definition = computed(() => getModule(props.module.type))
const editing = ref(false)

/**
 * 是否为空模块（**只看内容**，不看用户是否隐藏）。
 *
 * 必须与 `isPresentable` 区分开：隐藏但有内容的模块要照常显示内容，
 * 只是置灰 + 打角标；否则用户会以为自己的内容丢了。
 * 判定本身复用 `isModuleEmpty`，与展示视图同一套逻辑。
 */
const empty = computed(() => isModuleEmpty(props.module))

function forwardData(patch: Record<string, unknown>): void {
  emit('patchData', patch)
}

function forwardProps(patch: Record<string, unknown>): void {
  emit('patchProps', patch)
}
</script>

<template>
  <article class="card" :class="{ 'card--hidden': module.hidden }" :style="{ '--accent': accent }">
    <!-- 右上角操作区：悬浮或键盘聚焦时出现 -->
    <div v-if="!readonly" class="card__actions">
      <button
        class="card__action"
        type="button"
        :title="t('module.edit')"
        :aria-label="t('module.edit')"
        @click="editing = true"
      >
        <AppIcon name="edit" :size="14" />
      </button>
      <button
        class="card__action"
        type="button"
        :title="module.hidden ? t('module.showInPresent') : t('module.hideInPresent')"
        :aria-label="module.hidden ? t('module.showInPresent') : t('module.hideInPresent')"
        :aria-pressed="module.hidden"
        :class="{ 'card__action--on': module.hidden }"
        @click="emit('patch', { hidden: !module.hidden })"
      >
        <AppIcon :name="module.hidden ? 'eye-off' : 'eye'" :size="14" />
      </button>
      <button
        class="card__action"
        type="button"
        :title="t('module.duplicate')"
        :aria-label="t('module.duplicate')"
        @click="emit('duplicate')"
      >
        <AppIcon name="copy" :size="14" />
      </button>
      <button
        class="card__action card__action--danger"
        type="button"
        :title="t('module.remove')"
        :aria-label="t('module.remove')"
        @click="emit('remove')"
      >
        <AppIcon name="trash" :size="14" />
      </button>
    </div>

    <!--
      有内容时走 ModuleView 的默认正文（就是展示视图那套渲染）；
      空模块时用 #body 插槽换成"点击填写"的占位框——
      标题仍然由 ModuleView 渲染，两种状态下的标题结构因此完全一致。
    -->
    <ModuleView
      :module="module"
      :side-id="sideId"
      :accent="accent"
      :number="number"
      :readonly="false"
    >
      <template v-if="empty" #body>
        <button class="card__empty" type="button" :disabled="readonly" @click="editing = true">
          <AppIcon :name="definition?.meta.icon ?? 'text'" :size="15" />
          <span class="card__empty-hint">{{ t('module.clickToFill') }}</span>
        </button>
      </template>
    </ModuleView>

    <span v-if="module.hidden" class="card__flag">{{ t('module.hiddenBadge') }}</span>

    <ModuleEditorDialog
      :open="editing"
      :module="module"
      :side-id="sideId"
      :accent="accent"
      @close="editing = false"
      @patch="(patch) => emit('patch', patch)"
      @patch-data="forwardData"
      @patch-props="forwardProps"
    />
  </article>
</template>

<style scoped>
.card {
  position: relative;
  padding: var(--sp-3);
  /*
   * 整卡可拖：给一个"可以抓"的鼠标指针。
   * 只加在卡片本身，卡片内的按钮/输入框用自己的指针覆盖掉它。
   */
  cursor: grab;
  /*
   * 背景着色与工具卡片（SideHeader）对齐 —— 用户实测反馈：
   * "工具卡片有颜色，下面的模块卡片却是白板，看着不像一套东西"。
   *
   * 两层写法：先铺不透明的 --bg-surface，再叠一层本侧主题色的极淡底。
   * 不能只写 `background: var(--accent-soft)` —— 那是半透明的，
   * 画布底纹会透上来，和工具卡片（它叠在 surface 上）就不是同一个颜色了。
   */
  background-color: var(--bg-surface);
  background-image: linear-gradient(var(--accent-soft), var(--accent-soft));
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--accent, var(--accent-500));
  border-radius: var(--radius-md);
  transition:
    opacity var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.card:active {
  cursor: grabbing;
}

/*
 * 卡片内一切可交互的东西都恢复成"可点"，而不是"可抓"。
 *
 * ⚠️ 这里刻意写 `[contenteditable]` 而**不带值**：导出只读 HTML 时会内联
 * 整份样式表，而 E2E 断言"导出稿里不含 contenteditable"正是按字符串查的
 * （怕富文本编辑器漏进成稿）。带值写会让样式表里出现这个字符串，
 * 断言就会因为一条**样式**而失败。属性存在性判断本来也更准确。
 */
.card button,
.card input,
.card textarea,
.card select,
.card a,
.card [contenteditable] {
  cursor: auto;
}

.card button,
.card a {
  cursor: pointer;
}

/*
 * 空模块的占位框本身就是"点我填写"，整卡可拖之后它必须排除，
 * 否则点击会被当成拖拽的起点。（类名已在 SortableJS 的 filter 里同步排除。）
 */
.card__empty {
  cursor: pointer;
}

.card:hover {
  border-color: var(--border-default);
  border-left-color: var(--accent, var(--accent-500));
}

.card--hidden {
  opacity: 0.55;
}

/* —— 右上角操作区 —— */
/*
 * 只显示图标、**透明底**（用户实测反馈）。
 * 原先它是一块带底色的浮层（--bg-elevated + 描边 + 阴影），
 * 悬浮时像是卡片上贴了一张小票；而卡片本身已经有自己的背景，
 * 再叠一层不透明的浮层就把内容盖住了。现在这几个按钮直接浮在卡片上，
 * 只在各自悬停时给一点点底色作为反馈。
 */
.card__actions {
  position: absolute;
  top: var(--sp-1);
  right: var(--sp-1);
  z-index: 1;
  display: flex;
  gap: 2px;
  /*
   * 默认隐藏、悬浮或键盘聚焦时出现。
   * 用 opacity 而不是 display/visibility：后者会让按钮无法成为
   * Tab 焦点，键盘用户就永远打不开编辑弹窗了。
   */
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}

.card:hover .card__actions,
.card:focus-within .card__actions {
  opacity: 1;
}

.card__action {
  display: flex;
  padding: var(--sp-1);
  color: var(--text-muted);
  border-radius: var(--radius-xs);
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

/*
 * 悬停反馈用"毛玻璃 + 半透明"而不是不透明底色：
 * 这几个按钮浮在任意模块内容之上（可能是图片、代码、表格），
 * 半透明底既能保证图标可读，又不会把底下的内容整块盖掉。
 */
.card__action:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--bg-elevated) 85%, transparent);
  backdrop-filter: blur(2px);
}

.card__action--on,
.card__action--danger:hover {
  color: var(--danger);
}

/* —— 空模块占位 —— */
.card__empty {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  width: 100%;
  padding: var(--sp-4) var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--text-muted);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-sm);
  transition: border-color var(--dur-fast) var(--ease-out);
}

.card__empty:hover:not(:disabled) {
  color: var(--text-secondary);
  border-color: var(--accent, var(--accent-500));
}

.card__empty-hint {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}

.card__flag {
  position: absolute;
  top: var(--sp-1);
  left: var(--sp-3);
  padding: 1px 6px;
  font-size: 10px;
  color: var(--warning);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}
</style>
