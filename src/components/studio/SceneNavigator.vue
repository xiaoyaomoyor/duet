<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { Project } from '@/types/project'
import type { ContentSelection, SceneLayout } from '@/types/presentation'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { deepClone } from '@/lib/clone'
import { uuid } from '@/lib/id'
import { createScene } from '@/services/sceneEditing'
import { resolveComparison } from '@/services/sceneResolver'
import { useToolsStore } from '@/stores/useToolsStore'
import { useI18n } from 'vue-i18n'
import DButton from '@/components/design/DButton.vue'
import DDialog from '@/components/design/DDialog.vue'
import SampleArtwork from './SampleArtwork.vue'
const props = defineProps<{
  project: Project
  selection: ContentSelection
  sceneId: string
  theme: 'ink' | 'paper'
}>()
const emit = defineEmits<{ select: [id: string]; identity: []; appearance: [] }>()
const store = useProjectStore(),
  ui = useUiStore(),
  tools = useToolsStore()
const { t } = useI18n()
const creating = ref(false),
  referencing = ref(false),
  sourceId = ref('')
const content = computed(() => props.project.comparison!)
const item = computed(() => content.value.cases.find((c) => c.id === props.selection.caseId)!)
const scenes = computed(() => content.value.scenes.filter((s) => s.caseId === item.value.id))
const resolved = computed(() => resolveComparison(props.project, tools.resolve, t, props.selection))
const sources = computed(() =>
  item.value.sections.filter((s) => !resolved.value.sections.find((r) => r.id === s.id)?.identity),
)
function works(sectionId: string) {
  return props.project.sheet.sides.slice(0, 2).flatMap((p) => {
    const sample = item.value.entries[p.id]?.samples.find(
      (s) => s.id === props.selection.samples[p.id],
    )
    return sample
      ? [
          {
            ...sample,
            contentBySection: {
              [sectionId]: sample.contentBySection[sectionId] ?? { hidden: false, modules: [] },
            },
          },
        ]
      : []
  })
}
async function add(kind: 'paired' | 'full', layout: SceneLayout = 'general') {
  const draft = deepClone(content.value)
  const scene = createScene(draft, item.value.id, kind, layout)
  const result = store.dispatch({ t: 'comparison/replace', content: draft }, { label: '添加场景' })
  if (!result.ok) return ui.notify(result.error, 'danger')
  creating.value = false
  await nextTick()
  emit('select', scene.id)
}
async function reference() {
  const source = sources.value.find((s) => s.id === sourceId.value)
  if (!source) return
  const draft = deepClone(content.value),
    id = uuid()
  draft.scenes.push({
    id,
    title: source.label || '引用场景',
    caseId: item.value.id,
    sectionId: source.id,
    hidden: false,
    samples: {},
    steps: [],
  })
  const result = store.dispatch(
    { t: 'comparison/replace', content: draft },
    { label: '引用已有内容' },
  )
  if (!result.ok) return ui.notify(result.error, 'danger')
  referencing.value = false
  await nextTick()
  emit('select', id)
}
</script>
<template>
  <nav class="studio__outline scene-nav" aria-label="场景列表">
    <header>
      <h2 class="d-kicker">SCENES / 场景</h2>
      <small>{{ scenes.length }} 页</small>
    </header>
    <button
      v-for="(scene, n) in scenes"
      :key="scene.id"
      class="scene-nav__item"
      :aria-current="scene.id === sceneId ? 'step' : undefined"
      @click="emit('select', scene.id)"
    >
      <span class="scene-nav__preview" :data-kind="scene.layout ?? 'general'" aria-hidden="true">
        <SampleArtwork v-for="sample in works(scene.sectionId)" :key="sample.id" :sample="sample" />
        <i></i><i></i>
      </span>
      <span class="scene-nav__name"
        ><b>{{ String(n + 1).padStart(2, '0') }}</b
        ><strong>{{ scene.title || '未命名场景' }}</strong></span
      >
      <small
        >{{
          scene.hidden
            ? '已隐藏'
            : resolved.sections.find((s) => s.id === scene.sectionId)?.visible
              ? '可演示'
              : '待填写'
        }}<template v-if="content.scenes.filter((s) => s.sectionId === scene.sectionId).length > 1">
          · 共享来源</template
        ></small
      >
    </button>
    <p v-if="!scenes.length" class="scene-nav__hint">从一页试听开始，或自由组合内容。</p>
    <div class="scene-nav__actions">
      <DButton compact icon="plus" @click="creating = true">添加场景</DButton>
      <DButton compact tone="quiet" @click="referencing = true">引用已有内容</DButton>
    </div>
    <footer>
      <DButton compact tone="quiet" @click="emit('identity')">对象资料</DButton>
      <label class="d-field"
        >项目风格<select
          class="d-input"
          aria-label="项目风格"
          :value="theme"
          @change="
            store.dispatch({
              t: 'appearance/set',
              appearance: {
                ...project.appearance,
                theme: ($event.target as HTMLSelectElement).value as 'ink' | 'paper',
              },
            })
          "
        >
          <option value="ink">墨色</option>
          <option value="paper">纸色</option>
        </select></label
      >
      <DButton compact tone="quiet" @click="emit('appearance')">更多外观设置</DButton>
    </footer>
    <DDialog
      :open="creating"
      :theme="theme"
      title="添加场景"
      description="每页内容都可以继续增删和组合。"
      @close="creating = false"
    >
      <div class="scene-nav__choices">
        <button @click="add('paired', 'listening')">
          <strong>并置试听</strong><span>两侧独立音频、封面与作品资料，适合从音乐开始。</span>
        </button>
        <button @click="add('paired')">
          <strong>通用组合</strong><span>自由加入图片、歌词、观察、参数和评分等内容。</span>
        </button>
        <button @click="add('full')">
          <strong>共同内容</strong><span>跨越对象列的命题、条件或结论。</span>
        </button>
      </div>
    </DDialog>
    <DDialog
      :open="referencing"
      :theme="theme"
      title="引用已有内容"
      description="引用页面共享同一份内容。修改来源会同步影响引用它的场景；需要独立修改时使用“复制场景”。"
      @close="referencing = false"
    >
      <label class="d-field"
        >内容来源<select v-model="sourceId" class="d-input">
          <option value="">选择来源</option>
          <option v-for="s in sources" :key="s.id" :value="s.id">
            {{ s.label || '未命名内容' }} ·
            {{ content.scenes.filter((scene) => scene.sectionId === s.id).length }} 个场景
          </option>
        </select></label
      >
      <template #footer
        ><DButton tone="primary" :disabled="!sourceId" @click="reference"
          >建立引用场景</DButton
        ></template
      >
    </DDialog>
  </nav>
