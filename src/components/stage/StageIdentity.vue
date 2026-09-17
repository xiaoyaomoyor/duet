<script setup lang="ts">
import type { StageParticipant } from './types'
defineProps<{ participant: StageParticipant; active?: boolean | undefined }>()
</script>
<template>
  <div class="identity" :data-tone="participant.tone" :data-active="active || undefined">
    <span class="identity__letter">{{ participant.label }}</span>
    <div class="identity__text">
      <strong>{{ participant.name }}</strong
      ><span>{{ participant.version }}</span>
    </div>
    <span v-if="active" class="identity__playing" aria-hidden="true"><i /><i /><i /></span>
  </div>
</template>
<style scoped>
.identity {
  --identity-tone: var(--d-a);
  display: flex;
  gap: 0.85em;
  align-items: center;
  min-width: 0;
  font-size: inherit;
}
.identity[data-tone='b'] {
  --identity-tone: var(--d-b);
}
.identity__letter {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 1.8em;
  height: 1.8em;
  border: 1px solid var(--d-line);
  border-radius: 50%;
  font-family: var(--d-mono);
  font-size: 0.63em;
  color: var(--identity-tone);
}
.identity__text {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35em 0.65em;
  min-width: 0;
}
.identity strong {
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.identity__text > span {
  font-size: 0.52em;
  color: var(--d-muted);
}
.identity__playing {
  margin-left: auto;
  display: flex;
  gap: 3px;
  align-items: center;
  height: 16px;
  color: var(--identity-tone);
}
.identity__playing i {
  display: block;
  width: 3px;
  height: 7px;
  background: currentColor;
}
.identity__playing i:nth-child(2) {
  height: 15px;
}
.identity__playing i:nth-child(3) {
  height: 10px;
}
.identity[data-active] .identity__letter {
  border-color: var(--identity-tone);
}
</style>
