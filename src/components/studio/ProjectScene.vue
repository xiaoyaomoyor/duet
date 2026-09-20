<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import StageFrame from '@/components/stage/StageFrame.vue'
import StageIdentity from '@/components/stage/StageIdentity.vue'
import StageComparison from '@/components/stage/StageComparison.vue'
import ModuleView from '@/components/compare/ModuleView.vue'
import ProjectAudio from './ProjectAudio.vue'
import type { ResolvedComparison, ResolvedSection, ResolvedContent } from '@/services/sceneResolver'
import DButton from '@/components/design/DButton.vue'
import { moduleTitle } from '@/i18n/helper'
import type { CellRef } from '@/types/project'
import type { ComparisonView } from '@/types/presentation'
const props = defineProps<{
  comparison: ResolvedComparison
  section: ResolvedSection
  index: number
  total: number
  reading: boolean
  editing: boolean
  focusIds?: string[]
  concealedIds?: string[]
  focused?: boolean
  viewMode?: ComparisonView
  participantIds?: string[]
  exporting?: boolean
  referenceId?: string
  selectedId?: string | undefined
}>()
const emit = defineEmits<{
  select: [content: ResolvedContent]
  edit: [content: ResolvedContent]
  add: [ref: CellRef]
  overflow: [id: string, overflowing: boolean]
  inspect: [id: string]
}>()
const mode = computed(() => (props.reading ? 'overview' : (props.viewMode ?? 'overview')))
const compact = computed(
  () => props.comparison.participants.length > 2 && !props.reading && mode.value === 'overview',
)
const participants = computed(() =>
  props.reading || mode.value === 'overview' || !props.participantIds?.length
    ? props.comparison.participants
    : props.participantIds
        .map((id) => props.comparison.participants.find((p) => p.id === id)!)
        .filter(Boolean),
)
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const overflowing = ref(false)
let observer: ResizeObserver | undefined
let measureFrame = 0
function scheduleMeasure() {
  if (measureFrame) return
  measureFrame = requestAnimationFrame(() => {
    measureFrame = 0
    measure()
  })
}
const visibleContents = computed(() =>
  props.section.contents.filter((c) => (props.editing || c.visible) && c.module.type !== 'title'),
)
const isReading = computed(() => props.reading || overflowing.value)
function measure() {
  if (!root.value || isReading.value || root.value.clientWidth === 0) return
  const frame = root.value.querySelector('.stage-frame')!
  const foot = frame.querySelector('.stage-frame__foot')!.getBoundingClientRect()
  const nodes = Array.from(frame.querySelectorAll('.project-scene__body *')).filter(
    (n) => n.getClientRects().length,
  )
  if (nodes.some((n) => n.getBoundingClientRect().bottom > foot.top - 12)) {
    overflowing.value = true
    emit('overflow', props.section.id, true)
  }
}
watch(
  () => props.section,
  async () => {
    overflowing.value = false
    emit('overflow', props.section.id, false)
    await nextTick()
    scheduleMeasure()
  },
)
onMounted(() => {
  observer = new ResizeObserver(scheduleMeasure)
  if (root.value) {
    observer.observe(root.value)
    const body = root.value.querySelector('.project-scene__body')
    if (body) observer.observe(body)
  }
  void nextTick(scheduleMeasure)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(measureFrame)
})
function contents(id: string) {
  const all =
    props.section.entries
      .find((e) => e.participantId === id)
      ?.contents.filter((c) => (props.editing || c.visible) && c.module.type !== 'title') ?? []
  if (!compact.value || props.exporting || props.editing) return all
  const media = all.find((c) => ['audio', 'image', 'video'].includes(c.module.type))
  return media ? [media] : all.slice(0, 1)
}
function selectContent(event: MouseEvent, content: ResolvedContent, edit = false) {
  if (
    !props.editing ||
    (event.target instanceof HTMLElement &&
      event.target.closest('button,input,select,textarea,a,audio,video,[contenteditable]'))
  )
    return
  if (edit) emit('edit', content)
  else emit('select', content)
}
</script>
<template>
  <div
    ref="root"
    class="project-scene"
    :data-scene-id="section.id"
    :data-layout="section.layout ?? 'general'"
    :data-editing="editing || undefined"
    :data-design-theme="section.appearance.theme"
    :data-palette="section.appearance.palette"
    :data-typography="section.appearance.typography"
    :data-media-layout="section.appearance.mediaLayout"
    :data-title-align="section.appearance.titleAlign"
    :data-texture="section.appearance.texture"
    :data-view="mode"
    :data-multi="(comparison.participants.length > 2 && !reading) || undefined"
    :data-count="participants.length"
    :data-reading="reading || undefined"
  >
    <StageFrame
      :appearance="section.appearance"
      :index="index"
      :total="total"
      :title="section.title"
      :kicker="`${String(index + 1).padStart(2, '0')} / ${comparison.caseTitle || t(section.shared ? 'studio.shared' : 'studio.report')}`"
      :note="comparison.title"
      :reading="isReading"
    >
      <div class="project-scene__body" :class="{ 'project-scene__body--shared': section.shared }">
        <p v-if="section.shared && comparison.conditions" class="project-scene__conditions">
          {{ comparison.conditions }}
        </p>
        <div v-if="section.metrics.length">
          <StageComparison
            :participants="participants"
            :metrics="section.metrics"
            :caption="section.title"
            :focus-ids="focusIds"
            :concealed-ids="concealedIds"
            :reference-id="referenceId"
            :paginate="!exporting && !reading"
          />
          <div v-if="editing" class="project-scene__metric-editors no-export">
            <button
              v-for="content in section.contents"
              :key="content.module.id"
              :aria-pressed="selectedId === content.module.id"
              @click="emit('select', content)"
              @dblclick="emit('edit', content)"
            >
              {{ comparison.participants.find((p) => p.id === content.ref.sideId)?.label }} ·
              {{ content.module.title || moduleTitle(content.module.type) }}
            </button>
            <DButton
              v-for="p in participants"
              :key="p.id"
              compact
              tone="quiet"
              :aria-label="'为 ' + p.label + ' 添加模块'"
              @click="emit('add', { rowId: section.id, sideId: p.id })"
              >＋ {{ p.label }}</DButton
            >
          </div>
        </div>
        <template v-else-if="section.shared">
          <div
            v-for="content in visibleContents"
            :key="content.module.id"
            class="project-scene__module"
            :class="{
              'project-scene__module--selected': editing && selectedId === content.module.id,
              'project-scene__module--hidden': editing && content.module.hidden,
            }"
            :data-module-id="content.module.id"
            @click="selectContent($event, content)"
            @dblclick="selectContent($event, content, true)"
          >
            <button
              v-if="editing"
              class="project-scene__edit no-export"
              :aria-label="'编辑' + (content.module.title || moduleTitle(content.module.type))"
              @click.stop="emit('edit', content)"
            >
              编辑
            </button>
            <p v-if="editing && !content.visible" class="project-scene__placeholder">
              {{
                content.module.hidden
                  ? '已隐藏 · 仅编辑时显示'
                  : '待填写 · ' + moduleTitle(content.module.type)
              }}
            </p>
            <ModuleView
              :module="content.module"
              :side-id="content.ref.sideId"
              accent="var(--d-accent)"
              readonly
            />
          </div>
          <DButton
            v-if="editing"
            compact
            tone="quiet"
            class="project-scene__add no-export"
            @click="emit('add', { rowId: section.id, sideId: comparison.participants[0]!.id })"
            >＋ 添加共同内容</DButton
          >
        </template>
        <div v-else class="project-scene__pair" :style="{ '--participants': participants.length }">
          <section
            v-for="p in participants"
            :key="p.id"
            class="project-scene__participant"
            :class="{
              'project-scene__participant--dim': focusIds?.length && !focusIds.includes(p.id),
              'project-scene__participant--concealed': concealedIds?.includes(p.id),
              'project-scene__participant--excluded':
                focused && focusIds?.length && !focusIds.includes(p.id),
            }"
            :data-tone="p.tone"
            :data-side-id="p.id"
            :data-compare-id="p.id"
            :data-export-name="p.name"
            :data-export-version="p.version"
          >
            <StageIdentity :participant="p" />
            <p
              v-if="section.entries.find((e) => e.participantId === p.id)?.sampleTitle"
              class="project-scene__sample"
            >
              {{ section.entries.find((e) => e.participantId === p.id)?.sampleTitle }}
            </p>
            <p
              v-if="section.entries.find((e) => e.participantId === p.id)?.conditions"
              class="project-scene__note"
            >
              {{ section.entries.find((e) => e.participantId === p.id)?.conditions }}
            </p>
            <p v-if="participants.some((p) => !!p.description)" class="project-scene__note">
              {{ p.description || '\u00a0' }}
            </p>
            <div
              v-for="content in contents(p.id)"
              :key="content.module.id"
              class="project-scene__module"
              :data-module-type="content.module.type"
              :class="{
                'project-scene__module--selected': editing && selectedId === content.module.id,
                'project-scene__module--hidden': editing && content.module.hidden,
              }"
              :data-module-id="content.module.id"
              @click="selectContent($event, content)"
              @dblclick="selectContent($event, content, true)"
            >
              <button
                v-if="editing"
                class="project-scene__edit no-export"
                :aria-label="'编辑' + (content.module.title || moduleTitle(content.module.type))"
                @click.stop="emit('edit', content)"
              >
                编辑
              </button>
              <p v-if="editing && !content.visible" class="project-scene__placeholder">
                {{
                  content.module.hidden
                    ? '已隐藏 · 仅编辑时显示'
                    : '待填写 · ' + moduleTitle(content.module.type)
                }}
              </p>
              <ProjectAudio
                v-if="content.module.type === 'audio'"
                :content="content"
                :participant="p"
              />
              <ModuleView
                v-else
                :module="content.module"
                :side-id="content.clockId"
                :accent="`var(--d-${p.tone})`"
                readonly
              />
            </div>
            <DButton
              v-if="editing"
              compact
              tone="quiet"
              class="project-scene__add no-export"
              :aria-label="'为 ' + p.label + ' 添加模块'"
              @click="emit('add', { rowId: section.id, sideId: p.id })"
              >＋ 添加内容</DButton
            >
            <button
              v-if="compact && !exporting"
              class="project-scene__inspect no-export"
              @click="emit('inspect', p.id)"
            >
              查看 {{ p.label }} 详情 <span aria-hidden="true">↗</span>
            </button>
            <div
              v-if="
                section.entries.find((e) => e.participantId === p.id)?.missingSample ||
                (!contents(p.id).length && visibleContents.length)
              "
              class="project-scene__missing"
            >
              {{
                section.entries.find((e) => e.participantId === p.id)?.missingSample
                  ? '本题未提供样本'
                  : t('studio.missing')
              }}
            </div>
          </section>
        </div>
        <div
          v-if="!visibleContents.length && !section.identity && !editing"
          class="project-scene__empty"
        >
          <span>—</span>
          <h2>{{ t('studio.empty') }}</h2>
          <p v-if="editing">{{ t('studio.emptyHint') }}</p>
        </div>
      </div>
    </StageFrame>
  </div>
