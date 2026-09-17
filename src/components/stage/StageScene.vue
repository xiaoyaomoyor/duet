<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { APP } from '@/app.config'
import StageIdentity from './StageIdentity.vue'
import StageMedia from './StageMedia.vue'
import StageComparison from './StageComparison.vue'
import type { SceneKind, StageStory } from './types'
const props = defineProps<{
  kind: SceneKind
  story: StageStory
  focusId: string
  playback: Record<string, { playing: boolean; current: number; duration: number; error: boolean }>
}>()
const emit = defineEmits<{
  toggle: [id: string]
  seek: [id: string, seconds: number]
  focus: [id: string]
}>()
const { t } = useI18n()
const focused = computed(
  () => props.story.participants.find((p) => p.id === props.focusId) ?? props.story.participants[0],
)
</script>
<template>
  <div v-if="kind === 'brief'" class="brief-scene">
    <div class="brief-scene__text">
      <span class="scene-label">{{ t('showcase.promptLabel') }}</span>
      <h2>{{ t('showcase.promptTitle') }}</h2>
      <p>{{ story.prompt }}</p>
      <div class="brief-scene__rules">
        <span v-for="n in 3" :key="n"
          ><b>0{{ n }}</b
          >{{ t(`showcase.rule${n}`) }}</span
        >
      </div>
    </div>
    <div class="brief-scene__visual">
      <div class="brief-scene__diptych">
        <template v-for="p in story.participants" :key="p.id"
          ><img v-if="p.artwork" :src="p.artwork" alt=""
        /></template>
        <div v-if="story.participants.every((p) => !p.artwork)" class="brief-scene__placeholder">
          {{ APP.nameEn.toUpperCase() }} / 01
        </div>
      </div>
      <div class="brief-scene__identities">
        <StageIdentity v-for="p in story.participants" :key="p.id" :participant="p" />
      </div>
      <p>{{ t('showcase.audioNote') }}</p>
    </div>
  </div>
  <div v-else-if="kind === 'duet'" class="duet-scene">
    <div class="duet-scene__pair">
      <div v-for="p in story.participants" :key="p.id" class="duet-scene__participant">
        <StageIdentity :participant="p" :active="playback[p.id]?.playing" /><StageMedia
          :participant="p"
          v-bind="playback[p.id]"
          @toggle="emit('toggle', p.id)"
          @seek="emit('seek', p.id, $event)"
        />
      </div>
    </div>
    <div class="duet-scene__note">
      <span>{{ t('showcase.protocol') }}</span>
      <p>{{ t('showcase.protocolNote') }}</p>
      <span>01 — 02</span>
    </div>
  </div>
  <div v-else-if="kind === 'observation' && focused" class="observation-scene">
    <div class="observation-scene__media">
      <div class="observation-scene__selector" :aria-label="t('showcase.chooseTrack')">
        <button
          v-for="p in story.participants"
          :key="p.id"
          type="button"
          :aria-pressed="focusId === p.id"
          @click="emit('focus', p.id)"
        >
          <StageIdentity :participant="p" />
        </button>
      </div>
      <StageMedia
        :participant="focused"
        v-bind="playback[focused.id]"
        @toggle="emit('toggle', focused.id)"
        @seek="emit('seek', focused.id, $event)"
      />
    </div>
    <div class="observation-scene__notes">
      <span class="scene-label">{{ t('showcase.evidence') }}</span>
      <ol>
        <li v-for="(note, index) in story.observations" :key="index">
          <span>0{{ index + 1 }}</span>
          <div>
            <h3>{{ note.title }}</h3>
            <p>{{ note.text }}</p>
          </div>
        </li>
      </ol>
      <blockquote>{{ t('showcase.observationQuote') }}</blockquote>
    </div>
  </div>
  <StageComparison
    v-else-if="kind === 'comparison'"
    :participants="story.participants"
    :metrics="story.metrics"
    :caption="t('showcase.tableCaption')"
  />
  <div v-else class="conclusion-scene">
    <div class="conclusion-scene__statement">
      <span class="scene-label">{{ t('showcase.decision') }}</span>
      <h2>{{ story.conclusion }}</h2>
      <p>{{ t('showcase.conclusionBody') }}</p>
    </div>
    <div class="conclusion-scene__choices">
      <div v-for="p in story.participants" :key="p.id" :data-tone="p.tone">
        <StageIdentity :participant="p" />
        <h3>{{ story.metrics.find((m) => m.id === 'use')?.values[p.id]?.value }}</h3>
        <p>{{ story.metrics.find((m) => m.id === 'use')?.values[p.id]?.note }}</p>
        <span>↗</span>
      </div>
      <small>{{ t('showcase.example') }} · {{ t('showcase.audioNote') }}</small>
    </div>
  </div>
