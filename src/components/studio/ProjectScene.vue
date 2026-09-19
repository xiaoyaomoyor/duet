<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import StageFrame from '@/components/stage/StageFrame.vue'
import StageIdentity from '@/components/stage/StageIdentity.vue'
import StageComparison from '@/components/stage/StageComparison.vue'
import ModuleView from '@/components/compare/ModuleView.vue'
import ProjectAudio from './ProjectAudio.vue'
import type { ResolvedComparison, ResolvedSection, ResolvedContent } from '@/services/sceneResolver'
const props = defineProps<{
  comparison: ResolvedComparison
  section: ResolvedSection
  index: number
  total: number
  reading: boolean
  editing: boolean
}>()
const emit = defineEmits<{ select: [content: ResolvedContent]; overflow: [id: string] }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const overflowing = ref(false)
let observer: ResizeObserver | undefined
const visibleContents = computed(() =>
  props.section.contents.filter((c) => c.visible && c.module.type !== 'title'),
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
    emit('overflow', props.section.id)
  }
}
watch(
  () => props.section,
  async () => {
    overflowing.value = false
    await nextTick()
    measure()
  },
)
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (root.value) {
    observer.observe(root.value)
    const body = root.value.querySelector('.project-scene__body')
    if (body) observer.observe(body)
  }
  void nextTick(measure)
})
onBeforeUnmount(() => observer?.disconnect())
function contents(id: string) {
  return (
    props.section.entries
      .find((e) => e.participantId === id)
      ?.contents.filter((c) => c.visible && c.module.type !== 'title') ?? []
  )
}
</script>
<template>
  <div ref="root" class="project-scene" :data-scene-id="section.id">
    <StageFrame
      :index="index"
      :total="total"
      :title="section.title"
      :kicker="`${String(index + 1).padStart(2, '0')} / ${t(section.shared ? 'studio.shared' : 'studio.report')}`"
      :note="comparison.title"
      :reading="isReading"
    >
      <div class="project-scene__body" :class="{ 'project-scene__body--shared': section.shared }">
        <StageComparison
          v-if="section.metrics.length"
          :participants="comparison.participants"
          :metrics="section.metrics"
          :caption="section.title"
        />
        <template v-else-if="section.shared">
          <div
            v-for="content in visibleContents"
            :key="content.module.id"
            class="project-scene__module"
            @dblclick="editing && emit('select', content)"
          >
            <ModuleView
              :module="content.module"
              :side-id="content.ref.sideId"
              accent="var(--d-accent)"
              readonly
            />
          </div>
        </template>
        <div
          v-else
          class="project-scene__pair"
          :style="{ '--participants': comparison.participants.length }"
        >
          <section
            v-for="p in comparison.participants"
            :key="p.id"
            class="project-scene__participant"
            :data-tone="p.tone"
            :data-side-id="p.id"
            :data-export-name="p.name"
            :data-export-version="p.version"
          >
            <StageIdentity :participant="p" />
            <p v-if="p.description" class="project-scene__note">{{ p.description }}</p>
            <div
              v-for="content in contents(p.id)"
              :key="content.module.id"
              class="project-scene__module"
              @dblclick="editing && emit('select', content)"
            >
              <ProjectAudio
                v-if="content.module.type === 'audio'"
                :content="content"
                :participant="p"
              />
              <ModuleView
                v-else
                :module="content.module"
                :side-id="p.id"
                :accent="`var(--d-${p.tone})`"
                readonly
              />
            </div>
            <div
              v-if="!contents(p.id).length && visibleContents.length"
              class="project-scene__missing"
            >
              {{ t('studio.missing') }}
            </div>
          </section>
        </div>
        <div v-if="!visibleContents.length && !section.identity" class="project-scene__empty">
          <span>—</span>
          <h2>{{ t('studio.empty') }}</h2>
          <p v-if="editing">{{ t('studio.emptyHint') }}</p>
        </div>
      </div>
    </StageFrame>
  </div>
</template>
<style scoped>
.project-scene {
  container-type: inline-size;
  width: 100%;
  animation: duet-fade-in var(--d-enter) var(--d-ease) both;
}
.project-scene__note {
  color: var(--d-muted);
  font-size: 1cqw;
  line-height: 1.7;
  margin: -0.6cqw 0 1.5cqw;
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
