<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Project } from '@/types/project'
import type {
  ComparisonContent,
  ContentSelection,
  PresentationScene,
  PresentationStep,
} from '@/types/presentation'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { deepClone } from '@/lib/clone'
import { uuid } from '@/lib/id'
import { addCase, copySample, deleteSample } from '@/services/comparisonEditing'
import { defaultSelection } from '@/services/comparisonContent'
import { importFiles } from '@/services/assetService'
import SampleArtwork from './SampleArtwork.vue'
import ParticipantManager from './ParticipantManager.vue'
import DButton from '@/components/design/DButton.vue'
const props = defineProps<{
  project: Project
  selection: ContentSelection
  sceneId: string
  initialTab?: 'works' | 'story' | 'participants'
}>()
const emit = defineEmits<{
  select: [selection: ContentSelection]
  scene: [id: string]
  close: []
}>()
const store = useProjectStore(),
  ui = useUiStore()
const tab = ref<'works' | 'story' | 'participants'>(props.initialTab ?? 'works'),
  participantId = ref(props.project.sheet.sides[0].id)
watch(
  () => props.initialTab,
  (value) => {
    if (value) tab.value = value
  },
)
const content = computed(() => props.project.comparison!)
const item = computed(() => content.value.cases.find((c) => c.id === props.selection.caseId)!)
const entry = computed(
  () => item.value.entries[participantId.value] ?? { samples: [], defaultSampleId: null },
)
watch(
  () => props.project.sheet.sides,
  (sides) => {
    if (!sides.some((p) => p.id === participantId.value)) participantId.value = sides[0].id
  },
)
const sample = computed(() =>
  entry.value.samples.find((s) => s.id === props.selection.samples[participantId.value]),
)
const scene = computed(() => content.value.scenes.find((s) => s.id === props.sceneId))
const search = ref('')
const matchingSamples = computed(() =>
  entry.value.samples.filter((s) =>
    s.title.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
  ),
)
const busy = ref(false),
  pendingDelete = ref(false),
  pendingCaseDelete = ref(false)
