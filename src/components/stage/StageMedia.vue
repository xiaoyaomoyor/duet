<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import type { StageParticipant } from './types'
defineProps<{
  participant: StageParticipant
  playing?: boolean
  current?: number
  duration?: number
  error?: boolean
}>()
const emit = defineEmits<{ toggle: []; seek: [seconds: number] }>()
const { t } = useI18n()
function time(value = 0): string {
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(value % 60)
    .toString()
    .padStart(2, '0')}`
}
</script>
<template>
  <section
    class="stage-media"
    :data-tone="participant.tone"
    :data-playing="playing || undefined"
    :aria-label="participant.track"
  >
    <div class="stage-media__art">
      <img v-if="participant.artwork" :src="participant.artwork" :alt="participant.track" />
      <div v-else class="stage-media__empty">
        <AppIcon name="music" :size="36" /><span>{{ t('showcase.noCover') }}</span
        ><i aria-hidden="true" />
      </div>
      <span class="stage-media__catalogue" aria-hidden="true">{{ participant.label }} / 01</span>
    </div>
    <div class="stage-media__caption">
      <div>
        <h3>{{ participant.track }}</h3>
        <p>{{ participant.description }}</p>
      </div>
      <span>{{ participant.source && duration ? time(duration) : '—' }}</span>
    </div>
    <div class="stage-media__transport">
      <button
        type="button"
        class="stage-media__play"
        :disabled="!participant.source"
        :aria-label="`${playing ? t('audio.pause') : t('audio.play')} ${participant.track}`"
        :aria-pressed="playing || false"
        @click="emit('toggle')"
      >
        <AppIcon :name="playing ? 'pause' : 'play'" :size="18" />
      </button>
      <div class="stage-media__timeline">
        <input
          type="range"
          min="0"
          :max="duration || 12"
          step=".1"
          :value="current || 0"
          :disabled="!participant.source || !duration"
          :style="{ '--progress': `${duration ? ((current || 0) / duration) * 100 : 0}%` }"
          :aria-label="`${participant.track} · ${t('audio.seek')}`"
          @input="emit('seek', Number(($event.target as HTMLInputElement).value))"
        />
        <div>
          <span>{{
            error
              ? t('showcase.playError')
              : participant.source
                ? playing
                  ? t('showcase.listening')
                  : t('showcase.ready')
                : t('showcase.noAudio')
          }}</span
          ><time>{{ time(current) }} / {{ time(duration) }}</time>
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.stage-media {
  --tone: var(--d-a);
  min-width: 0;
}
.stage-media[data-tone='b'] {
  --tone: var(--d-b);
}
.stage-media__art {
  position: relative;
  width: 100%;
  aspect-ratio: 2.2;
  overflow: hidden;
  border-radius: 4px;
  background: var(--d-surface);
}
.stage-media__art img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.stage-media__catalogue {
  position: absolute;
  top: 1.2cqw;
  left: 1.3cqw;
  font-family: var(--d-mono);
  font-size: 0.64cqw;
  letter-spacing: 0.2em;
  color: #f7f1de;
  background: #182b25c9;
  padding: 0.3em 0.6em;
}
.stage-media__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--d-muted);
  background: radial-gradient(ellipse at 50% 100%, var(--d-raised), transparent 75%);
  font-size: 0.8cqw;
}
.stage-media__empty i {
  position: absolute;
  width: 70%;
  aspect-ratio: 1;
  border: 1px solid var(--d-line);
  border-radius: 50%;
  transform: translateY(50%);
  opacity: 0.5;
}
.stage-media__caption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1cqw;
  padding-top: 1.2cqw;
}
.stage-media__caption h3 {
  font-weight: 450;
  font-size: 1.48cqw;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.stage-media__caption p {
  color: var(--d-muted);
  font-size: 0.9cqw;
  line-height: 1.7;
  margin-top: 0.3cqw;
}
.stage-media__caption > span {
  flex-shrink: 0;
  font-size: 0.75cqw;
  font-family: var(--d-mono);
  color: var(--d-muted);
}
.stage-media__transport {
  display: flex;
  align-items: center;
  gap: 1cqw;
  margin-top: 1.25cqw;
  padding-top: 1cqw;
  border-top: 1px solid var(--d-line);
}
.stage-media__play {
  display: grid;
  place-items: center;
  width: 2.45cqw;
  height: 2.45cqw;
  min-width: 32px;
  min-height: 32px;
  flex-shrink: 0;
  color: var(--tone);
  border: 1px solid var(--d-line);
  border-radius: 50%;
  transition:
    background var(--d-fast),
    color var(--d-fast);
}
.stage-media__play:hover:not(:disabled),
[data-playing] .stage-media__play {
  color: var(--d-bg);
  background: var(--tone);
  border-color: var(--tone);
}
.stage-media__play:disabled {
  color: var(--d-faint);
  opacity: 0.6;
}
.stage-media__timeline {
  flex: 1;
  min-width: 0;
}
.stage-media__timeline input {
  appearance: none;
  display: block;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--tone) var(--progress), var(--d-line) var(--progress));
  cursor: pointer;
  margin: 7px 0 10px;
}
.stage-media__timeline input::-webkit-slider-thumb {
  appearance: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--tone);
}
.stage-media__timeline input::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border: 0;
  border-radius: 50%;
  background: var(--tone);
}
.stage-media__timeline > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--d-muted);
  font-size: 0.75cqw;
  font-variant-numeric: tabular-nums;
}
.stage-media__timeline time {
  font-family: var(--d-mono);
  white-space: nowrap;
}
@media (max-width: 700px) {
  .stage-media__catalogue {
    top: 14px;
    left: 14px;
    font-size: 10px;
  }
  .stage-media__caption {
    padding-top: 16px;
    gap: 12px;
  }
  .stage-media__caption h3 {
    font-size: 22px;
  }
  .stage-media__caption p,
  .stage-media__caption > span,
  .stage-media__empty {
    font-size: 12px;
  }
  .stage-media__transport {
    margin-top: 18px;
    padding-top: 14px;
    gap: 16px;
  }
  .stage-media__play {
    width: 42px;
    height: 42px;
  }
  .stage-media__timeline > div {
    font-size: 10px;
  }
}
</style>