</template>
<style scoped>
.scene-label {
  color: var(--d-muted);
  font-size: 0.73cqw;
  line-height: 1.7;
}
.brief-scene {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5.3cqw;
  align-items: center;
  min-height: 100%;
}
.brief-scene__text h2 {
  font-family: var(--d-serif);
  font-size: 3.2cqw;
  font-weight: 400;
  letter-spacing: -0.04em;
  line-height: 1.5;
  margin: 1.6cqw 0;
}
.brief-scene__text > p {
  color: var(--d-muted);
  font-size: 1.25cqw;
  line-height: 2;
  white-space: pre-line;
}
.brief-scene__rules {
  border-top: 1px solid var(--d-line);
  padding-top: 1.5cqw;
  margin-top: 2.8cqw;
  display: flex;
  flex-wrap: wrap;
  gap: 1.5cqw;
  font-size: 0.73cqw;
  color: var(--d-muted);
}
.brief-scene__rules b {
  font-family: var(--d-mono);
  margin-right: 0.6em;
  font-weight: 400;
  color: var(--d-accent);
}
.brief-scene__diptych {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7cqw;
  height: 22cqw;
}
.brief-scene__diptych img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.brief-scene__diptych img:nth-child(2) {
  margin-top: 2.4cqw;
  height: calc(100% - 2.4cqw);
}
.brief-scene__placeholder {
  display: grid;
  place-items: center;
  grid-column: 1 / -1;
  background: var(--d-surface);
  color: var(--d-faint);
  font-family: var(--d-serif);
  font-size: 3cqw;
}
.brief-scene__identities {
  display: flex;
  justify-content: space-between;
  gap: 2cqw;
  margin-top: 1.2cqw;
  font-size: 1.1cqw;
}
.brief-scene__visual > p {
  font-size: 0.66cqw;
  color: var(--d-muted);
  margin-top: 1.4cqw;
}
.duet-scene__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3.2cqw;
}
.duet-scene__participant > .identity {
  font-size: 1.75cqw;
  margin-bottom: 1.3cqw;
}
.duet-scene__note {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 1.4cqw;
  margin-top: 2cqw;
  color: var(--d-muted);
  font-size: 0.73cqw;
}
.duet-scene__note > span:first-child {
  color: var(--d-text);
}
.duet-scene__note p {
  flex: 1;
}
.duet-scene__note > span:last-child {
  font-family: var(--d-mono);
}
@media (min-width: 701px) {
  @container (max-width: 1000px) {
    .duet-scene__note {
      margin-top: 0.65cqw;
    }
  }
}
.observation-scene {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5cqw;
}
.observation-scene__selector {
  display: flex;
  gap: 1.4cqw;
  margin-bottom: 1.2cqw;
  font-size: 1.1cqw;
}
.observation-scene__selector button {
  text-align: left;
  padding-bottom: 0.65cqw;
  border-bottom: 1px solid transparent;
  color: var(--d-muted);
}
.observation-scene__selector button[aria-pressed='true'] {
  color: var(--d-text);
  border-color: var(--d-accent);
}
.observation-scene__notes {
  padding-top: 0.2cqw;
}
.observation-scene__notes ol {
  margin-top: 0.8cqw;
}
.observation-scene__notes li {
  display: flex;
  gap: 1.5cqw;
  border-bottom: 1px solid var(--d-line);
  padding: 1.5cqw 0;
}
.observation-scene__notes li > span {
  font-family: var(--d-mono);
  font-size: 0.72cqw;
  color: var(--d-accent);
  padding-top: 0.4em;
}
.observation-scene__notes h3 {
  font-weight: 450;
  font-size: 1.32cqw;
  margin-bottom: 0.6cqw;
}
.observation-scene__notes p {
  font-size: 1.13cqw;
  line-height: 1.9;
  color: var(--d-muted);
}
.observation-scene__notes blockquote {
  font-family: var(--d-serif);
  font-size: 1.6cqw;
  line-height: 1.7;
  margin-top: 1.7cqw;
  color: var(--d-accent);
}
.conclusion-scene {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 5cqw;
  align-items: center;
  min-height: 100%;
}
.conclusion-scene__statement h2 {
  white-space: pre-line;
  font-family: var(--d-serif);
  font-size: 3.4cqw;
  font-weight: 400;
  line-height: 1.6;
  letter-spacing: -0.04em;
  margin: 1.5cqw 0;
}
.conclusion-scene__statement > p {
  font-size: 1.05cqw;
  line-height: 2;
  color: var(--d-muted);
  max-width: 34em;
}
.conclusion-scene__choices > div {
  position: relative;
  padding: 1.8cqw 0;
  border-top: 1px solid var(--d-line);
}
.conclusion-scene__choices .identity {
  font-size: 1.3cqw;
}
.conclusion-scene__choices h3 {
  font-size: 2cqw;
  font-weight: 400;
  margin: 1.5cqw 0 0.7cqw;
}
.conclusion-scene__choices p {
  font-size: 0.85cqw;
  color: var(--d-muted);
}
.conclusion-scene__choices > div > span {
  position: absolute;
  right: 0.5cqw;
  top: 3.8cqw;
  font-size: 2cqw;
  color: var(--d-a);
}
.conclusion-scene__choices > div[data-tone='b'] > span {
  color: var(--d-b);
}
.conclusion-scene__choices small {
  display: block;
  font-size: 0.64cqw;
  color: var(--d-muted);
  padding-top: 1cqw;
}
@media (max-width: 700px) {
  .scene-label {
    font-size: 11px;
  }
  .brief-scene,
  .duet-scene__pair,
  .observation-scene,
  .conclusion-scene {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .brief-scene__text h2,
  .conclusion-scene__statement h2 {
    font-size: 32px;
    margin: 20px 0;
  }
  .brief-scene__text > p,
  .conclusion-scene__statement > p {
    font-size: 16px;
  }
  .brief-scene__rules {
    font-size: 11px;
    margin-top: 24px;
    padding-top: 18px;
    gap: 18px;
  }
  .brief-scene__diptych {
    height: 260px;
    gap: 8px;
  }
  .brief-scene__identities {
    font-size: 15px;
    margin-top: 16px;
  }
  .brief-scene__visual > p,
  .conclusion-scene__choices small {
    font-size: 10px;
    margin-top: 16px;
  }
  .duet-scene__participant > .identity {
    font-size: 23px;
    margin-bottom: 18px;
  }
  .duet-scene__note {
    font-size: 11px;
    margin-top: 24px;
    gap: 10px;
    line-height: 1.7;
  }
  .observation-scene__selector {
    font-size: 15px;
    gap: 20px;
    margin-bottom: 20px;
  }
  .observation-scene__notes li {
    padding: 22px 0;
    gap: 18px;
  }
  .observation-scene__notes li > span {
    font-size: 11px;
  }
  .observation-scene__notes h3 {
    font-size: 20px;
    margin-bottom: 10px;
  }
  .observation-scene__notes p {
    font-size: 15px;
  }
  .observation-scene__notes blockquote {
    font-size: 22px;
    margin-top: 22px;
  }
  .conclusion-scene__choices > div {
    padding: 22px 0;
  }
  .conclusion-scene__choices .identity {
    font-size: 18px;
  }
  .conclusion-scene__choices h3 {
    font-size: 28px;
    margin: 22px 0 10px;
  }
  .conclusion-scene__choices p {
    font-size: 13px;
  }
  .conclusion-scene__choices > div > span {
    font-size: 28px;
    right: 10px;
    top: 64px;
  }
}
</style>
