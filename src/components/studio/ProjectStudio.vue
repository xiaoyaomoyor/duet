<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '@/stores/useProjectStore'
import { useToolsStore } from '@/stores/useToolsStore'
import { useUiStore } from '@/stores/useUiStore'
import { useStagePlayback } from '@/composables/useStagePlayback'
import { resolveComparison, type ResolvedContent } from '@/services/sceneResolver'
import { getModule } from '@/modules/registry'
import { moduleTitle } from '@/i18n/helper'
import type { CellRef, Project } from '@/types/project'
import ProjectScene from './ProjectScene.vue'
import CollectionPanel from './CollectionPanel.vue'
import { defaultSelection, resolveRuntime, projectSelection } from '@/services/comparisonContent'
import type { ComparisonView, ContentSelection, PresentationRuntime } from '@/types/presentation'
import DButton from '@/components/design/DButton.vue'
import ModulePicker from '@/components/editor/ModulePicker.vue'
import ModuleEditorDialog from '@/components/editor/ModuleEditorDialog.vue'
const props = defineProps<{ project: Project }>()
const { t } = useI18n()
const store = useProjectStore(),
  tools = useToolsStore(),
  ui = useUiStore()
const collectionOpen = ref(false),
  help = ref(false),
  focused = ref(false)
const selection = ref<ContentSelection>(defaultSelection(props.project.comparison!))
const presentationSceneId = ref(props.project.comparison!.scenes[0]?.id ?? '')
const runtime = ref<PresentationRuntime | null>(null)
const comparisonView = ref<ComparisonView>('overview')
const referenceId = ref(''),
  targetId = ref(props.project.sheet.sides[0].id)
const viewIds = computed(() => {
  const ids = props.project.sheet.sides.map((s) => s.id)
  const target = ids.includes(targetId.value) ? targetId.value : ids[0]!
  const reference =
    ids.includes(referenceId.value) && referenceId.value !== target
      ? referenceId.value
      : ids.find((id) => id !== target)!
  return comparisonView.value === 'single' ? [target] : [reference, target]
})
function setComparisonView(mode: ComparisonView, id?: string) {
  player.pauseAll()
  pauseMedia()
  if (id) {
    targetId.value = id
    selectedId.value =
      section.value?.entries.find((e) => e.participantId === id)?.contents[0]?.module.id ?? ''
  }
  comparisonView.value = mode
  focused.value = false
}
const sceneDefinition = computed(() =>
  props.project.comparison!.scenes.find((s) => s.id === presentationSceneId.value),
)
const activeSelection = computed(() => {
  const state = present.value && runtime.value ? runtime.value : selection.value
  const item =
    props.project.comparison!.cases.find((c) => c.id === state.caseId) ??
    props.project.comparison!.cases[0]!
  return {
    ...state,
    caseId: item.id,
    samples: Object.fromEntries(
      props.project.sheet.sides.map((p) => [
        p.id,
        Object.hasOwn(state.samples, p.id)
          ? (state.samples[p.id] ?? null)
          : (item.entries[p.id]?.defaultSampleId ?? null),
      ]),
    ),
  }
})
watch(
  () => props.project.sheet.sides,
  (sides) => {
    if (!sides.some((p) => p.id === referenceId.value)) referenceId.value = ''
    if (!sides.some((p) => p.id === targetId.value)) targetId.value = sides[0].id
  },
)
watch(
  () => runtime.value?.focusIds[0],
  (id) => {
    if (id) targetId.value = id
  },
)
const comparison = computed(() =>
  resolveComparison(
    props.project,
    tools.resolve,
    t,
    activeSelection.value,
    present.value && !reading.value && !ui.presentationExport
      ? (runtime.value ?? undefined)
      : undefined,
  ),
)
const playlist = computed(() =>
  props.project.comparison!.scenes.filter(
    (s) =>
      !s.hidden &&
      resolveComparison(
        props.project,
        tools.resolve,
        t,
        resolveRuntime(props.project.comparison!, s.id, s.steps.length),
      ).sections.some((r) => r.id === s.sectionId && r.visible),
  ),
)
const navigationIndex = computed(() =>
  present.value ? playlist.value.findIndex((s) => s.id === presentationSceneId.value) : index.value,
)
const navigationTotal = computed(() =>
  present.value ? playlist.value.length : scenes.value.length,
)
const currentCase = computed(() =>
  props.project.comparison!.cases.find((c) => c.id === activeSelection.value.caseId)!,
)

