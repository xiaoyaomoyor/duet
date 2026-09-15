<script setup lang="ts">
/**
 * 富文本编辑器
 *
 * 实现取舍：用 contenteditable + document.execCommand。
 *   execCommand 已被标记为废弃，但它是唯一**零依赖**能立刻拿到
 *   "加粗/斜体/列表"的办法，且所有浏览器仍然支持。
 *   换 Slate/ProseMirror 会让包体积增加数百 KB，与性能预算冲突。
 *   这里只在"用户点按钮"时调用它，不依赖它的选区管理细节。
 *
 * 安全：每次输入后都对内容做白名单净化，粘贴进来的脚本标签会被丢弃。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { sanitizeHtml } from '@/lib/sanitize'
import type { ModuleEditorProps } from '../types'
import type { RichTextData } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()

const editor = ref<HTMLElement | null>(null)

const data = computed<RichTextData>(() => {
  const raw = props.module.data as Partial<RichTextData> | undefined
  return { html: typeof raw?.html === 'string' ? raw.html : '' }
})

onMounted(() => {
  if (editor.value) editor.value.innerHTML = sanitizeHtml(data.value.html)
})

/**
 * 外部内容变化时同步到 DOM，但**聚焦期间不同步**：
 * 那会在每次输入后重写 innerHTML，导致光标跳到开头（contenteditable 的经典坑）。
 */
watch(
  () => data.value.html,
  (html) => {
    const el = editor.value
    if (!el) return
    if (document.activeElement === el) return
    if (el.innerHTML !== html) el.innerHTML = sanitizeHtml(html)
  },
)

/** 只在获得焦点时同步 DOM → 数据，避免光标被打断 */
function onInput(): void {
  const el = editor.value
  if (!el) return
  props.patchData({ html: sanitizeHtml(el.innerHTML) })
}

function exec(command: string, value?: string): void {
  if (props.readonly) return
  editor.value?.focus()
  try {
    document.execCommand(command, false, value)
  } catch {
    // 少数环境不支持某个命令时忽略，不阻断编辑
  }
  onInput()
}

const tools = [
  { command: 'bold', icon: 'text', labelKey: 'richText.bold' },
  { command: 'italic', icon: 'text', labelKey: 'richText.italic' },
  { command: 'underline', icon: 'text', labelKey: 'richText.underline' },
  { command: 'insertUnorderedList', icon: 'divider', labelKey: 'richText.bulletList' },
  { command: 'insertOrderedList', icon: 'divider', labelKey: 'richText.numberedList' },
  { command: 'removeFormat', icon: 'close', labelKey: 'richText.clearFormat' },
]
</script>

<template>
  <div class="rt">
    <div v-if="!readonly" class="rt__toolbar">
      <button
        v-for="tool in tools"
        :key="tool.command"
        class="rt__tool"
        type="button"
        :title="t(tool.labelKey)"
        :aria-label="t(tool.labelKey)"
        @mousedown.prevent
        @click="exec(tool.command)"
      >
        <AppIcon :name="tool.icon" :size="13" />
      </button>
    </div>

    <!--
      contenteditable 的元素**不能**用 v-html 绑定内容：
      那会在每次输入后重写 innerHTML，导致光标跳到开头。
      因此这里只在挂载时写入初始内容（见下方 onMounted）。
    -->
    <div
      ref="editor"
      class="rt__area"
      :contenteditable="!readonly"
      :data-placeholder="t('richText.placeholder')"
      @input="onInput"
      @blur="onInput"
    />
  </div>
</template>

<style scoped>
.rt {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.rt__toolbar {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}

.rt__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  color: var(--text-muted);
  border-radius: var(--radius-xs);
}

.rt__tool:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.rt__area {
  min-height: 72px;
  padding: var(--sp-3);
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  outline: none;
}

.rt__area:empty::before {
  color: var(--text-disabled);
  content: attr(data-placeholder);
}

.rt__area :deep(ul),
.rt__area :deep(ol) {
  padding-left: var(--sp-5);
  list-style: disc;
}

.rt__area :deep(ol) {
  list-style: decimal;
}
</style>
