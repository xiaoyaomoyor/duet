<script setup lang="ts">
import type { StageMetric, StageParticipant } from './types'
import StageIdentity from './StageIdentity.vue'
defineProps<{ participants: StageParticipant[]; metrics: StageMetric[]; caption: string }>()
</script>
<template>
  <div class="stage-table-wrap">
    <table class="stage-table">
      <caption>
        {{
          caption
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ $t('showcase.dimension') }}</th>
          <th v-for="participant in participants" :key="participant.id" scope="col">
            <StageIdentity :participant="participant" />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="metric in metrics" :key="metric.id">
          <th scope="row">
            {{ metric.label }}<small v-if="metric.unit">{{ metric.unit }}</small>
          </th>
          <td
            v-for="participant in participants"
            :key="participant.id"
            :data-tone="participant.tone"
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