function chooseSelection(value: ContentSelection) {
  player.pauseAll()
  pauseMedia()
  selectedId.value = ''
  if (present.value && runtime.value)
    runtime.value = { ...runtime.value, ...value, transportState: 'paused' }
  else selection.value = value
}
function chooseCase(id: string) {
  chooseSelection(defaultSelection(props.project.comparison!, id))
  if (present.value) {
    const scene = playlist.value.find((s) => s.caseId === id)
    if (scene) jumpScene(scene.id)
  }
}
function jumpScene(id: string, step = 0) {
  const scene = props.project.comparison!.scenes.find((s) => s.id === id)
  if (!scene) return
  player.pauseAll()
  pauseMedia()
  focused.value = false
  presentationSceneId.value = id
  runtime.value = resolveRuntime(props.project.comparison!, id, step)
  selection.value = { caseId: runtime.value.caseId, samples: { ...runtime.value.samples } }
  sceneId.value = scene.sectionId
}
function restart() {
  const first = playlist.value[0]
  if (first) jumpScene(first.id)
}
function toggleHelp() {
  help.value = !help.value
  player.pauseAll()
  pauseMedia()
}
function toggleFocusView() {
  if (comparison.value.participants.length > 2) {
    setComparisonView(
      comparisonView.value === 'overview' ? 'single' : 'overview',
      runtime.value?.focusIds[0] ?? targetId.value,
    )
    return
  }
  if (!runtime.value?.focusIds.length && comparison.value.participants[0])
    focusParticipant(comparison.value.participants[0].id)
  focused.value = !focused.value
}
function focusParticipant(id: string) {
  targetId.value = id
  player.pauseAll()
  pauseMedia()
  if (runtime.value)
    runtime.value = { ...runtime.value, focusIds: runtime.value.focusIds.includes(id) ? [] : [id] }
}
function toggleSelectedAudio() {
  const p =
    comparisonView.value !== 'overview'
      ? targetId.value
      : (runtime.value?.focusIds[0] ?? comparison.value.participants[0]?.id)
  const content = section.value?.entries
    .find((e) => e.participantId === p)
    ?.contents.find((c) => c.module.type === 'audio' && c.visible)
  if (content) void player.toggle(content.trackId)
}
const player = useStagePlayback()
provide('duet:stage-playback', player)
const projectId = computed(() => props.project.id)
provide('duet:projectId', projectId)
const sceneId = ref(''),
  selectedId = ref(''),
  propertyTab = ref<'content' | 'style'>('content')
const view = ref<'theatre' | 'reading'>('theatre'),
  clean = ref(false),
  expanded = ref(false),
  properties = ref(window.innerWidth > 1450)