</template>
<style scoped>
.project-scene__module {
  position: relative;
}
.project-scene[data-editing] .project-scene__module {
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 8px;
  margin-inline: -8px;
}
.project-scene[data-editing] .project-scene__module:hover {
  border-color: var(--d-line);
}
.project-scene[data-editing] .project-scene__module--selected {
  border-color: var(--d-accent);
}
.project-scene__module--hidden {
  opacity: 0.55;
}
.project-scene__edit {
  position: absolute;
  top: -12px;
  right: 8px;
  z-index: 2;
  background: var(--d-surface);
  border: 1px solid var(--d-line);
  border-radius: 4px;
  padding: 4px 9px;
  color: var(--d-text);
  font-size: 11px;
  opacity: 0;
}
.project-scene__module:hover .project-scene__edit,
.project-scene__module:focus-within .project-scene__edit {
  opacity: 1;
}
.project-scene__placeholder {
  color: var(--d-muted);
  font-size: 12px;
  line-height: 1.6;
  padding: 12px 0;
}
.project-scene__add {
  margin-top: 16px;
  width: 100%;
  border: 1px dashed var(--d-line);
  min-height: 38px;
}
.project-scene[data-editing][data-multi][data-view='overview']
  .project-scene__module
  + .project-scene__module {
  display: block;
}
@media (min-width: 701px) {
  .project-scene[data-layout='listening'][data-media-layout='wide']:not([data-multi])
    :deep(.stage-media__art) {
    aspect-ratio: 16 / 7;
    max-height: 18cqw;
  }
  .project-scene[data-layout='listening'][data-media-layout='wide']:not([data-multi]):has(
      .project-scene__module + .project-scene__module
    )
    :deep(.stage-media__art) {
    aspect-ratio: 16 / 5;
    max-height: 12cqw;
  }
  .project-scene[data-layout='listening']:not([data-multi]) :deep(.stage-frame__title) {
    padding-block: 1.3cqw;
  }
  .project-scene[data-layout='listening']:not([data-multi])
    .project-scene__participant
    > .identity {
    margin-bottom: 0.9cqw;
  }
}
.project-scene[data-layout='listening'] .project-scene__module + .project-scene__module {
  margin-top: 1.2cqw;
  padding-top: 1cqw;
}
@media (max-width: 700px) {
  .project-scene[data-layout='listening'][data-media-layout='wide']:not([data-multi])
    :deep(.stage-media__art) {
    aspect-ratio: 16 / 10;
    max-height: none;
  }
  .project-scene[data-layout='listening'] .project-scene__module + .project-scene__module {
    margin-top: 24px;
    padding-top: 18px;
  }
}
.project-scene__metric-editors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
}
.project-scene__metric-editors > button {
  font-size: 11px;
  color: var(--d-muted);
  padding: 8px;
  border: 1px solid var(--d-line);
  border-radius: 4px;
}
.project-scene__metric-editors > button[aria-pressed='true'] {
  border-color: var(--d-accent);
  color: var(--d-text);
}