watch(
  () => [props.selection.caseId, participantId.value, props.selection.samples[participantId.value]],
  () => {
    pendingDelete.value = false
    pendingCaseDelete.value = false
    search.value = ''
  },
)
function edit(fn: (c: ComparisonContent) => void, label: string) {
  const c = deepClone(content.value)
  fn(c)
  const result = store.dispatch({ t: 'comparison/replace', content: c }, { label })
  if (!result.ok) ui.notify(result.error, 'danger')
  return result.ok
}
function field(target: 'case' | 'sample', key: string, value: string | boolean) {
  edit((c) => {
    const a = c.cases.find((v) => v.id === item.value.id)!
    const record =
      target === 'case'
        ? a
        : a.entries[participantId.value]!.samples.find((v) => v.id === sample.value?.id)
    if (record) Object.assign(record, { [key]: value })
  }, '修改作品信息')
}
function newCase() {
  let selection: ContentSelection | undefined
  edit((c) => {
    const a = addCase(c, item.value)
    selection = defaultSelection(c, a.id)
  }, '添加测试题')
  if (selection) emit('select', selection)
}
function removeCase() {
  const id = item.value.id
  if (content.value.cases.length < 2) return
  edit((c) => {
    c.cases = c.cases.filter((a) => a.id !== id)
    c.scenes = c.scenes.filter((s) => s.caseId !== id)
    c.combinations = c.combinations.filter((s) => s.caseId !== id)
  }, '删除测试题及引用')
  pendingCaseDelete.value = false
  const remaining = content.value.cases.find((c) => c.id !== id)
  if (remaining) emit('select', defaultSelection(content.value, remaining.id))
}
function addSample(blank: boolean) {
  let id = ''
  edit(
    (c) => {
      const e = c.cases.find((v) => v.id === item.value.id)!.entries[participantId.value]!
      const source = sample.value ?? e.samples[0]
      const s = source
        ? copySample(source, blank)
        : { id: uuid(), title: '新作品', conditions: '', hidden: false, contentBySection: {} }
      id = s.id
      e.samples.push(s)
      if (!e.defaultSampleId) e.defaultSampleId = id
    },
    blank ? '添加作品' : '复制作品',
  )
  emit('select', {
    ...props.selection,
    samples: { ...props.selection.samples, [participantId.value]: id },
  })
}
function removeSample() {
  if (!sample.value) return
  edit(
    (c) => deleteSample(c, item.value.id, participantId.value, sample.value!.id),
    '删除作品及引用',
  )
  pendingDelete.value = false
  emit('select', {
    ...props.selection,
    samples: { ...props.selection.samples, [participantId.value]: null },
  })
}
async function importBatch(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  const projectId = props.project.id,
    caseId = item.value.id,
    p = participantId.value
  busy.value = true
  let importedId = ''
  try {
    const results = await importFiles(Array.from(input.files))
    if (props.project.id !== projectId || !content.value.cases.some((c) => c.id === caseId)) return
    edit((c) => {
      const a = c.cases.find((c) => c.id === caseId)!,
        e = a.entries[p]!
      for (const result of results) {
        if (!result.ok) {
          ui.notify(result.error, 'danger')
          continue
        }
        const asset = result.value
        const s = e.samples[0]
          ? copySample(e.samples[0], true)
          : { id: uuid(), title: '', hidden: false, conditions: '', contentBySection: {} }
        s.title = asset.name.replace(/\.[^.]+$/, '')
        let section = a.sections.find(
          (r) =>
            r.kind === 'paired' &&
            e.samples.some((s) =>
              s.contentBySection[r.id]?.modules.some((m) => m.type !== 'title'),
            ),
        )
        const suitable = a.sections.find((r) =>
          e.samples.some((s) =>
            s.contentBySection[r.id]?.modules.some((m) => m.type === asset.kind),
          ),
        )
        section = suitable ?? section
        if (!section) {
          section = { id: uuid(), kind: 'paired', label: '作品', collapsed: false }
          a.sections.push(section)
          c.scenes.push({
            id: uuid(),
            title: '作品',
            caseId: a.id,
            sectionId: section.id,
            hidden: false,
            samples: {},
            steps: [],
          })
        }
        s.contentBySection[section.id] = {
          hidden: false,
          modules: [
            {
              id: uuid(),
              type: asset.kind,
              title: '',
              hidden: false,
              props: {},
              data: { assetId: asset.id, name: asset.name },
            },
          ],
        }
        e.samples.push(s)
        importedId ||= s.id
        e.defaultSampleId ??= s.id
      }
    }, '批量导入作品')
    if (importedId && props.selection.caseId === caseId && participantId.value === p)
      emit('select', { caseId, samples: { ...props.selection.samples, [p]: importedId } })
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : '素材导入失败，请重试。', 'danger')
  } finally {
    busy.value = false
    input.value = ''
  }
}
function patchScene(fn: (s: PresentationScene) => void) {
  edit((c) => {
    const s = c.scenes.find((s) => s.id === scene.value?.id)
    if (s) fn(s)
  }, '编排场景')
}
function addStep(kind: PresentationStep['kind']) {
  const p = participantId.value,
    sampleId = props.selection.samples[p]
  if (kind === 'sample' && !sampleId) return
  patchScene((s) =>
    s.steps.push(
      kind === 'sample'
        ? { id: uuid(), kind, participantId: p, sampleId: sampleId! }
        : { id: uuid(), kind, participantId: p },
    ),
  )
}
</script>
<template>
  <aside class="collection" aria-label="作品库">
    <header>
      <span class="d-kicker">LIBRARY / 作品库</span
      ><DButton compact tone="quiet" @click="emit('close')">关闭</DButton>
    </header>
    <div class="collection__tabs">
      <button :aria-pressed="tab === 'works'" @click="tab = 'works'">测试题与作品</button
      ><button :aria-pressed="tab === 'story'" @click="tab = 'story'">当前页步骤</button>
      <button :aria-pressed="tab === 'participants'" @click="tab = 'participants'">对比对象</button>
    </div>
    <template v-if="tab === 'works'">
      <label class="d-field"
        >测试题名称<input
          class="d-input"
          :value="item.title"
          @change="field('case', 'title', ($event.target as HTMLInputElement).value)"
      /></label>
      <label class="d-field"
        >共同条件<textarea
          class="d-input"
          rows="3"
          :value="item.conditions"
          placeholder="所有参评工具共用的提示词、设置或限制"
          @change="field('case', 'conditions', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
      <DButton compact @click="newCase">新建测试题</DButton>
      <DButton
        v-if="content.cases.length > 1"
        compact
        tone="quiet"
        @click="pendingCaseDelete = !pendingCaseDelete"
        >删除本题…</DButton
      >
      <div v-if="pendingCaseDelete" class="collection__notice">
        本题的作品、场景和组合将一起删除。可撤销。<DButton compact tone="danger" @click="removeCase"
          >删除测试题及引用</DButton
        >
      </div>
    </template>
    <ParticipantManager v-if="tab === 'participants'" :project="project" />
    <label v-if="tab !== 'participants'" class="d-field"
      >参评工具<select v-model="participantId" class="d-input">
        <option v-for="(p, n) in project.sheet.sides" :key="p.id" :value="p.id">
          {{ p.catalogueLabel ?? String.fromCharCode(65 + n) }} ·
          {{ p.labelOverride || (p.toolRef.kind === 'inline' ? p.toolRef.name : p.toolRef.toolId) }}
        </option>
      </select></label
    >
    <template v-if="tab === 'works'">
      <input
        v-if="entry.samples.length > 6"
        v-model="search"
        class="d-input"
        type="search"
        aria-label="搜索作品"
        placeholder="搜索作品"
      />
      <div class="collection__list">
        <button
          v-for="s in matchingSamples"
          :key="s.id"
          :aria-pressed="s.id === sample?.id"
          @click="
            emit('select', {
              ...selection,
              samples: { ...selection.samples, [participantId]: s.id },
            })
          "
        >
          <SampleArtwork :sample="s" /><span>{{ s.title }}</span
          ><small>{{
            s.hidden ? '已隐藏' : s.id === entry.defaultSampleId ? '默认作品' : '作品'
          }}</small>
        </button>
      </div>
      <div class="collection__actions">
        <DButton compact @click="addSample(true)">添加作品</DButton
        ><DButton v-if="sample" compact @click="addSample(false)">复制作品</DButton>
      </div>
      <label class="collection__import"
        >{{ busy ? '正在导入…' : '批量导入音乐 / 图片'
        }}<input
          type="file"
          accept="audio/*,image/*"
          multiple
          :disabled="busy"
          @change="importBatch"
      /></label>
      <template v-if="sample">
        <label class="d-field"
          >作品名称<input
            class="d-input"
            :value="sample.title"
            @change="field('sample', 'title', ($event.target as HTMLInputElement).value)"
        /></label>
        <label class="d-field"
          >本次生成的补充条件<textarea
            class="d-input"
            rows="2"
            :value="sample.conditions"
            @change="field('sample', 'conditions', ($event.target as HTMLTextAreaElement).value)"
          />
        </label>
        <div class="collection__actions">
          <DButton
            compact
            @click="
              edit(
                (c) =>
                  (c.cases.find((a) => a.id === item.id)!.entries[participantId]!.defaultSampleId =
                    sample!.id),
                '设为默认作品',
              )
            "
            >设为默认</DButton
          ><DButton compact @click="field('sample', 'hidden', !sample.hidden)">{{
            sample.hidden ? '恢复显示' : '隐藏作品'
          }}</DButton>
        </div>
        <p v-if="sample.lyricsNeedReview" class="collection__notice">
          音频已更换，请核对这份作品的歌词。<button
            @click="field('sample', 'lyricsNeedReview', false)"
          >
            确认保留歌词
          </button>
        </p>
        <DButton compact tone="danger" @click="pendingDelete = !pendingDelete">删除作品…</DButton>
        <div v-if="pendingDelete" class="collection__notice">
          将删除作品，并清除场景、步骤和组合对它的引用。可撤销。<DButton
            compact
            tone="danger"
            @click="removeSample"
            >删除作品并移除引用</DButton
          >
        </div>
      </template>
      <hr />
      <DButton
        compact
        @click="
          edit(
            (c) =>
              c.combinations.push({
                id: uuid(),
                title: `组合 ${c.combinations.length + 1}`,
                caseId: item.id,
                samples: { ...selection.samples },
              }),
            '保存对比组合',
          )
        "
        >保存当前对比组合</DButton
      >
      <div
        v-for="combo in content.combinations.filter((c) => c.caseId === item.id)"
        :key="combo.id"
        class="collection__actions"
      >
        <button @click="emit('select', { caseId: combo.caseId, samples: { ...combo.samples } })">
          {{ combo.title }}</button
        ><DButton
          compact
          tone="quiet"
          @click="
            edit(
              (c) => (c.combinations = c.combinations.filter((v) => v.id !== combo.id)),
              '删除组合',
            )
          "
          >删除</DButton
        >
      </div>
    </template>
    <template v-else-if="tab === 'story'">
      <p class="collection__hint">
        从左侧选择场景。这里设置当前页的演示步骤；回退会恢复对应状态。
      </p>
      <template v-if="scene"
        ><h3>{{ scene.title || '未命名场景' }}</h3>
        <DButton compact @click="patchScene((s) => (s.samples = { ...selection.samples }))"
          >将当前作品选择存为场景默认</DButton
        >
        <ol class="collection__steps">
          <li v-for="(step, n) in scene.steps" :key="step.id">
            <span
              >{{
                { reveal: '显示内容', focus: '聚焦工具', sample: '切换作品', identity: '揭示身份' }[
                  step.kind
                ]
              }}
              ·
              {{
                project.sheet.sides.find((p) => p.id === step.participantId)?.catalogueLabel ??
                String.fromCharCode(
                  65 + project.sheet.sides.findIndex((p) => p.id === step.participantId),
                )
              }}</span
            ><button
              @click="
                patchScene((s) => {
                  const step = s.steps.splice(n, 1)[0]!
                  s.steps.splice(Math.max(0, n - 1), 0, step)
                })
              "
            >
              ↑</button
            ><button @click="patchScene((s) => s.steps.splice(n, 1))">删除</button>
          </li>
        </ol>
        <div class="collection__actions">
          <DButton compact @click="addStep('reveal')">＋显示内容</DButton
          ><DButton compact @click="addStep('focus')">＋聚焦工具</DButton
          ><DButton compact @click="addStep('sample')">＋当前作品</DButton
          ><DButton compact @click="addStep('identity')">＋揭示身份</DButton>
        </div>
      </template>
    </template>
  </aside>