const present = computed(() => props.project.ui.mode === 'present')
const section = computed(
  () =>
    comparison.value.sections.find(
      (s) => s.id === (present.value ? sceneDefinition.value?.sectionId : sceneId.value),
    ) ??
    comparison.value.sections.find((s) => !s.identity) ??
    comparison.value.sections[0],
)
const selected = computed(
  () =>
    section.value?.contents.find((c) => c.module.id === selectedId.value) ??
    section.value?.contents[0],
)
const definition = computed(() =>
  selected.value ? getModule(selected.value.module.type) : undefined,
)
const options = computed(() =>
  section.value?.metrics.length
    ? []
    : (definition.value?.options ?? []).filter(
        (option) =>
          selected.value?.module.type !== 'audio' ||
          !['layout', 'showWaveform'].includes(option.key),
      ),
)
const visible = computed(() => comparison.value.sections.filter((s) => s.visible))
const scenes = computed(() =>
  present.value || ui.presentationExport
    ? visible.value
    : comparison.value.sections.filter((s) => !s.identity || s.id === section.value?.id),
)
const index = computed(() => scenes.value.findIndex((s) => s.id === section.value?.id))
const reading = computed(() =>
  ui.presentationExport ? ui.presentationExport === 'report' : view.value === 'reading',
)
const overflowIds = ref(new Set<string>())
const picker = ref<CellRef | null>(null)
const root = ref<HTMLElement | null>(null)
const volume = ref(0.8)
watch(
  activeSelection,
  (v) => {
    store.contentSelection = v
    player.pauseAll()
    pauseMedia()
  },
  { flush: 'sync', immediate: true },
)
watch(
  () => props.project.id,
  () => {
    selection.value = defaultSelection(props.project.comparison!)
    presentationSceneId.value = props.project.comparison!.scenes[0]?.id ?? ''
    runtime.value = null
    sceneId.value = ''
    selectedId.value = ''
    clean.value = false
    comparisonView.value = 'overview'
    referenceId.value = ''
    targetId.value = props.project.sheet.sides[0].id
    overflowIds.value = new Set()
    player.pauseAll()
  },
)
watch(present, (value) => {
  if (ui.presentationExport) return
  if (value) {
    const target =
      playlist.value.find(
        (s) =>
          s.id === presentationSceneId.value &&
          s.caseId === selection.value.caseId &&
          s.sectionId === sceneId.value,
      ) ??
      playlist.value.find(
        (s) => s.caseId === selection.value.caseId && s.sectionId === sceneId.value,
      ) ??
      playlist.value[0]
    if (target) jumpScene(target.id)
  } else {
    runtime.value = null
    focused.value = false
    help.value = false
  }
})
watch(
  () => props.project.comparison,
  (c) => {
    if (!c) return
    if (!c.cases.some((a) => a.id === selection.value.caseId)) selection.value = defaultSelection(c)
    if (runtime.value && !c.scenes.some((s) => s.id === runtime.value!.sceneId)) restart()
  },
)
watch([() => section.value?.id, present, view], () => {
  player.pauseAll()
  pauseMedia()
  selectedId.value = ''
  if (present.value && !section.value?.visible) sceneId.value = visible.value[0]?.id ?? ''
})
watch(
  () => ui.exportOpen,
  (open) => {
    if (open) {
      player.pauseAll()
      pauseMedia()
    }
  },
)
watch(volume, (value) =>
  root.value?.querySelectorAll('audio,video').forEach((el) => {
    ;(el as HTMLMediaElement).volume = value
  }),
)
function onPlay(event: Event) {
  const el = event.target
  if (!(el instanceof HTMLMediaElement)) return
  root.value?.querySelectorAll('audio,video').forEach((other) => {
    if (other !== el) (other as HTMLMediaElement).pause()
  })
  el.volume = volume.value
}
function onVisibility() {
  if (document.hidden) {
    player.pauseAll()
    pauseMedia()
  }
}
function pauseMedia() {
  root.value?.querySelectorAll('audio,video').forEach((el) => (el as HTMLMediaElement).pause())
}
function select(content: ResolvedContent) {
  selectedId.value = content.module.id
  properties.value = true
  player.pauseAll()
}
function next(offset: number) {
  if (present.value && sceneDefinition.value && !ui.presentationExport) {
    const step = runtime.value?.stepIndex ?? 0,
      count = sceneDefinition.value.steps.length
    if (offset > 0 && step < count) {
      jumpScene(presentationSceneId.value, step + 1)
      return
    }
    if (offset < 0 && step > 0) {
      jumpScene(presentationSceneId.value, step - 1)
      return
    }
    const at = playlist.value.findIndex((s) => s.id === presentationSceneId.value)
    const target = playlist.value[at + offset]
    if (target) jumpScene(target.id, offset < 0 ? target.steps.length : 0)
    return
  }
  const item = scenes.value[Math.max(0, Math.min(scenes.value.length - 1, index.value + offset))]
  if (item) sceneId.value = item.id
  pauseMedia()
}
function exit() {
  if (help.value) {
    help.value = false
    return
  }
  if (focused.value || runtime.value?.focusIds.length || comparisonView.value !== 'overview') {
    focused.value = false
    if (runtime.value) runtime.value.focusIds = []
    setComparisonView('overview')
    return
  }
  if (document.fullscreenElement) {
    void document.exitFullscreen()
    return
  }
  if (clean.value) {
    clean.value = false
    return
  }
  store.setMode('edit')
  pauseMedia()
}
async function full() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    ui.notify(t('present.fullscreen'), 'info')
  }
}
function keyboard(event: KeyboardEvent) {
  if (
    !present.value ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    document.querySelector('[aria-modal="true"]')
  )
    return
  if (event.key === 'Escape') {
    event.preventDefault()
    exit()
    return
  }
  if (
    event.target instanceof HTMLElement &&
    event.target.closest('input,textarea,select,button,a,audio,video,[contenteditable]')
  )
    return
  if (help.value && event.key !== '?') return
  if (['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp', ' '].includes(event.key)) {
    event.preventDefault()
    next(['ArrowRight', 'PageDown', ' '].includes(event.key) ? 1 : -1)
  }
  if (event.key === '?') {
    event.preventDefault()
    help.value = !help.value
    player.pauseAll()
    pauseMedia()
  }
  if (help.value) return
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    const s = event.key === 'Home' ? playlist.value[0] : playlist.value.at(-1)
    if (s) jumpScene(s.id)
  }
  if (event.key.toLowerCase() === 'p') {
    event.preventDefault()
    toggleSelectedAudio()
  }
  if (/^[1-6]$/.test(event.key)) {
    const p = comparison.value.participants.find(
      (p) => p.label === String.fromCharCode(64 + Number(event.key)),
    )
    if (p) {
      event.preventDefault()
      focusParticipant(p.id)
    }
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    toggleFocusView()
  }
  if (event.key.toLowerCase() === 'f') {
    event.preventDefault()
    void full()
  }
}
function exclusiveMedia(event: Event) {
  if (!(event.target instanceof HTMLMediaElement)) return
  root.value?.querySelectorAll<HTMLMediaElement>('audio,video').forEach((media) => {
    if (media !== event.target) media.pause()
  })
}
onMounted(() => {
  if (present.value && !runtime.value) restart()
  window.addEventListener('keydown', keyboard)
  document.addEventListener('visibilitychange', onVisibility)
  root.value?.addEventListener('play', exclusiveMedia, true)
})
onBeforeUnmount(() => {
  player.pauseAll()
  pauseMedia()
  store.contentSelection = undefined
  window.removeEventListener('keydown', keyboard)
  document.removeEventListener('visibilitychange', onVisibility)
  root.value?.removeEventListener('play', exclusiveMedia, true)
})
function patchData(patch: Record<string, unknown>) {
  if (selected.value) {
    const result = store.patchModuleData(selected.value.ref, patch)
    if (
      result.ok &&
      selected.value.module.type === 'audio' &&
      ('assetId' in patch || 'sourceUrl' in patch)
    ) {
      const sample = currentCase.value.entries[selected.value.ref.sideId]?.samples.find(
        (s) => s.id === activeSelection.value.samples[selected.value!.ref.sideId],
      )
      if (sample?.lyricsNeedReview)
        ui.notify('音频已更换，请在“作品与流程”核对并确认保留的歌词。', 'info')
    }
  }
}
function patchProps(patch: Record<string, unknown>) {
  if (selected.value)
    store.patchModule(selected.value.ref, { props: { ...selected.value.module.props, ...patch } })
}
function title(value: string) {
  if (selected.value) store.patchModule(selected.value.ref, { title: value })
}
function add(type: string) {
  if (!picker.value) return
  const target = picker.value
  const result = store.addModuleAt(target, type, moduleTitle(type))
  picker.value = null
  if (result.ok) {
    const next = resolveComparison(
      result.value,
      tools.resolve,
      t,
      activeSelection.value,
    ).sections.find((s) => s.id === target.rowId)
    selectedId.value =
      next?.entries.find((e) => e.participantId === target.sideId)?.contents.at(-1)?.module.id ?? ''
  }
}
async function addSection(shared: boolean) {
  const result = shared ? store.insertCommonRowAt(props.project.sheet.rows.length) : store.addRow()
  if (result.ok) {
    sceneId.value = projectSelection(result.value, activeSelection.value).sheet.rows.at(-1)!.id
    await nextTick()
    properties.value = true
  }
}
function toggleSection() {
  if (!section.value) return
  const hide = section.value.contents.some((c) => !c.module.hidden)
  store.dispatchMany(
    section.value.contents.map((c) => ({
      t: 'module/patch' as const,
      ref: c.ref,
      patch: { hidden: hide },
    })),
    { label: t('studio.hideSection') },
  )
}
function theme(value: 'ink' | 'paper') {
  store.patchLayout({ presentation: { enabled: true, theme: value } })
}
</script>
<template>
  <section
    ref="root"
    class="studio"
    :class="{
      'studio--present': present,
      'studio--clean': clean && present,
      'studio--properties': properties && !present,
      'studio--collection': collectionOpen && !present,
    }"
    @play.capture="onPlay"
  >
    <header class="studio__bar no-export" v-show="!clean || !present">
      <div class="studio__project">
        <span class="d-kicker">{{ t('studio.title') }}</span>
        <h1>{{ project.title }}</h1>
        <small role="status">{{
          t(store.saving ? 'compare.saving' : store.dirty ? 'compare.unsaved' : 'compare.saved')
        }}</small>
      </div>
      <div class="studio__actions">
        <template v-if="!present"
          ><DButton
            compact
            icon="undo"
            :disabled="!store.canUndo"
            :aria-label="t('nav.undo')"
            @click="store.undo()" /><DButton
            compact
            icon="redo"
            :disabled="!store.canRedo"
            :aria-label="t('nav.redo')"
            @click="store.redo()"
        /></template>
        <DButton compact :aria-pressed="reading" @click="view = reading ? 'theatre' : 'reading'">{{
          t(reading ? 'studio.preview' : 'studio.reading')
        }}</DButton>
        <DButton
          v-if="!present"
          compact
          :aria-pressed="properties"
          @click="properties = !properties"
          >{{ t('studio.showProperties') }}</DButton
        >
        <DButton
          v-if="!present"
          compact
          :aria-pressed="collectionOpen"
          @click="collectionOpen = !collectionOpen"
          >作品与流程</DButton
        >
        <DButton compact icon="export" @click="ui.openExport()">{{ t('export.menu') }}</DButton>
        <DButton
          v-if="!present"
          compact
          tone="primary"
          icon="present"
          @click="store.setMode('present')"
          >{{ t('studio.present') }}</DButton
        >
        <template v-else
          ><DButton compact @click="clean = true">{{ t('studio.clean') }}</DButton
          ><DButton
            compact
            icon="maximize"
            :aria-label="t('present.fullscreen')"
            @click="full"
          /><DButton compact @click="exit">{{ t('studio.exit') }}</DButton></template
        >
      </div>
    </header>
    <div class="studio__layout">
      <CollectionPanel
        v-if="collectionOpen && !present"
        :project="project"
        :selection="activeSelection"
        :scene-id="presentationSceneId"
        @select="chooseSelection"
        @scene="jumpScene"
        @close="collectionOpen = false"
      />
      <nav v-if="!present" class="studio__outline" :aria-label="t('studio.structure')">
        <h2 class="d-kicker">{{ t('studio.structure') }}</h2>
        <button
          v-for="(s, n) in comparison.sections"
          :key="s.id"
          type="button"
          :aria-current="s.id === section?.id ? 'step' : undefined"
          @click="sceneId = s.id"
        >
          <span>{{ String(n + 1).padStart(2, '0') }}</span
          ><strong>{{ s.identity ? t('studio.identity') : s.title }}</strong
          ><small>{{
            t(
              s.identity
                ? 'studio.identity'
                : s.visible
                  ? 'studio.shown'
                  : s.contents.some((c) => c.module.hidden)
                    ? 'studio.hidden'
                    : 'studio.emptyBadge',
            )
          }}</small>
        </button>
        <div class="studio__outline-add">
          <DButton compact tone="quiet" icon="plus" @click="addSection(false)">{{
            t('studio.addSection')
          }}</DButton
          ><DButton compact tone="quiet" icon="plus" @click="addSection(true)">{{
            t('studio.addShared')
          }}</DButton>
        </div>
        <div class="studio__appearance">
          <label class="d-field"
            >{{ t('studio.theme')
            }}<select
              class="d-input"
              :value="comparison.theme"
              @change="theme(($event.target as HTMLSelectElement).value as 'ink' | 'paper')"
            >
              <option value="ink">{{ t('studio.ink') }}</option>
              <option value="paper">{{ t('studio.paper') }}</option>
            </select></label
          ><DButton compact tone="quiet" @click="theme('ink')">{{ t('studio.restore') }}</DButton
          ><DButton
            v-if="project.sheet.sides.length === 2"
            compact
            tone="quiet"
            @click="
              store.patchLayout({ presentation: { enabled: false, theme: comparison.theme } })
            "
            >{{ t('studio.compatibility') }}</DButton
          >
        </div>
      </nav>
      <main class="studio__stage-scroll" :data-design-theme="comparison.theme">
        <div v-show="!clean && !ui.presentationExport" class="studio__selection no-export">
          <label
            ><span>测试题</span
            ><select
              :value="activeSelection.caseId"
              @change="chooseCase(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="c in project.comparison!.cases" :key="c.id" :value="c.id">
                {{ c.title }}
              </option>
            </select></label
          >
          <template v-for="p in comparison.participants" :key="p.id"
            ><label v-if="(currentCase.entries[p.id]?.samples.length ?? 0) > 1"
              ><span>{{ p.label }}</span
              ><select
                :aria-label="p.label + ' 作品'"
                :value="activeSelection.samples[p.id] ?? ''"
                @change="
                  chooseSelection({
                    caseId: activeSelection.caseId,
                    samples: {
                      ...activeSelection.samples,
                      [p.id]: ($event.target as HTMLSelectElement).value || null,
                    },
                  })
                "
              >
                <option value="">本题未提供样本</option>
                <option
                  v-for="s in currentCase.entries[p.id]?.samples.filter(
                    (s) => !s.hidden || !present,
                  )"
                  :key="s.id"
                  :value="s.id"
                >
                  {{ s.title }}
                </option>
              </select></label
            ></template
          >
          <label v-if="present && playlist.length > 1"
            ><span>场景</span
            ><select
              aria-label="演示场景"
              :value="presentationSceneId"
              @change="jumpScene(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="(s, n) in playlist" :key="s.id" :value="s.id">
                {{ n + 1 }} · {{ s.title || '场景' }}
              </option>
            </select></label
          >
          <DButton v-if="present" compact tone="quiet" @click="restart">重新开始</DButton
          ><DButton v-if="present" compact tone="quiet" @click="toggleHelp">快捷键</DButton>
        </div>
        <div
          v-if="comparison.participants.length > 2 && !clean && !ui.presentationExport"
          class="studio__selection studio__view-controls no-export"
          role="group"
          aria-label="观看方式"
        >
          <DButton
            compact
            tone="quiet"
            :aria-pressed="comparisonView === 'overview'"
            @click="setComparisonView('overview')"
            >全体总览</DButton
          >
          <DButton
            compact
            tone="quiet"
            :aria-pressed="comparisonView === 'pair'"
            @click="setComparisonView('pair')"
            >重点双人</DButton
          >
          <DButton
            compact
            tone="quiet"
            :aria-pressed="comparisonView === 'single'"
            @click="setComparisonView('single')"
            >单项</DButton
          >
          <label
            ><span>固定参照</span
            ><select
              v-model="referenceId"
              aria-label="固定参照"
              @change="setComparisonView(comparisonView)"
            >
              <option value="">不固定</option>
              <option v-for="p in comparison.participants" :key="p.id" :value="p.id">
                {{ p.label }} · {{ p.name }}
              </option>
            </select></label
          >
          <label v-if="comparisonView !== 'overview'"
            ><span>当前对象</span
            ><select
              v-model="targetId"
              aria-label="当前对象"
              @change="setComparisonView(comparisonView)"
            >
              <option v-for="p in comparison.participants" :key="p.id" :value="p.id">
                {{ p.label }} · {{ p.name }}
              </option>
            </select></label
          >
        </div>
        <div
          v-if="help && present"
          class="studio__help no-export"
          role="region"
          aria-label="演示快捷键"
        >
          <strong>演示控制</strong>
          <p>→ / 空格 下一步 · ← 上一步 · Home / End 首尾场景</p>
          <p>P 试听 / 暂停 · 1—6 聚焦工具 · Enter 放大 · F 全屏 · Esc 逐层退出</p>
          <DButton compact @click="help = false">关闭帮助</DButton>
        </div>
        <p v-if="currentCase.conditions && !clean" class="studio__conditions">
          {{ currentCase.conditions }}
        </p>
        <p
          v-if="!present && section && overflowIds.has(section.id) && !reading"
          class="studio__warning no-export"
        >
          {{ t('studio.overflow') }}
        </p>
        <div
          class="studio__canvas"
          :class="{ 'studio__canvas--reading': reading }"
          data-present-root
          data-project-stage
          :data-design-theme="comparison.theme"
        >
          <template v-for="(s, n) in scenes" :key="s.id"
            ><ProjectScene
              v-if="reading || s.id === section?.id"
              v-show="reading ? s.visible : s.id === section?.id"
              :comparison="comparison"
              :section="
                present && !reading && sceneDefinition?.title
                  ? { ...s, title: sceneDefinition.title }
                  : s
              "
              :index="present && !reading ? navigationIndex : n"
              :total="present && !reading ? navigationTotal : scenes.length"
              :reading="reading"
              :view-mode="ui.presentationExport === 'report' ? 'overview' : comparisonView"
              :participant-ids="viewIds"
              :reference-id="referenceId"
              :exporting="!!ui.presentationExport"
              :editing="!present"
              :focus-ids="
                present && !reading && (!ui.presentationExport || ui.presentationCurrentStep)
                  ? (runtime?.focusIds ?? [])
                  : []
              "
              :concealed-ids="
                present && !reading && (!ui.presentationExport || ui.presentationCurrentStep)
                  ? (runtime?.concealedIds ?? [])
                  : []
              "
              :focused="focused && (!ui.presentationExport || ui.presentationCurrentStep)"
              @select="select"
              @inspect="setComparisonView(referenceId ? 'pair' : 'single', $event)"
              @overflow="overflowIds.add($event)"
          /></template>
          <div v-if="present && !visible.length" class="studio__no-content">
            <p>{{ t('studio.incomplete') }}</p>
            <DButton class="no-export" @click="exit">{{ t('studio.exit') }}</DButton>
          </div>
        </div>
        <footer v-if="!reading && scenes.length" class="studio__paging no-export">
          <template v-if="present"
            ><DButton
              v-for="p in comparison.participants"
              :key="p.id"
              compact
              tone="quiet"
              :aria-pressed="runtime?.focusIds.includes(p.id) ?? false"
              @click="focusParticipant(p.id)"
              >聚焦 {{ p.label }}</DButton
            ><DButton compact tone="quiet" @click="toggleFocusView">{{
              focused ? '恢复对照' : '放大'
            }}</DButton></template
          >
          <DButton
            compact
            tone="quiet"
            icon="chevron-left"
            :aria-label="t('studio.previous')"
            :disabled="navigationIndex <= 0 && !runtime?.stepIndex"
            @click="next(-1)"
          /><span
            >{{ Math.max(1, navigationIndex + 1) }} / {{ navigationTotal
            }}<small v-if="present && sceneDefinition?.steps.length">
              · {{ runtime?.stepIndex ?? 0 }} / {{ sceneDefinition.steps.length }} 步</small
            ></span
          ><DButton
            compact
            tone="quiet"
            icon="chevron-right"
            :aria-label="t('studio.next')"
            :disabled="
              navigationIndex >= navigationTotal - 1 &&
              (!present || (runtime?.stepIndex ?? 0) >= (sceneDefinition?.steps.length ?? 0))
            "
            @click="next(1)"
          /><label
            >{{ t('studio.volume')
            }}<input v-model.number="volume" type="range" min="0" max="1" step=".05"
          /></label>
        </footer>
      </main>
      <aside
        v-if="properties && !present && section"
        class="studio__properties"
        :aria-label="t('studio.properties')"
      >
        <label class="d-field"
          >{{ t('studio.sectionName')
          }}<input
            class="d-input"
            :value="section.title"
            @change="store.setRowLabel(section.id, ($event.target as HTMLInputElement).value)"
        /></label>
        <div class="studio__row-actions">
          <DButton
            compact
            tone="quiet"
            icon="chevron-up"
            :aria-label="t('studio.up')"
            @click="
              store.moveRow(
                section.id,
                Math.max(0, comparison.sections.findIndex((s) => s.id === section?.id) - 1),
              )
            "
          /><DButton
            compact
            tone="quiet"
            icon="chevron-down"
            :aria-label="t('studio.down')"
            @click="
              store.moveRow(
                section.id,
                comparison.sections.findIndex((s) => s.id === section?.id) + 1,
              )
            "
          /><DButton
            compact
            tone="quiet"
            :aria-label="t('studio.hideSection')"
            @click="toggleSection"
            >{{ t('studio.hideSection') }}</DButton
          ><DButton
            compact
            tone="danger"
            icon="trash"
            :aria-label="t('studio.deleteSection')"
            @click="store.removeRow(section.id)"
          />
        </div>
        <div class="studio__modules">
          <template v-for="entry in section.entries" :key="entry.participantId"
            ><div
              v-if="!section.shared || entry.contents.length || entry === section.entries[0]"
              class="studio__module-group"
            >
              <h3>
                {{
                  section.shared
                    ? t('studio.shared')
                    : comparison.participants.find((p) => p.id === entry.participantId)?.name ||
                      t('studio.participant')
                }}
              </h3>
              <button
                v-for="c in entry.contents"
                :key="c.module.id"
                class="studio__module-select"
                type="button"
                :aria-pressed="selected?.module.id === c.module.id"
                @click="select(c)"
              >
                {{ c.module.title || moduleTitle(c.module.type)
                }}<small>{{
                  t(
                    c.module.hidden
                      ? 'studio.hidden'
                      : c.visible
                        ? 'studio.shown'
                        : 'studio.emptyBadge',
                  )
                }}</small></button
              ><DButton
                compact
                tone="quiet"
                icon="plus"
                @click="picker = { rowId: section.id, sideId: entry.participantId }"
                >{{ t('studio.addModule') }}</DButton
              >
            </div></template
          >
        </div>
        <template v-if="selected"
          ><div class="studio__property-tabs">
            <button
              v-for="tab in ['content', 'style'] as const"
              :key="tab"
              type="button"
              :aria-pressed="propertyTab === tab"
              @click="propertyTab = tab"
            >
              {{ t(`studio.${tab}`) }}</button
            ><DButton
              compact
              tone="quiet"
              icon="maximize"
              :aria-label="t('studio.expand')"
              @click="expanded = true"
            />
          </div>
          <div v-if="propertyTab === 'content'" class="studio__fields">
            <label class="d-field"
              >{{ t('module.titleLabel')
              }}<input
                class="d-input"
                :value="selected.module.title"
                @change="title(($event.target as HTMLInputElement).value)" /></label
            ><DButton v-if="definition?.editorWide" @click="expanded = true">{{
              t('studio.expand')
            }}</DButton
            ><component
              :is="definition?.editor"
              v-else-if="definition"
              :key="selected.module.id"
              :module="selected.module"
              :side-id="selected.ref.sideId"
              :readonly="false"
              :patch-data="patchData"
              :patch-props="patchProps"
            />
            <p v-else>{{ t('studio.unknown') }}</p>
          </div>
          <div v-else class="studio__fields">
            <label v-for="option in options" :key="option.key" class="d-field"
              >{{ t(option.labelKey)
              }}<select
                v-if="option.type === 'select'"
                class="d-input"
                :value="selected.module.props[option.key] ?? option.default"
                @change="patchProps({ [option.key]: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="item in option.values" :key="String(item.value)" :value="item.value">
                  {{ t(item.labelKey) }}
                </option></select
              ><input
                v-else-if="option.type === 'boolean'"
                type="checkbox"
                :checked="Boolean(selected.module.props[option.key] ?? option.default)"
                @change="
                  patchProps({ [option.key]: ($event.target as HTMLInputElement).checked })
                " /><input
                v-else
                class="d-input"
                :type="option.type === 'number' ? 'number' : 'text'"
                :min="option.min"
                :max="option.max"
                :step="option.step ?? 1"
                :value="selected.module.props[option.key] ?? option.default"
                @change="
                  patchProps({
                    [option.key]:
                      option.type === 'number'
                        ? Number(($event.target as HTMLInputElement).value)
                        : ($event.target as HTMLInputElement).value,
                  })
                " /></label
            ><DButton
              @click="store.patchModule(selected.ref, { props: { ...definition?.defaultProps } })"
              >{{ t('studio.defaults') }}</DButton
            >
          </div>
          <div class="studio__module-actions">
            <DButton
              compact
              @click="store.patchModule(selected.ref, { hidden: !selected.module.hidden })"
              >{{ t(selected.module.hidden ? 'studio.show' : 'studio.hide') }}</DButton
            ><DButton
              compact
              tone="danger"
              :disabled="selected.module.locked"
              @click="store.removeModule(selected.ref)"
              >{{ t('studio.remove') }}</DButton
            >
          </div>
        </template>
      </aside>
    </div>
    <div v-if="clean && present" class="studio__clean-controls no-export">
      <DButton
        compact
        :aria-label="t('studio.previous')"
        icon="chevron-left"
        @click="next(-1)"
      /><DButton
        compact
        :aria-label="t('studio.next')"
        icon="chevron-right"
        @click="next(1)"
      /><DButton compact @click="clean = false">{{ t('showcase.exitClean') }}</DButton
      ><DButton compact @click="exit">{{ t('studio.exit') }}</DButton>
    </div>
    <ModulePicker
      :open="!!picker"
      :scope="section?.shared ? 'common' : 'side'"
      @pick="add"
      @close="picker = null"
    />
    <ModuleEditorDialog
      v-if="selected"
      :open="expanded"
      :module="selected.module"
      :options="options"
      stage
      :side-id="selected.ref.sideId"
      accent="var(--d-accent)"
      @close="expanded = false"
      @patch="store.patchModule(selected.ref, $event)"
      @patch-data="patchData"
      @patch-props="patchProps"
    />
  </section>