</template>
<style scoped>
.scene-nav {
  padding: 22px 14px;
  overflow: auto;
  border-right: 1px solid var(--d-line);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.scene-nav header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0 6px 8px;
}
.scene-nav h2 {
  font-size: 10px;
}
.scene-nav small {
  color: var(--d-muted);
  font-size: 10px;
}
.scene-nav__item {
  padding: 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  text-align: left;
  display: grid;
  gap: 8px;
  flex-shrink: 0;
}
.scene-nav__item:hover {
  background: var(--d-surface);
}
.scene-nav__item[aria-current] {
  border-color: var(--d-accent);
  background: var(--d-surface);
}
.scene-nav__preview {
  min-height: 64px;
  background: var(--d-raised);
  border-radius: 3px;
  padding: 12px 22px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 10px;
}
.scene-nav__preview :deep(.sample-artwork) {
  width: 100%;
  height: 38px;
  border-radius: 1px;
}
.scene-nav__preview i {
  display: block;
  height: 1px;
  background: var(--d-line);
}
.scene-nav__name {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.scene-nav__name b {
  font: 10px var(--d-mono);
  color: var(--d-muted);
}
.scene-nav__name strong {
  font-size: 12px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.scene-nav__hint {
  font-size: 12px;
  line-height: 1.8;
  color: var(--d-muted);
  padding: 14px 6px;
}
.scene-nav__actions,
.scene-nav footer {
  display: grid;
  gap: 8px;
  border-top: 1px solid var(--d-line);
  padding-top: 16px;
}
.scene-nav footer {
  margin-top: auto;
}
.scene-nav footer label {
  font-size: 11px;
}
.scene-nav__choices {
  display: grid;
  gap: 12px;
}
.scene-nav__choices button {
  display: grid;
  gap: 8px;
  text-align: left;
  padding: 20px;
  border: 1px solid var(--d-line);
  border-radius: 8px;
  background: var(--d-bg);
}
.scene-nav__choices button:hover {
  border-color: var(--d-accent);
}
.scene-nav__choices strong {
  font-size: 16px;
  font-weight: 500;
}
.scene-nav__choices span {
  color: var(--d-muted);
  font-size: 13px;
  line-height: 1.8;
}
@media (max-width: 700px) {
  .scene-nav {
    flex-direction: row;
    padding: 10px;
    overflow: auto;
    flex: none;
  }
  .scene-nav header,
  .scene-nav footer,
  .scene-nav__preview {
    display: none;
  }
  .scene-nav__item {
    min-width: 140px;
  }
  .scene-nav__actions {
    min-width: 125px;
    padding: 0;
    border: 0;
  }
}
</style>
