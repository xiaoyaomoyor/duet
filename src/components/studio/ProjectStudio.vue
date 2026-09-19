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
import DButton from '@/components/design/DButton.vue'
import ModulePicker from '@/components/editor/ModulePicker.vue'
import ModuleEditorDialog from '@/components/editor/ModuleEditorDialog.vue'
const props = defineProps<{ project: Project }>()
const { t } = useI18n()
const store = useProjectStore(),
  tools = useToolsStore(),
  ui = useUiStore()
const comparison = computed(() => resolveComparison(props.project, tools.resolve, t))
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
    comparison.value.sections.find((s) => s.id === sceneId.value) ??
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
  () => props.project.id,
  () => {
    sceneId.value = ''
    selectedId.value = ''
    clean.value = false
    overflowIds.value = new Set()
    player.pauseAll()
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
  const item = scenes.value[Math.max(0, Math.min(scenes.value.length - 1, index.value + offset))]
  if (item) sceneId.value = item.id
  pauseMedia()
}
function exit() {
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
    event.target.closest('input,textarea,select,[contenteditable]')
  )
    return
  if (['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp'].includes(event.key)) {
    event.preventDefault()
    next(['ArrowRight', 'PageDown'].includes(event.key) ? 1 : -1)
  }
  if (event.key.toLowerCase() === 'f') {
    event.preventDefault()
    void full()
  }
}
onMounted(() => {
  window.addEventListener('keydown', keyboard)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  player.pauseAll()
  pauseMedia()
  window.removeEventListener('keydown', keyboard)
  document.removeEventListener('visibilitychange', onVisibility)
})
function patchData(patch: Record<string, unknown>) {
  if (selected.value) store.patchModuleData(selected.value.ref, patch)
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
    const next = resolveComparison(result.value, tools.resolve, t).sections.find(
      (s) => s.id === target.rowId,
    )
    selectedId.value =
      next?.entries.find((e) => e.participantId === target.sideId)?.contents.at(-1)?.module.id ?? ''
  }
}
async function addSection(shared: boolean) {
  const result = shared ? store.insertCommonRowAt(props.project.sheet.rows.length) : store.addRow()
  if (result.ok) {
    sceneId.value = result.value.sheet.rows.at(-1)!.id
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
              v-show="reading ? s.visible : s.id === section?.id"
              :comparison="comparison"
              :section="s"
              :index="n"
              :total="scenes.length"
              :reading="reading"
              :editing="!present"
              @select="select"
              @overflow="overflowIds.add($event)"
          /></template>
          <div v-if="present && !visible.length" class="studio__no-content">
            <p>{{ t('studio.incomplete') }}</p>
            <DButton class="no-export" @click="exit">{{ t('studio.exit') }}</DButton>
          </div>
        </div>
        <footer v-if="!reading && scenes.length" class="studio__paging no-export">
          <DButton
            compact
            tone="quiet"
            icon="chevron-left"
            :aria-label="t('studio.previous')"
            :disabled="index <= 0"
            @click="next(-1)"
          /><span>{{ Math.max(1, index + 1) }} / {{ scenes.length }}</span
          ><DButton
            compact
            tone="quiet"
            icon="chevron-right"
            :aria-label="t('studio.next')"
            :disabled="index >= scenes.length - 1"
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