</template>
<style scoped>
@media (min-width: 1451px) {
  .studio--collection .studio__layout {
    grid-template-columns: 210px minmax(0, 1fr) 380px;
  }
}
.studio__paging {
  flex-wrap: wrap;
}
:global(body[data-exporting='1'] .studio__canvas) {
  border: 0 !important;
}
.studio__layout {
  position: relative;
}
.studio__selection {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
  width: min(100%, 1400px);
  margin: 0 auto 18px;
}
.studio__selection label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.studio__selection label span {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--d-muted);
}
.studio__selection select {
  max-width: 210px;
  padding: 7px 24px 7px 0;
  border: 0;
  border-bottom: 1px solid var(--d-line);
  border-radius: 0;
  background: transparent;
  color: var(--d-text);
  font-size: 12px;
}
.studio__conditions {
  color: var(--d-muted);
  font-size: 12px;
  line-height: 1.7;
  margin: 0 auto 18px;
  max-width: 1400px;
  white-space: pre-wrap;
}
.studio__help {
  padding: 20px;
  border: 1px solid var(--d-line);
  background: var(--d-surface);
  margin: 0 auto 20px;
  max-width: 900px;
  font-size: 13px;
  line-height: 2;
}
@media (prefers-reduced-motion: reduce) {
  .studio :deep(*) {
    transition: none !important;
  }
}