.project-scene {
  container-type: inline-size;
  width: 100%;
  animation: duet-fade-in var(--d-enter) var(--d-ease) both;
}
.project-scene__sample {
  color: var(--d-muted);
  font-size: 1cqw;
  margin: -0.5cqw 0 0.7cqw;
  letter-spacing: 0.03em;
}
.project-scene__conditions {
  color: var(--d-muted);
  font-size: 1cqw;
  line-height: 1.7;
  white-space: pre-wrap;
  padding-bottom: 1.5cqw;
  margin-bottom: 2cqw;
  border-bottom: 1px solid var(--d-line);
}
.project-scene__participant {
  transition: opacity var(--d-enter) var(--d-ease);
}
.project-scene__participant--dim {
  opacity: 0.35;
}
.project-scene__participant--concealed {
  visibility: hidden;
}
.project-scene__participant--excluded {
  display: none;
}
.project-scene__pair:has(.project-scene__participant--excluded) {
  grid-template-columns: minmax(0, 1fr);
  max-width: 70%;
  margin: auto;
}
@media (max-width: 700px) {
  .project-scene__sample {
    font-size: 13px;
    margin: 0 0 18px;
  }
}
.project-scene__note {
  color: var(--d-muted);
  font-size: 1cqw;
  line-height: 1.7;
  margin: -0.6cqw 0 1.1cqw;
  overflow-wrap: anywhere;
}
@media (max-width: 700px) {
  .project-scene__note {
    font-size: 13px;
    margin: 0 0 18px;
  }
}
.project-scene__pair {
  display: grid;
  grid-template-columns: repeat(var(--participants), minmax(0, 1fr));
  gap: 3.2cqw;
}
.project-scene__participant {
  min-width: 0;
  font-size: 1.7cqw;
}
.project-scene__participant > .identity {
  margin-bottom: 1.5cqw;
}
.project-scene__module + .project-scene__module {
  margin-top: 2cqw;
  padding-top: 1.5cqw;
  border-top: 1px solid var(--d-line);
}
.project-scene__missing {
  display: grid;
  place-items: center;
  min-height: 18cqw;
  color: var(--d-muted);
  font-size: 1.2cqw;
  border-block: 1px solid var(--d-line);
}
.project-scene__empty {
  text-align: center;
  padding: 7cqw 0;
  color: var(--d-muted);
}
.project-scene__empty span {
  font: 4cqw var(--d-serif);
  color: var(--d-accent);
}
.project-scene__empty h2 {
  font-size: 2cqw;
  font-weight: 400;
  margin: 1cqw 0;
}
.project-scene__empty p {
  font-size: 1.1cqw;
}
.project-scene__body--shared {
  max-width: 76%;
  margin: auto;
  padding: 1cqw 0;
}
.project-scene :deep(.module-view) {
  padding: 0;
  border: 0;
  box-shadow: none;
  background: none;
}
.project-scene :deep(.module-view__heading) {
  color: var(--d-muted);
  font-size: 1cqw;
  margin: 0 0 1cqw;
  font-weight: 400;
}
.project-scene :deep(.text),
.project-scene :deep(.note) {
  font-size: 1.3cqw;
  line-height: 1.95;
  background: transparent;
  border: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.project-scene :deep(.text--large) {
  font-family: var(--d-serif);
  font-size: 2.3cqw;
  line-height: 1.8;
}
.project-scene :deep(.lyrics) {
  font-size: 1.25cqw;
}
.project-scene :deep(.lyrics__scroll) {
  max-height: none !important;
  overflow: visible;
}
.project-scene :deep(.anim-enter-up) {
  animation: none;
}
.project-scene :deep(.stage-frame__series) {
  max-width: 40%;
  overflow-wrap: anywhere;
  text-align: right;
}
@media (max-width: 700px) {
  .project-scene__pair {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .project-scene__participant {
    font-size: 22px;
  }
  .project-scene__body--shared {
    max-width: none;
  }
  .project-scene :deep(.text),
  .project-scene :deep(.lyrics),
  .project-scene :deep(.note) {
    font-size: 16px;
  }
  .project-scene :deep(.text--large) {
    font-size: 24px;
  }
  .project-scene :deep(.module-view__heading) {
    font-size: 12px;
  }
  .project-scene__empty h2 {
    font-size: 22px;
  }
  .project-scene__empty p,
  .project-scene__missing {
    font-size: 14px;
  }
  .project-scene__missing {
    min-height: 160px;
  }
  .project-scene__participant > .identity {
    margin-bottom: 20px;
  }
}
</style>
<style scoped>
.project-scene__inspect {
  display: flex;
  justify-content: space-between;
  width: 100%;
  border: 0;
  border-top: 1px solid var(--d-line);
  background: transparent;
  color: var(--d-muted);
  padding: 0.65cqw 0 0;
  margin-top: 0.7cqw;
  font-size: max(11px, 0.8cqw);
  cursor: pointer;
}
.project-scene__inspect:hover {
  color: var(--d-text);
}
.project-scene[data-view='single'] .project-scene__pair {
  max-width: 70%;
  margin: auto;
}
.project-scene[data-multi][data-view='overview'] .project-scene__pair {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1.6cqw 2.2cqw;
}
.project-scene[data-multi][data-view='overview'] .project-scene__participant {
  grid-column: span 2;
  font-size: 1.4cqw;
}
.project-scene[data-multi][data-view='overview'][data-count='4'] .project-scene__participant {
  grid-column: span 3;
}
.project-scene[data-multi][data-view='overview'][data-count='5']
  .project-scene__participant:nth-child(4) {
  grid-column: 2 / span 2;
}
.project-scene[data-multi][data-view='overview'] .project-scene__participant > .identity {
  margin-bottom: 0.6cqw;
}
.project-scene[data-multi][data-view='overview'] .project-scene__sample {
  margin: 0 0 0.55cqw;
  font-size: max(12px, 0.85cqw);
}
.project-scene[data-multi][data-view='overview'] .project-scene__note {
  display: none;
}
.project-scene[data-multi][data-view='overview'] .project-scene__module + .project-scene__module {
  display: none;
}
.project-scene[data-multi][data-view='overview'] :deep(.stage-media__art) {
  height: 7.5cqw;
  aspect-ratio: auto;
}
.project-scene[data-multi][data-view='overview'][data-count='3'] :deep(.stage-media__art) {
  height: 18cqw;
}
.project-scene[data-multi][data-view='overview'] :deep(.stage-media__caption) {
  margin: 0.65cqw 0;
}
.project-scene[data-multi][data-view='overview'] :deep(.stage-media__caption h3) {
  font-size: max(12px, 1cqw);
}
.project-scene[data-multi][data-view='overview'] :deep(.stage-media__caption p) {
  display: none;
}
.project-scene[data-multi][data-view='overview'] :deep(.stage-media__transport) {
  margin-top: 0.5cqw;
  gap: 0.7cqw;
}
.project-scene[data-multi][data-view='overview'] :deep(.stage-media__play) {
  width: 30px;
  height: 30px;
}
.project-scene[data-multi][data-view='overview'] :deep(.stage-media__timeline > div) {
  font-size: max(10px, 0.65cqw);
}
.project-scene[data-multi][data-view='overview'] :deep(.image img),
.project-scene[data-multi][data-view='overview'] :deep(video) {
  max-height: 12cqw;
  object-fit: contain;
  width: 100%;
}
.project-scene[data-multi][data-view='overview'] :deep(.text),
.project-scene[data-multi][data-view='overview'] :deep(.lyrics) {
  font-size: max(14px, 1.1cqw);
  max-height: 12cqw;
  overflow: auto;
}
.project-scene[data-multi][data-view='overview'] .project-scene__missing {
  min-height: 12cqw;
}
@media (max-width: 700px) {
  .project-scene[data-multi][data-view='overview'] .project-scene__pair {
    display: flex;
    flex-direction: column;
    gap: 28px;
  }
  .project-scene[data-multi][data-view='overview'] .project-scene__participant {
    font-size: 22px;
  }
  .project-scene[data-multi][data-view='overview'] :deep(.stage-media__art),
  .project-scene[data-multi][data-view='overview'][data-count='3'] :deep(.stage-media__art) {
    height: 180px;
  }
  .project-scene[data-multi][data-view='overview'] :deep(.image img),
  .project-scene[data-multi][data-view='overview'] :deep(video) {
    max-height: 240px;
  }
  .project-scene[data-multi][data-view='overview'] :deep(.text),
  .project-scene[data-multi][data-view='overview'] :deep(.lyrics) {
    max-height: 200px;
  }
  .project-scene[data-view='single'] .project-scene__pair {
    max-width: none;
  }
  .project-scene__inspect {
    padding-top: 12px;
    margin-top: 16px;
    font-size: 13px;
  }
}

@media (min-width: 701px) {
  .project-scene[data-multi][data-view='overview'] .project-scene__participant {
    position: relative;
  }
  .project-scene[data-multi][data-view='overview'] .project-scene__participant > .identity {
    padding-right: 90px;
  }
  .project-scene[data-multi][data-view='overview'] .project-scene__inspect {
    position: absolute;
    top: 0;
    right: 0;
    width: auto;
    gap: 10px;
    border: 0;
    margin: 0;
    padding: 4px 0;
  }
  .project-scene[data-multi][data-view='overview'] :deep(.stage-media__caption) {
    padding-top: 0;
    margin: 0.45cqw 0 0;
  }
  .project-scene[data-multi][data-view='overview'] :deep(.stage-media__transport) {
    margin-top: 0.4cqw;
    padding-top: 0.4cqw;
  }
  .project-scene[data-multi][data-view='overview'] :deep(.stage-frame__title) {
    padding-block: 1.2cqw;
  }
  .project-scene[data-multi][data-view='overview'] .project-scene__participant--dim {
    opacity: 0.6;
  }
}

.project-scene[data-reading][data-count='3'] .project-scene__pair,
.project-scene[data-reading][data-count='5'] .project-scene__pair,
.project-scene[data-reading][data-count='6'] .project-scene__pair {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.project-scene[data-reading][data-count='4'] .project-scene__pair {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (max-width: 700px) {
  .project-scene[data-reading] .project-scene__pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
