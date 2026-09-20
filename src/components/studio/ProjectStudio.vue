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
import AppearancePanel from './AppearancePanel.vue'
import CollectionPanel from './CollectionPanel.vue'
import { defaultSelection, resolveRuntime } from '@/services/comparisonContent'
import type { ComparisonView, ContentSelection, PresentationRuntime } from '@/types/presentation'
import DButton from '@/components/design/DButton.vue'
import ModulePicker from '@/components/editor/ModulePicker.vue'
import StudioModuleDialog from './StudioModuleDialog.vue'
import SceneNavigator from './SceneNavigator.vue'
import DDialog from '@/components/design/DDialog.vue'
import { deepClone } from '@/lib/clone'
import { duplicateScene, moveScene, removeScene, moduleDestinations } from '@/services/sceneEditing'
import type { ComparisonContent, PresentationScene } from '@/types/presentation'
import '@/styles/studio-editor.css'
const props = defineProps<{ project: Project }>()
const { t } = useI18n()
const store = useProjectStore(),
  tools = useToolsStore(),
  ui = useUiStore()
function togglePanel(panel: 'collection' | 'appearance') {
  if (panel === 'appearance') {
    appearanceOpen.value = !appearanceOpen.value
    collectionOpen.value = false
  } else {
    collectionOpen.value = !collectionOpen.value
    appearanceOpen.value = false
  }
  properties.value = true
}
const appearanceOpen = ref(false)
const collectionOpen = ref(false),
  help = ref(false),
  focused = ref(false)
const selection = ref<ContentSelection>(defaultSelection(props.project.comparison!))
const presentationSceneId = ref(props.project.comparison!.scenes[0]?.id ?? '')
let editContext: {
  selection: ContentSelection
  scene: string
  module: string
  view: 'theatre' | 'reading'
} | null = null
const deleteSceneOpen = ref(false),
  removeSceneContent = ref(false),
  moveModuleOpen = ref(false),
  moveTarget = ref('')