.studio {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--d-bg);
}
.studio__bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--d-line);
}
.studio__project {
  min-width: 0;
  display: flex;
  gap: 12px;
  align-items: baseline;
  flex-wrap: wrap;
}
.studio__project .d-kicker {
  font-size: 10px;
  width: 100%;
}
.studio__project h1 {
  font-size: 20px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.studio__project small {
  font-size: 11px;
  color: var(--d-muted);
}
.studio__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  flex-shrink: 0;
}
.studio__layout {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  min-height: 0;
  flex: 1;
}
.studio--properties .studio__layout {
  grid-template-columns: 210px minmax(0, 1fr) 320px;
}
.studio__outline {
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 24px 14px;
  border-right: 1px solid var(--d-line);
}
.studio__outline h2 {
  margin: 0 12px 22px;
}
.studio__outline > button {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 6px 10px;
  padding: 16px 12px;
  text-align: left;
  border-radius: 6px;
  color: var(--d-muted);
}
.studio__outline > button[aria-current] {
  color: var(--d-text);
  background: var(--d-surface);
}
.studio__outline > button > span {
  font: 10px var(--d-mono);
  padding-top: 4px;
}
.studio__outline strong {
  font-size: 13px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.studio__outline small {
  grid-column: 2;
  font-size: 10px;
}
.studio__outline-add {
  display: grid;
  gap: 4px;
  border-block: 1px solid var(--d-line);
  margin: 20px 0;
  padding: 12px 0;
}
.studio__appearance {
  display: grid;
  gap: 8px;
  margin-top: auto;
  padding: 12px;
}
.studio__stage-scroll {
  overflow: auto;
  min-width: 0;
  padding: 24px;
  position: relative;
}
.studio__canvas {
  container-type: inline-size;
  max-width: 1600px;
  margin: auto;
  background: var(--d-bg);
  color: var(--d-text);
  border: 1px solid var(--d-line);
}
.studio__canvas--reading {
  max-width: 1280px;
}
.studio__canvas--reading .project-scene + .project-scene {
  border-top: 1px solid var(--d-line);
}
.studio__properties {
  padding: 24px 20px;
  overflow: auto;
  min-width: 0;
  border-left: 1px solid var(--d-line);
  background: var(--d-surface);
}
.studio__properties h3 {
  font-size: 11px;
  font-weight: 500;
  color: var(--d-muted);
  margin-bottom: 12px;
}
.studio__row-actions {
  display: flex;
  justify-content: space-between;
  gap: 2px;
  margin: 8px 0 20px;
}
.studio__modules {
  display: grid;
  gap: 20px;
}
.studio__module-group {
  display: grid;
  gap: 6px;
}
.studio__module-select {
  display: flex;
  text-align: left;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--d-line);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
}
.studio__module-select[aria-pressed='true'] {
  border-color: var(--d-accent);
  background: var(--d-bg);
}
.studio__module-select small {
  font-size: 10px;
  color: var(--d-muted);
}
.studio__property-tabs {
  display: flex;
  align-items: center;
  gap: 16px;
  border-block: 1px solid var(--d-line);
  margin: 22px 0;
  padding: 6px 0;
}
.studio__property-tabs > button {
  padding: 10px 4px;
  font-size: 12px;
  color: var(--d-muted);
}
.studio__property-tabs > button[aria-pressed='true'] {
  color: var(--d-text);
  border-bottom: 2px solid var(--d-accent);
}
.studio__property-tabs > .d-button {
  margin-left: auto;
}
.studio__fields {
  display: grid;
  gap: 22px;
  font-size: 13px;
}
.studio__module-actions {
  display: flex;
  gap: 8px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--d-line);
}
.studio__paging {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  font: 11px var(--d-mono);
}
.studio__paging label {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 11px var(--d-font);
  color: var(--d-muted);
  margin-left: 16px;
}
.studio__paging input {
  width: 72px;
  accent-color: var(--d-accent);
}
.studio__warning {
  font-size: 12px;
  line-height: 1.8;
  color: var(--d-muted);
  margin-bottom: 16px;
}
.studio__no-content {
  padding: 15vh 24px;
  text-align: center;
  display: grid;
  justify-items: center;
  gap: 24px;
}
.studio--present {
  position: fixed;
  inset: 0;
  z-index: 400;
  height: 100dvh;
}
.studio--present .studio__layout {
  display: block;
  overflow: auto;
}
.studio--present .studio__stage-scroll {
  min-height: 100%;
  padding: 24px;
}
.studio--present .studio__canvas {
  width: min(100%, calc((100dvh - 180px) * 16 / 9));
  border: 0;
}
.studio--present .studio__canvas--reading {
  width: 100%;
  max-width: 1280px;
}
.studio--clean .studio__stage-scroll {
  padding: 0;
  min-height: 100dvh;
  display: grid;
  align-content: center;
}
.studio--clean .studio__canvas {
  width: min(100vw, calc(100dvh * 16 / 9));
  max-width: none;
}
.studio--clean .studio__paging {
  display: none;
}
.studio__clean-controls {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 24px;
  opacity: 0;
  transition: opacity var(--d-fast);
  z-index: 5;
}
.studio__clean-controls:hover,
.studio__clean-controls:focus-within {
  opacity: 1;
}
@media (max-width: 1450px) {
  .studio__layout,
  .studio--properties .studio__layout {
    grid-template-columns: 165px minmax(0, 1fr);
  }
  .studio__properties {
    position: absolute;
    right: 0;
    top: 100px;
    bottom: 0;
    z-index: 8;
    width: 340px;
    box-shadow: var(--d-shadow);
  }
  .studio__bar {
    padding: 14px 20px;
  }
  .studio__project h1 {
    font-size: 17px;
  }
  .studio__stage-scroll {
    padding: 18px;
  }
  .studio__project .d-kicker {
    display: none;
  }
}
@media (max-width: 700px) {
  .studio__bar {
    flex-wrap: wrap;
    gap: 12px;
  }
  .studio__actions {
    justify-content: flex-start;
    max-width: 100%;
  }
  .studio__layout,
  .studio--properties .studio__layout {
    display: flex;
    flex-direction: column;
    overflow: auto;
  }
  .studio__outline {
    flex: none;
    padding: 10px;
    border: 0;
    border-bottom: 1px solid var(--d-line);
    flex-direction: row;
    gap: 8px;
  }
  .studio__outline > button {
    min-width: 140px;
  }
  .studio__outline h2,
  .studio__outline-add,
  .studio__appearance {
    display: none;
  }
  .studio__stage-scroll {
    overflow: visible;
    padding: 12px;
    flex: 1;
  }
  .studio__properties {
    top: 130px;
    width: min(100%, 360px);
  }
  .studio__canvas {
    border: 0;
  }
  .studio--present .studio__canvas {
    width: 100%;
  }
  .studio--present .studio__stage-scroll {
    padding: 0;
  }
  .studio__paging label {
    margin-left: 0;
  }
  .studio__paging {
    flex-wrap: wrap;
  }
  .studio__clean-controls {
    padding: 12px;
  }
}
</style>
