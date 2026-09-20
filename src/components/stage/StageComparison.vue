<script setup lang="ts">
import type { StageMetric, StageParticipant } from './types'
import StageIdentity from './StageIdentity.vue'
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
const props = defineProps<{
  participants: StageParticipant[]
  metrics: StageMetric[]
  caption: string
  focusIds?: string[] | undefined
  concealedIds?: string[] | undefined
  referenceId?: string | undefined
  paginate?: boolean
}>()
const root = ref<HTMLElement | null>(null),
  width = ref(1600),
  page = ref(0)
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([e]) => {
    if (e?.contentRect.width) width.value = e.contentRect.width
  })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
const capacity = computed(() =>
  !props.paginate ? 6 : width.value < 600 ? 2 : width.value < 1050 ? 3 : 6,
)
const pinned = computed(() => props.participants.find((p) => p.id === props.referenceId))
const rest = computed(() => props.participants.filter((p) => p.id !== pinned.value?.id))
const size = computed(() => capacity.value - (pinned.value ? 1 : 0))
const pages = computed(() => Math.ceil(rest.value.length / size.value))
const columns = computed(() =>
  pages.value <= 1
    ? props.participants
    : [
        ...(pinned.value ? [pinned.value] : []),
        ...rest.value.slice(page.value * size.value, (page.value + 1) * size.value),
      ],
)
watch([rest, capacity], () => {
  page.value = Math.min(page.value, Math.max(0, pages.value - 1))
})
</script>
<template>
  <div ref="root" class="stage-table-wrap">
    <div v-if="pages > 1" class="stage-table-pages no-export">
      <span
        >全体数据 · {{ page + 1 }} / {{ pages
        }}<template v-if="pinned"> · 固定参照 {{ pinned.label }}</template></span
      ><button :disabled="page === 0" @click="page--">上一组</button
      ><button :disabled="page === pages - 1" @click="page++">下一组</button>
    </div>
    <table class="stage-table" :data-columns="columns.length">
      <caption>
        {{
          caption
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ $t('showcase.dimension') }}</th>
          <th
            v-for="participant in columns"
            :key="participant.id"
            scope="col"
            :data-compare-id="participant.id"
            :style="{
              visibility: concealedIds?.includes(participant.id) ? 'hidden' : undefined,
              opacity: focusIds?.length && !focusIds.includes(participant.id) ? 0.35 : 1,
            }"
          >
            <StageIdentity :participant="participant" />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="metric in metrics"
          :key="metric.id"
          :data-metric-id="encodeURIComponent(metric.id)"
        >
          <th scope="row">
            {{ metric.label }}<small v-if="metric.unit">{{ metric.unit }}</small>
          </th>
          <td
            v-for="participant in columns"
            :key="participant.id"
            :data-tone="participant.tone"
            :data-compare-id="participant.id"
            :style="{
              visibility: concealedIds?.includes(participant.id) ? 'hidden' : undefined,
              opacity: focusIds?.length && !focusIds.includes(participant.id) ? 0.35 : 1,
            }"
          >
            <strong>{{ metric.values[participant.id]?.value ?? '—' }}</strong>
            <p>{{ metric.values[participant.id]?.note ?? $t('showcase.missingValue') }}</p>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<style scoped>
.stage-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
.stage-table-pages {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  color: var(--d-muted);
  font-size: 12px;
}
.stage-table-pages span {
  margin-right: auto;
}
.stage-table-pages button {
  background: transparent;
  color: var(--d-text);
  border: 1px solid var(--d-line);
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.stage-table-pages button:disabled {
  opacity: 0.4;
}
.stage-table[data-columns='6'] th:first-child,
.stage-table[data-columns='5'] th:first-child {
  width: 16%;
}
.stage-table[data-columns='6'] td,
.stage-table[data-columns='5'] td,
.stage-table[data-columns='6'] th,
.stage-table[data-columns='5'] th {
  padding-inline: 0.7cqw;
}
.stage-table[data-columns='6'] thead th,
.stage-table[data-columns='5'] thead th {
  font-size: max(13px, 1.1cqw);
}
.stage-table[data-columns='6'] td strong,
.stage-table[data-columns='5'] td strong {
  font-size: max(20px, 1.6cqw);
}
.stage-table[data-columns='6'] td p,
.stage-table[data-columns='5'] td p {
  font-size: max(12px, 0.85cqw);
}
.stage-table caption {
  text-align: left;
  font-size: 0.84cqw;
  color: var(--d-muted);
  padding-bottom: 1.2cqw;
}
.stage-table th,
.stage-table td {
  text-align: left;
  padding: 1.18cqw 1.5cqw;
  border-bottom: 1px solid var(--d-line);
  vertical-align: middle;
}
.stage-table thead {
  border-top: 2px solid var(--d-text);
}
.stage-table thead th {
  font-size: 1.5cqw;
  font-weight: 400;
}
.stage-table th:first-child {
  width: 22%;
  padding-left: 0;
  font-size: 1cqw;
  color: var(--d-muted);
  font-weight: 400;
}
.stage-table th small {
  display: block;
  margin-top: 0.3cqw;
  font-size: 0.67cqw;
}
.stage-table td strong {
  font-size: 2.1cqw;
  font-weight: 450;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.stage-table td p {
  margin-top: 0.35cqw;
  font-size: 0.93cqw;
  line-height: 1.7;
  color: var(--d-muted);
  overflow-wrap: anywhere;
}
.stage-table td[data-tone='a'] strong {
  color: var(--d-a);
}
.stage-table td[data-tone='b'] strong {
  color: var(--d-b);
}
@media (max-width: 700px) {
  .stage-table-wrap {
    overflow-x: auto;
  }
  .stage-table {
    min-width: 540px;
  }
  .stage-table caption {
    font-size: 12px;
    padding-bottom: 16px;
  }
  .stage-table th,
  .stage-table td {
    padding: 18px 14px;
  }
  .stage-table thead th {
    font-size: 18px;
  }
  .stage-table th:first-child {
    font-size: 12px;
  }
  .stage-table th small,
  .stage-table td p {
    font-size: 11px;
  }
  .stage-table td strong {
    font-size: 24px;
  }
}
</style>