const collectionTab = ref<'works' | 'story' | 'participants'>('works')
function openCollection(tab: 'works' | 'story' | 'participants' = 'works') {
  collectionTab.value = tab
  collectionOpen.value = true
  appearanceOpen.value = false
  properties.value = true
}
function toggleProperties() {
  properties.value = !properties.value
  collectionOpen.value = false
  appearanceOpen.value = false
}
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
const appearanceSceneId = computed(() => presentationSceneId.value)
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
    presentationSceneId.value,
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
  (present.value ? playlist.value : editingScenes.value).findIndex(
    (s) => s.id === presentationSceneId.value,
  ),
)
const navigationTotal = computed(() =>
  present.value ? playlist.value.length : editingScenes.value.length,
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
  else {
    const changedCase = selection.value.caseId !== value.caseId
    selection.value = value
    if (changedCase) {
      const first = props.project.comparison!.scenes.find((s) => s.caseId === value.caseId)
      presentationSceneId.value = first?.id ?? ''
      sceneId.value = first?.sectionId ?? ''
    }
  }
}
function chooseCase(id: string) {
  chooseSelection(defaultSelection(props.project.comparison!, id))
  const scene = (present.value ? playlist.value : props.project.comparison!.scenes).find(
    (s) => s.caseId === id,
  )
  if (scene) jumpScene(scene.id)
}
function jumpScene(id: string, step = 0) {
  const scene = props.project.comparison!.scenes.find((s) => s.id === id)
  if (!scene) return
  player.pauseAll()
  pauseMedia()
  focused.value = false
  presentationSceneId.value = id
  runtime.value = resolveRuntime(props.project.comparison!, id, step)
  if (!present.value) {
    const base =
      selection.value.caseId === scene.caseId
        ? selection.value
        : defaultSelection(props.project.comparison!, scene.caseId)
    selection.value = { ...base, samples: { ...base.samples, ...scene.samples } }
    runtime.value = null
    selectedId.value = ''
  }
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
const sceneId = ref(props.project.comparison!.scenes[0]?.sectionId ?? ''),
  selectedId = ref(''),
  propertyTab = ref<'content' | 'style'>('content')
const view = ref<'theatre' | 'reading'>('theatre'),
  clean = ref(false),
  expanded = ref(false),
  properties = ref(window.innerWidth > 1450)
const present = computed(() => props.project.ui.mode === 'present')
const section = computed(() =>
  comparison.value.sections.find((s) => s.id === sceneDefinition.value?.sectionId),
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
  (definition.value?.options ?? []).filter(
    (option) =>
      selected.value?.module.type !== 'audio' || !['layout', 'showWaveform'].includes(option.key),
  ),
)
const editingScenes = computed(() =>
  props.project.comparison!.scenes.filter((s) => s.caseId === activeSelection.value.caseId),
)
const destinations = computed(() =>
  selected.value
    ? moduleDestinations(props.project, activeSelection.value, selected.value.module.type).filter(
        (d) => d.rowId !== selected.value!.ref.rowId || d.sideId !== selected.value!.ref.sideId,
      )
    : [],
)
const moduleIndex = computed(
  () =>
    section.value?.entries
      .find((e) => e.participantId === selected.value?.ref.sideId)
      ?.contents.findIndex((c) => c.module.id === selected.value?.module.id) ?? -1,
)
const moduleCount = computed(
  () =>
    section.value?.entries.find((e) => e.participantId === selected.value?.ref.sideId)?.contents
      .length ?? 0,
)
const editorContext = computed(() => {
  const entry = section.value?.entries.find((e) => e.participantId === selected.value?.ref.sideId)
  const p = comparison.value.participants.find((p) => p.id === selected.value?.ref.sideId)
  return [
    sceneDefinition.value?.title,
    section.value?.shared ? '共同内容' : p?.name,
    section.value?.shared ? '' : entry?.sampleTitle,
  ]
    .filter(Boolean)
    .join(' / ')
})
const visible = computed(() => comparison.value.sections.filter((s) => s.visible))
const scenes = computed(() => {
  if (!reading.value)
    return section.value
      ? [{ ...section.value, title: sceneDefinition.value?.title || section.value.title }]
      : []
  return editingScenes.value
    .filter((scene) => !scene.hidden)
    .flatMap((scene) => {
      const state = resolveRuntime(props.project.comparison!, scene.id, scene.steps.length)
      const comparison = resolveComparison(
        props.project,
        tools.resolve,
        t,
        state,
        undefined,
        scene.id,
      )
      const source = comparison.sections.find((s) => s.id === scene.sectionId)
      return source?.visible
        ? [{ ...source, sceneId: scene.id, title: scene.title || source.title }]
        : []
    })
})
const reading = computed(() =>
  ui.presentationExport ? ui.presentationExport === 'report' : view.value === 'reading',
)
const overflowIds = ref(new Set<string>())
function onOverflow(id: string, overflowing: boolean) {
  if (overflowing) overflowIds.value.add(id)
  else overflowIds.value.delete(id)
}
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
    editContext = {
      selection: deepClone(selection.value),
      scene: presentationSceneId.value,
      module: selectedId.value,
      view: view.value,
    }
    if (target) jumpScene(target.id)
  } else {
    runtime.value = null
    focused.value = false
    help.value = false
    clean.value = false
    if (editContext) {
      const context = editContext
      jumpScene(context.scene)
      selection.value = context.selection
      view.value = context.view
      void nextTick(() => {
        selectedId.value = context.module
      })
      editContext = null
    }
  }
})
watch(
  () => props.project.comparison,
  (c) => {
    if (!c) return
    if (!c.cases.some((a) => a.id === selection.value.caseId)) selection.value = defaultSelection(c)
    if (!c.scenes.some((s) => s.id === presentationSceneId.value)) {
      const fallback = c.scenes.find((s) => s.caseId === selection.value.caseId) ?? c.scenes[0]
      if (fallback) jumpScene(fallback.id)
      else {
        presentationSceneId.value = ''
        sceneId.value = ''
        selectedId.value = ''
      }
    }
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
  if (content.ref.rowId !== section.value?.id) {
    const scene = editingScenes.value.find((s) => s.sectionId === content.ref.rowId)
    if (scene) jumpScene(scene.id)
  }
  selectedId.value = content.module.id
  properties.value = true
  collectionOpen.value = false
  appearanceOpen.value = false
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
  const item =
    editingScenes.value[
      Math.max(0, Math.min(editingScenes.value.length - 1, navigationIndex.value + offset))
    ]
  if (item) jumpScene(item.id)
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
        ui.notify('音频已更换，请在作品库核对并确认保留的歌词。', 'info')
    }
  }
}
function patchFor(content: ResolvedContent) {
  const projectId = props.project.id,
    caseId = activeSelection.value.caseId,
    sampleId = activeSelection.value.samples[content.ref.sideId]
  return (patch: Record<string, unknown>) => {
    if (
      props.project.id !== projectId ||
      activeSelection.value.caseId !== caseId ||
      activeSelection.value.samples[content.ref.sideId] !== sampleId ||
      selected.value?.module.id !== content.module.id
    ) {
      ui.notify('编辑位置已改变，未将素材写入其他作品。请回到原作品重试。', 'info')
      return
    }
    patchData(patch)
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
    properties.value = true
    collectionOpen.value = false
    appearanceOpen.value = false
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
function editScene(
  fn: (content: ComparisonContent, scene: PresentationScene) => void,
  label: string,
) {
  const content = deepClone(props.project.comparison!)
  const scene = content.scenes.find((s) => s.id === presentationSceneId.value)
  if (!scene) return false
  fn(content, scene)
  const result = store.dispatch({ t: 'comparison/replace', content }, { label })
  if (!result.ok) ui.notify(result.error, 'danger')
  return result.ok
}
async function copyScene() {
  let id = ''
  if (
    editScene((content) => {
      id = duplicateScene(content, presentationSceneId.value).id
    }, '独立复制场景')
  ) {
    await nextTick()
    jumpScene(id)
  }
}
function deleteScene() {
  editScene(
    (content) => removeScene(content, presentationSceneId.value, removeSceneContent.value),
    '删除场景',
  )
  deleteSceneOpen.value = false
  removeSceneContent.value = false
}
function orderModule(offset: number) {
  if (!selected.value) return
  const result = store.dispatch(
    {
      t: 'module/move',
      from: selected.value.ref,
      to: selected.value.ref,
      toIndex: moduleIndex.value + offset,
    },
    { label: '调整模块顺序' },
  )
  if (!result.ok) ui.notify(result.error, 'danger')
}
async function transferModule() {
  const target = destinations.value[Number(moveTarget.value)]
  if (!selected.value || !target || moveTarget.value === '') return
  const result = store.dispatch(
    { t: 'module/move', from: selected.value.ref, to: target, toIndex: Number.MAX_SAFE_INTEGER },
    { label: '移动模块' },
  )
  if (!result.ok) return ui.notify(result.error, 'danger')
  moveModuleOpen.value = false
  const scene = editingScenes.value.find((s) => s.sectionId === target.rowId)
  if (scene) {
    await nextTick()
    jumpScene(scene.id)
  }
}
function showMoveModule() {
  moveTarget.value = ''
  moveModuleOpen.value = true
}
function openPicker(ref: CellRef) {
  const entry = currentCase.value.entries[ref.sideId]
  if (
    !section.value?.shared &&
    !entry?.samples.some((s) => s.id === activeSelection.value.samples[ref.sideId])
  ) {
    openCollection('works')
    ui.notify('请先为这个对象添加或选择一份作品，再填写内容。', 'info')
    return
  }
  picker.value = ref
}
function editContent(content: ResolvedContent) {
  select(content)
  expanded.value = true
}
</script>
<template>
  <section
    ref="root"
    class="studio"
    :data-design-theme="comparison.theme"
    :class="{
      'studio--present': present,
      'studio--clean': clean && present,
      'studio--properties': properties && !present && !collectionOpen && !appearanceOpen,
      'studio--collection': (collectionOpen || appearanceOpen) && !present,
    }"
    @play.capture="onPlay"
  >
    <header class="studio__bar no-export" v-show="!clean || !present">
      <div class="studio__project">
        <span class="d-kicker">{{ t('studio.title') }}</span>
        <input
          class="studio__title-input"
          aria-label="舞台名称"
          :value="project.title"
          :readonly="present"
          @change="
            store.dispatch({
              t: 'project/patch',
              patch: { title: ($event.target as HTMLInputElement).value },
            })
          "
        />
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
        <DButton v-if="!present" compact :aria-pressed="properties" @click="toggleProperties">{{
          t('studio.showProperties')
        }}</DButton>
        <DButton
          v-if="!present"
          compact
          :aria-pressed="collectionOpen"
          @click="collectionOpen ? (collectionOpen = false) : openCollection()"
          >作品库</DButton
        >
        <DButton
          v-if="!present"
          compact
          :aria-pressed="appearanceOpen"
          @click="togglePanel('appearance')"
          >外观与版式</DButton
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
    <div v-if="store.lastError" role="alert" class="studio__save-error no-export">
      <span>未能保存：{{ store.lastError }}。当前内容仍保留在编辑器中。</span
      ><DButton compact @click="store.flush()">重试保存</DButton>
    </div>
    <div class="studio__layout">
      <AppearancePanel
        v-if="appearanceOpen && !present"
        :project="project"
        :scene-id="appearanceSceneId"
        @scene="jumpScene"
        @close="appearanceOpen = false"
      />
      <CollectionPanel
        v-if="collectionOpen && !present"
        :project="project"
        :selection="activeSelection"
        :scene-id="presentationSceneId"
        :initial-tab="collectionTab"
        @select="chooseSelection"
        @scene="jumpScene"
        @close="collectionOpen = false"
      />
      <SceneNavigator
        v-if="!present"
        :project="project"
        :selection="activeSelection"
        :scene-id="presentationSceneId"
        :theme="comparison.theme"
        @select="jumpScene"
        @identity="openCollection('participants')"
        @appearance="togglePanel('appearance')"
      />
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
          <template v-for="(s, n) in scenes" :key="s.sceneId ?? s.id"
            ><ProjectScene
              v-if="reading || s.id === section?.id"
              v-show="reading ? s.visible : s.id === section?.id"
              :comparison="comparison"
              :section="s"
              :index="!reading ? navigationIndex : n"
              :total="!reading ? navigationTotal : scenes.length"
              :reading="reading"
              :view-mode="ui.presentationExport === 'report' ? 'overview' : comparisonView"
              :participant-ids="viewIds"
              :reference-id="referenceId"
              :exporting="!!ui.presentationExport"
              :editing="!present && !ui.presentationExport"
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
              :selected-id="selected?.module.id"
              @select="select"
              @edit="editContent"
              @add="openPicker"
              @inspect="setComparisonView(referenceId ? 'pair' : 'single', $event)"
              @overflow="onOverflow"
          /></template>
          <div v-if="!section || (present && !playlist.length)" class="studio__no-content">
            <p>{{ present ? t('studio.incomplete') : '从左侧添加一个场景，开始放入你的作品。' }}</p>
            <DButton v-if="present" class="no-export" @click="exit">{{ t('studio.exit') }}</DButton>
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
        v-if="
          properties && !collectionOpen && !appearanceOpen && !present && section && sceneDefinition
        "
        class="studio__properties"
        :aria-label="t('studio.properties')"
      >
        <header class="studio__inspector-head">
          <span class="d-kicker">SCENE / 当前场景</span
          ><DButton
            compact
            tone="quiet"
            icon="close"
            aria-label="关闭属性"
            @click="toggleProperties"
          />
        </header>
        <label class="d-field"
          >场景标题<input
            class="d-input"
            :value="sceneDefinition.title"
            @change="
              editScene((_c, s) => {
                s.title = ($event.target as HTMLInputElement).value
              }, '重命名场景')
            "
        /></label>
        <div class="studio__row-actions">
          <DButton
            compact
            tone="quiet"
            icon="chevron-up"
            aria-label="上移场景"
            :disabled="navigationIndex <= 0"
            @click="editScene((c) => moveScene(c, presentationSceneId, -1), '移动场景')"
          />
          <DButton
            compact
            tone="quiet"
            icon="chevron-down"
            aria-label="下移场景"
            :disabled="navigationIndex >= navigationTotal - 1"
            @click="editScene((c) => moveScene(c, presentationSceneId, 1), '移动场景')"
          />
          <DButton compact tone="quiet" @click="copyScene">复制场景</DButton>
          <DButton
            compact
            tone="quiet"
            @click="
              editScene((_c, s) => {
                s.hidden = !s.hidden
              }, '隐藏场景')
            "
            >{{ sceneDefinition.hidden ? '显示场景' : '隐藏场景' }}</DButton
          >
          <DButton
            compact
            tone="quiet"
            icon="trash"
            aria-label="删除场景"
            @click="deleteSceneOpen = true"
          />
        </div>
        <details class="studio__scene-settings">
          <summary>版式与演示</summary>
          <label class="d-field"
            >场景版式<select
              class="d-input"
              :value="sceneDefinition.layout ?? 'general'"
              @change="
                editScene((_c, s) => {
                  s.layout = ($event.target as HTMLSelectElement).value as 'general' | 'listening'
                }, '修改场景版式')
              "
            >
              <option value="general">通用组合</option>
              <option v-if="!section.shared" value="listening">并置试听</option>
            </select></label
          >
          <p>版式仅调整呈现，已有内容始终保留。</p>
          <DButton compact tone="quiet" @click="openCollection('story')">编辑演示步骤</DButton>
        </details>
        <p
          v-if="project.comparison!.scenes.filter((s) => s.sectionId === section!.id).length > 1"
          class="studio__source-note"
        >
          此内容由多个场景共同引用。内容修改会同步；使用“复制场景”可独立编辑。
        </p>
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
                @click="openPicker({ rowId: section.id, sideId: entry.participantId })"
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
          <div v-if="propertyTab === 'content'" class="studio__fields studio-editor-fields">
            <p class="studio__context">{{ editorContext }}</p>
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
              :patch-data="patchFor(selected)"
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
              :disabled="selected.module.locked"
              @click="store.duplicateModule(selected.ref)"
              >复制模块</DButton
            >
            <DButton
              compact
              icon="chevron-up"
              aria-label="上移模块"
              :disabled="moduleIndex <= 0 || selected.module.locked"
              @click="orderModule(-1)"
            />
            <DButton
              compact
              icon="chevron-down"
              aria-label="下移模块"
              :disabled="moduleIndex >= moduleCount - 1 || selected.module.locked"
              @click="orderModule(1)"
            />
            <DButton
              compact
              :disabled="selected.module.locked || !destinations.length"
              @click="showMoveModule"
              >移动到…</DButton
            >
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
    <DDialog
      :open="deleteSceneOpen"
      :theme="comparison.theme"
      title="删除场景"
      description="默认只移除演示页，内容保留，可通过“引用已有内容”再次使用。此操作可撤销。"
      @close="deleteSceneOpen = false"
    >
      <label class="d-check"
        ><input
          v-model="removeSceneContent"
          type="checkbox"
          :disabled="
            project.comparison!.scenes.filter((s) => s.sectionId === section?.id).length > 1
          "
        />同时删除本页全部作品的内容（仅限没有其他场景引用时）</label
      >
      <template #footer
        ><DButton tone="danger" @click="deleteScene">确认删除场景</DButton></template
      >
    </DDialog>
    <DDialog
      :open="moveModuleOpen"
      :theme="comparison.theme"
      title="移动模块"
      description="移动到同一测试题的兼容位置。内容与素材保留；共享来源的修改会同步到引用页面。"
      @close="moveModuleOpen = false"
    >
      <label class="d-field"
        >目标位置<select v-model="moveTarget" class="d-input">
          <option value="">选择位置</option>
          <option
            v-for="(target, n) in destinations"
            :key="target.rowId + target.sideId"
            :value="String(n)"
          >
            {{ target.label }}
          </option>
        </select></label
      >
      <template #footer
        ><DButton tone="primary" :disabled="moveTarget === ''" @click="transferModule"
          >移动模块</DButton
        ></template
      >
    </DDialog>
    <ModulePicker
      :open="!!picker"
      :scope="section?.shared ? 'common' : 'side'"
      :theme="comparison.theme"
      @pick="add"
      @close="picker = null"
    />
    <StudioModuleDialog
      v-if="selected"
      :open="expanded"
      :module="selected.module"
      :options="options"
      :theme="comparison.theme"
      :context="editorContext"
      :side-id="selected.ref.sideId"
      @close="expanded = false"
      @patch="store.patchModule(selected.ref, $event)"
      @patch-data="patchData"
      @patch-props="patchProps"
    />
  </section>
</template>
<style scoped>
.studio__save-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--d-danger);
  color: var(--d-danger);
  font-size: 12px;
}
.studio__project .d-kicker {
  display: none;
}
.studio__title-input {
  min-width: 80px;
  max-width: 310px;
  width: 240px;
  font-size: 19px;
  background: transparent;
  color: var(--d-text);
  border: 0;
  border-bottom: 1px solid transparent;
  padding: 2px 0;
}
.studio__title-input:focus {
  border-color: var(--d-line);
  outline: 0;
}
.studio__inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.studio__scene-settings {
  font-size: 12px;
  padding-block: 12px;
  border-block: 1px solid var(--d-line);
  margin-bottom: 18px;
}
.studio__scene-settings summary {
  cursor: pointer;
  color: var(--d-muted);
}
.studio__scene-settings label {
  margin-top: 16px;
}
.studio__scene-settings p,
.studio__source-note,
.studio__context {
  color: var(--d-muted);
  font-size: 11px;
  line-height: 1.8;
  margin: 10px 0;
}
.studio__module-actions {
  flex-wrap: wrap;
}
.studio__row-actions {
  flex-wrap: wrap;
}
.studio__layout > :deep(.collection),
.studio__layout > :deep(.appearance-panel) {
  width: min(350px, 100%);
}

@media (min-width: 1451px) {
  .studio--collection .studio__layout {
    grid-template-columns: 220px minmax(0, 1fr) 350px;
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
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 0;
  flex: 1;
}
.studio--properties .studio__layout {
  grid-template-columns: 220px minmax(0, 1fr) 350px;
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
    top: 0;
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
    top: 0;
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