</template>
<style scoped>
.collection {
  position: absolute;
  z-index: 30;
  inset: 0 0 0 auto;
  width: min(380px, 100%);
  padding: 22px;
  overflow: auto;
  background: var(--d-surface);
  border-left: 1px solid var(--d-line);
  box-shadow: -20px 0 60px #0002;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.collection header,
.collection__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.collection > * {
  flex-shrink: 0;
}
.collection__tabs {
  display: flex;
  border-bottom: 1px solid var(--d-line);
}
.collection__tabs button {
  flex: 1;
  padding: 12px 4px;
  color: var(--d-muted);
  border-bottom: 2px solid transparent;
}
.collection__tabs button[aria-pressed='true'] {
  color: var(--d-text);
  border-color: var(--d-accent);
}
.collection__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow: auto;
}
.collection__list button {
  display: flex;
  gap: 12px;
  text-align: left;
  align-items: center;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 6px;
}
.collection__list button[aria-pressed='true'] {
  border-color: var(--d-line);
  background: var(--d-bg);
}
.collection__list span {
  flex: 1;
  overflow-wrap: anywhere;
}
.collection small,
.collection__hint {
  color: var(--d-muted);
  font-size: 12px;
  line-height: 1.7;
}
.collection__import {
  position: relative;
  border: 1px dashed var(--d-line);
  border-radius: 6px;
  padding: 16px;
  text-align: center;
  font-size: 12px;
  cursor: pointer;
}
.collection__import input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  cursor: pointer;
}
.collection__notice {
  padding: 12px;
  background: var(--d-bg);
  line-height: 1.7;
  font-size: 12px;
}
.collection__steps {
  padding-left: 20px;
  font-size: 12px;
}
.collection__steps li {
  padding: 9px 0;
  border-bottom: 1px solid var(--d-line);
}
.collection__steps button {
  margin-left: 10px;
  color: var(--d-muted);
}
.collection textarea {
  resize: vertical;
}
.collection hr {
  border: 0;
  border-top: 1px solid var(--d-line);
  margin: 0;
}
</style>
