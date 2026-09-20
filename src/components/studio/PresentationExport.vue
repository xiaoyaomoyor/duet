<script setup lang="ts">
import { computed, provide } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Project } from '@/types/project'
import type { ExportFrame } from '@/services/presentationExport'
import { resolveComparison } from '@/services/sceneResolver'
import { useToolsStore } from '@/stores/useToolsStore'
import { useStagePlayback } from '@/composables/useStagePlayback'
import ProjectScene from './ProjectScene.vue'
const props = defineProps<{ project: Project; frames: ExportFrame[] }>()
const { t } = useI18n(),
  tools = useToolsStore()
provide('duet:stage-playback', useStagePlayback())
const resolved = computed(() => {
  const result = props.frames.map((frame) => {
    const comparison = resolveComparison(props.project, tools.resolve, t, frame.state, frame.state)
    const scene = props.project.comparison!.scenes.find((s) => s.id === frame.state.sceneId)!
    return {
      frame,
      comparison,
      section: {
        ...comparison.sections.find((s) => s.id === scene.sectionId)!,
        title: scene.title || comparison.sections.find((s) => s.id === scene.sectionId)!.title,
      },
    }
  })
  for (const item of result) {
    if (!item.frame.factorized || item.section.shared) continue
    const related = result.filter((r) => r.frame.scene === item.frame.scene)
    if (
      related.some((r) =>
        r.section.contents.some(
          (c) =>
            c.visible &&
            (!['title', 'keyValue', 'score'].includes(c.module.type) ||
              (c.module.type === 'score' &&
                (c.module.data as { showNumber?: boolean }).showNumber === false)),
        ),
      )
    ) {
      item.section.metrics = []
      continue
    }
    const union = new Map(
      result
        .filter((r) => r.frame.scene === item.frame.scene)
        .flatMap((r) => r.section.metrics)
        .map((m) => [m.id, m]),
    )
    item.section.metrics = [...union.values()].map(
      (m) => item.section.metrics.find((v) => v.id === m.id) ?? { ...m, values: {} },
    )
  }
  return result
})
</script>
<template>
  <div
    class="presentation-export"
    data-runtime-export
    :data-design-theme="project.sheet.layout.presentation?.theme ?? 'ink'"
  >
    <div
      v-for="({ frame, comparison, section }, n) in resolved"
      :key="n"
      data-export-frame
      :data-export-scene="frame.scene"
      :data-export-step="frame.state.stepIndex"
      :data-export-title="frame.title"
      :data-export-factorized="frame.factorized || undefined"
      :data-export-ids="JSON.stringify(project.sheet.sides.map((p) => p.id))"
      :data-export-labels="JSON.stringify(comparison.participants.map((p) => p.label))"
      :data-export-choices="JSON.stringify(frame.choices)"
      :data-export-defaults="JSON.stringify(frame.defaults)"
      :data-export-samples="
        JSON.stringify(project.sheet.sides.map((p) => frame.state.samples[p.id] ?? null))
      "
    >
      <ProjectScene
        :comparison="comparison"
        :section="section"
        :index="frame.scene"
        :total="new Set(frames.map((f) => f.scene)).size"
        :reading="false"
        :editing="false"
        exporting
        :focus-ids="frame.state.focusIds"
        :concealed-ids="frame.state.concealedIds"
      />
    </div>
  </div>
</template>
<style scoped>
.presentation-export {
  width: 1280px;
}
</style>
