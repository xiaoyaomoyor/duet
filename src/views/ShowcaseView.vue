<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/useUiStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { createShowcaseStory, type ShowcaseFixture } from '@/data/showcaseStory'
import { createShowcaseAudio } from '@/services/showcaseAudio'
import { useStagePlayback } from '@/composables/useStagePlayback'
import type { SceneKind, StageTheme } from '@/components/stage/types'
import StageFrame from '@/components/stage/StageFrame.vue'
import StageScene from '@/components/stage/StageScene.vue'
import DButton from '@/components/design/DButton.vue'
import DDialog from '@/components/design/DDialog.vue'
import DesignSpecimen from '@/components/design/DesignSpecimen.vue'
import '@/styles/design.css'

const { t } = useI18n()
const project = useProjectStore()
const route = useRoute()
const ui = useUiStore()
const themes: StageTheme[] = ['ink', 'paper']
const scenes: SceneKind[] = ['brief', 'duet', 'observation', 'comparison', 'conclusion']
const fixture = ref<ShowcaseFixture>('normal')
const theme = ref<StageTheme>('ink')
const scene = ref<SceneKind>('duet')
const tab = computed(() => (route.name === 'design-reference' ? 'system' : 'preview'))
const clean = ref(false)
watch(clean, (value) => {
  ui.showcaseClean = value
})
const focusId = ref('sonora-demo')
const dialog = ref<'audio' | 's' | 'm' | 'l' | null>(null)
const uploadTarget = ref('sonora-demo')
const status = ref('')
const mediaUrls = reactive<Record<string, string>>({})
const replacements = reactive<Record<string, string>>({})
const customTitles = reactive<Record<string, string>>({})
const customNotes = reactive<Record<string, string>>({})
const draftTitle = ref('')
const draftNote = ref('')
const invalid = ref(false)
const draftId = ref('sonora-demo')
const playback = useStagePlayback()
const { state: playbackState } = playback
const ownedUrls = new Set<string>()
const sceneIndex = computed(() => scenes.indexOf(scene.value))
const story = computed(() => {
  const result = createShowcaseStory(t, fixture.value)
  result.participants = result.participants.map((p) => ({
    ...p,
    ...(p.source ? { source: replacements[p.id] || mediaUrls[p.id] || p.source } : {}),
    track: customTitles[p.id] || p.track,
    description: customNotes[p.id] || p.description,
  }))
  return result
})
const reading = computed(
  () =>
    fixture.value === 'long' ||
    story.value.participants.some(
      (p) => p.track.length > 40 || p.description.length > 90 || p.description.includes('\n'),
    ),
)
const dialogTitle = computed(() =>
  t(
    `showcase.${dialog.value === 'audio' ? 'importTitle' : dialog.value === 's' ? 'confirmTitle' : dialog.value === 'l' ? 'longEditor' : 'formTitle'}`,
  ),
)
const returnPath = computed(() => (project.current ? `/p/${project.current.id}` : '/compare'))

function own(blob: Blob): string {
  const url = URL.createObjectURL(blob)
  ownedUrls.add(url)
  return url
}
function release(url: string | undefined): void {
  if (url && ownedUrls.delete(url)) URL.revokeObjectURL(url)
}
onMounted(() => {
  mediaUrls['sonora-demo'] = own(createShowcaseAudio('a'))
  mediaUrls['auralis-demo'] = own(createShowcaseAudio('b'))
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  ui.showcaseClean = false
  playback.pauseAll()
  for (const url of [...ownedUrls]) release(url)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', onVisibility)
})
watch([scene, fixture, focusId, tab], () => playback.pauseAll())
watch(tab, () => {
  clean.value = false
  dialog.value = null
})
function onVisibility(): void {
  if (document.hidden) playback.pauseAll()
}
function move(offset: number): void {
  const next = scenes[sceneIndex.value + offset]
  if (next) scene.value = next
}
function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.repeat || dialog.value) return
  if (event.key === 'Escape' && clean.value) {
    clean.value = false
    return
  }
  if (
    !clean.value ||
    (event.target instanceof HTMLElement &&
      event.target.closest('input, textarea, select, button, [contenteditable]'))
  )
    return
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault()
    move(event.key === 'ArrowRight' ? 1 : -1)
  }
}
function openDialog(size: 's' | 'm' | 'l' | 'audio'): void {
  playback.pauseAll()
  invalid.value = false
  const p =
    story.value.participants.find((p) => p.id === focusId.value) ?? story.value.participants[0]!
  draftId.value = p.id
  draftTitle.value = p.track
  draftNote.value = p.description
  dialog.value = size
}
function saveDraft(): void {
  invalid.value = !draftTitle.value.trim()
  if (invalid.value) return
  customTitles[draftId.value] = draftTitle.value.trim()
  customNotes[draftId.value] = draftNote.value.trim()
  dialog.value = null
  status.value = t('showcase.saved')
}
function reset(): void {
  playback.pauseAll()
  for (const key of Object.keys(replacements)) {
    release(replacements[key])
    delete replacements[key]
  }
  for (const key of Object.keys(customTitles)) delete customTitles[key]
  for (const key of Object.keys(customNotes)) delete customNotes[key]
  theme.value = 'ink'
  fixture.value = 'normal'
  scene.value = 'duet'
  dialog.value = null
  status.value = ''
}
function importAudio(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  playback.pauseAll()
  release(replacements[uploadTarget.value])
  replacements[uploadTarget.value] = own(file)
  customTitles[uploadTarget.value] = file.name.replace(/\.[^.]+$/, '')
  fixture.value = 'normal'
  scene.value = 'duet'
  status.value = t('showcase.imported')
  dialog.value = null
  input.value = ''
}
function restoreAudio(): void {
  playback.pauseAll()
  release(replacements[uploadTarget.value])
  delete replacements[uploadTarget.value]
  delete customTitles[uploadTarget.value]
  fixture.value = 'normal'
  dialog.value = null
}
</script>

<template>
  <div class="showcase" :class="{ 'showcase--clean': clean }" :data-design-theme="theme">
    <header v-show="!clean" class="showcase__topbar">
      <div class="showcase__heading">
        <h1>{{ t(tab === 'system' ? 'workspace.design' : 'showcase.entry') }}</h1>
        <RouterLink :to="tab === 'system' ? '/settings/about' : returnPath"
          >← {{ t(tab === 'system' ? 'workspace.backAbout' : 'showcase.back') }}</RouterLink
        >
      </div>
      <div class="showcase__themes" :aria-label="t('settings.theme')">
        <button
          v-for="value in themes"
          :key="value"
          type="button"
          :aria-pressed="theme === value"
          @click="theme = value"
        >
          <i :class="`swatch--${value}`" />{{ t(`showcase.${value}`) }}
        </button>
      </div>
    </header>
    <div v-if="tab === 'preview'" class="showcase__workspace">
      <aside v-show="!clean" class="showcase__rail">
        <div class="d-kicker">{{ t('showcase.structure') }}</div>
        <nav :aria-label="t('showcase.scenes')">
          <button
            v-for="(kind, index) in scenes"
            :key="kind"
            type="button"
            :aria-current="scene === kind ? 'step' : undefined"
            @click="scene = kind"
          >
            <span class="showcase__scene-number">0{{ index + 1 }}</span
            ><span
              ><strong>{{ t(`showcase.${kind}`) }}</strong
              ><small>{{ t(`showcase.${kind}Hint`) }}</small></span
            ><i aria-hidden="true" />
          </button>
        </nav>
        <div class="showcase__rail-foot">
          <span class="showcase__rail-edition">DUET / SAMPLES</span>
          <p>{{ t('showcase.footer') }}</p>
          <RouterLink :to="returnPath">← {{ t('showcase.back') }}</RouterLink>
        </div>
      </aside>
      <main class="showcase__main">
        <header v-show="!clean" class="showcase__intro">
          <div>
            <span class="d-kicker">{{ t('showcase.edition') }}</span>
            <h2>{{ t('showcase.title') }}</h2>
            <p>{{ t('showcase.subtitle') }}</p>
          </div>
          <DButton icon="present" tone="primary" @click="clean = true">{{
            t('showcase.clean')
          }}</DButton>
        </header>
        <div v-show="!clean" class="showcase__tools">
          <label
            >{{ t('showcase.fixture')
            }}<select v-model="fixture">
              <option v-for="key in ['normal', 'empty', 'long'] as const" :key="key" :value="key">
                {{ t(`showcase.${key}`) }}
              </option>
            </select></label
          ><span>{{ t('showcase.example') }}</span
          ><DButton compact tone="quiet" icon="music" @click="openDialog('audio')">{{
            t('showcase.changeAudio')
          }}</DButton>
        </div>
        <p v-if="reading" class="showcase__reading-note">
          {{ t('showcase.readingNote') }}
        </p>
        <div class="showcase__preview" :class="{ 'showcase__preview--reading': reading }">
          <div class="showcase__canvas">
            <Transition name="scene-change" mode="out-in"
              ><StageFrame
                :key="scene"
                :index="sceneIndex"
                :total="scenes.length"
                :title="t(`showcase.${scene}Title`)"
                :kicker="`0${sceneIndex + 1} / ${t(`showcase.${scene}`).toUpperCase()}`"
                :note="t('showcase.example')"
                :reading="reading"
                ><StageScene
                  :kind="scene"
                  :story="story"
                  :focus-id="focusId"
                  :playback="playbackState"
                  @toggle="playback.toggle"
                  @seek="playback.seek"
                  @focus="focusId = $event" /></StageFrame
            ></Transition>
          </div>
        </div>
        <footer v-show="!clean" class="showcase__bottom">
          <span>{{ t('showcase.audioNote') }}</span>
          <div>
            <DButton
              compact
              tone="quiet"
              icon="chevron-left"
              :disabled="sceneIndex === 0"
              :aria-label="t('showcase.previous')"
              @click="move(-1)"
            /><span>{{ sceneIndex + 1 }} / {{ scenes.length }}</span
            ><DButton
              compact
              tone="quiet"
              icon="chevron-right"
              :disabled="sceneIndex === scenes.length - 1"
              :aria-label="t('showcase.next')"
              @click="move(1)"
            />
          </div>
          <span class="showcase__ratio">{{ t('showcase.ratio') }}</span>
        </footer>
      </main>
    </div>
    <main v-else>
      <p class="showcase__design-note">{{ t('workspace.designDescription') }}</p>
      <DesignSpecimen @window="openDialog" />
    </main>
    <div v-if="clean" class="showcase__clean-controls">
      <div>
        <DButton
          icon="chevron-left"
          :disabled="sceneIndex === 0"
          :aria-label="t('showcase.previous')"
          @click="move(-1)"
        /><span>{{ sceneIndex + 1 }} / {{ scenes.length }}</span
        ><DButton
          icon="chevron-right"
          :disabled="sceneIndex === scenes.length - 1"
          :aria-label="t('showcase.next')"
          @click="move(1)"
        /><DButton icon="palette" @click="theme = theme === 'ink' ? 'paper' : 'ink'">{{
          t(`showcase.${theme === 'ink' ? 'paper' : 'ink'}`)
        }}</DButton
        ><DButton icon="close" @click="clean = false">{{ t('showcase.exitClean') }}</DButton>
      </div>
    </div>
    <p v-if="status && !clean" class="showcase__status" role="status">{{ status }}</p>
    <div hidden aria-hidden="true">
      <audio
        v-for="p in story.participants"
        :key="p.id"
        :ref="(el) => playback.register(p.id, el as HTMLAudioElement | null)"
        :data-participant="p.id"
        :src="p.source?.startsWith('blob:') ? p.source : undefined"
        preload="metadata"
        @loadedmetadata="playback.update(p.id)"
        @emptied="playback.update(p.id)"
        @play="playback.update(p.id)"
        @pause="playback.update(p.id)"
        @timeupdate="playback.update(p.id)"
        @ended="playback.update(p.id)"
        @error="playback.update(p.id)"
      />
    </div>
    <DDialog
      :open="dialog !== null"
      :title="dialogTitle"
      :theme="theme"
      :size="dialog === 'audio' ? 'm' : (dialog ?? 'm')"
      :danger="dialog === 's'"
      :description="
        t(
          `showcase.${dialog === 's' ? 'confirmDescription' : dialog === 'audio' ? 'importDescription' : 'formDescription'}`,
        )
      "
      @close="dialog = null"
    >
      <div v-if="dialog === 'audio'" class="showcase__form">
        <label class="d-field"
          >{{ t('showcase.chooseTrack')
          }}<select v-model="uploadTarget" class="d-input">
            <option v-for="p in story.participants" :key="p.id" :value="p.id">
              {{ p.label }} · {{ p.track }}
            </option>
          </select></label
        ><label class="d-field"
          >{{ t('showcase.chooseFile')
          }}<input class="d-input" type="file" accept="audio/*" @change="importAudio"
        /></label>
      </div>
      <p v-else-if="dialog === 's'" class="d-muted">{{ t('showcase.confirmScope') }}</p>
      <form
        v-else
        class="showcase__form-layout"
        :class="{ 'showcase__form-layout--wide': dialog === 'l' }"
        @submit.prevent="saveDraft"
      >
        <div class="showcase__form">
          <label class="d-field"
            >{{ t('showcase.nameLabel')
            }}<input
              v-model="draftTitle"
              data-modal-autofocus
              class="d-input"
              :aria-invalid="invalid"
              :aria-describedby="invalid ? 'showcase-title-error' : undefined"
            /><small v-if="invalid" id="showcase-title-error" class="d-error">{{
              t('showcase.nameRequired')
            }}</small></label
          ><label class="d-field"
            >{{ t('showcase.noteLabel')
            }}<textarea
              v-model="draftNote"
              class="d-input"
              :placeholder="t('showcase.formPlaceholder')"
              :rows="dialog === 'l' ? 10 : 4"
            /></label
          ><button type="submit" hidden>
            {{ t('showcase.save') }}
          </button>
        </div>
        <aside v-if="dialog === 'l'" class="showcase__draft">
          <span class="d-kicker">{{ t('showcase.preview') }}</span>
          <h3>{{ draftTitle }}</h3>
          <p>{{ draftNote }}</p>
        </aside>
      </form>
      <template #footer
        ><DButton v-if="dialog === 'audio'" tone="quiet" @click="restoreAudio">{{
          t('showcase.resetAudio')
        }}</DButton
        ><DButton v-else-if="dialog === 's'" tone="danger" @click="reset">{{
          t('showcase.confirm')
        }}</DButton
        ><DButton v-else tone="primary" @click="saveDraft">{{ t('showcase.save') }}</DButton
        ><DButton @click="dialog = null">{{ t('common.close') }}</DButton></template
      >
    </DDialog>
  </div>
</template>

<style scoped>
.showcase {
  min-height: 100%;
  overflow-y: auto;
}
.showcase--clean {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay, 100);
  height: 100dvh;
}
.showcase__heading {
  display: flex;
  align-items: center;
  gap: 24px;
}
.showcase__heading h1 {
  font-size: 16px;
  font-weight: 500;
}
.showcase__heading a {
  font-size: 12px;
  color: var(--d-muted);
}
.showcase__design-note {
  max-width: 1100px;
  margin: 24px auto 0;
  padding: 0 48px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--d-muted);
}
.showcase__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 64px;
  padding: 0 32px;
  border-bottom: 1px solid var(--d-line);
}
.showcase__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--d-text);
  font-size: 24px;
  letter-spacing: -0.04em;
  font-weight: 550;
  text-decoration: none;
}
.showcase__brand small {
  font-size: 12px;
  font-weight: 400;
  color: var(--d-muted);
  letter-spacing: 0;
}
.showcase__brand-divider {
  margin: 0 6px;
  color: var(--d-line);
  font-weight: 300;
}
.showcase__mark {
  display: flex;
  gap: 3px;
  height: 20px;
  align-items: center;
  margin-right: 3px;
}
.showcase__mark i {
  width: 3px;
  height: 11px;
  background: var(--d-accent);
}
.showcase__mark i:nth-child(2) {
  height: 20px;
}
.showcase__mark i:nth-child(3) {
  height: 14px;
  background: var(--d-b);
}
.showcase__tabs,
.showcase__themes {
  display: flex;
  gap: 6px;
}
.showcase__tabs button {
  padding: 22px 18px;
  border-bottom: 2px solid transparent;
  font-size: 12px;
  color: var(--d-muted);
}
.showcase__tabs button[aria-pressed='true'] {
  border-color: var(--d-accent);
  color: var(--d-text);
}
.showcase__themes {
  padding: 4px;
  background: var(--d-surface);
  border: 1px solid var(--d-line);
  border-radius: 6px;
}
.showcase__themes button {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 9px;
  color: var(--d-muted);
  border-radius: 3px;
  font-size: 11px;
}
.showcase__themes button[aria-pressed='true'] {
  color: var(--d-text);
  background: var(--d-raised);
}
.showcase__themes i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid var(--d-muted);
}
.swatch--ink {
  background: #101414;
}
.swatch--paper {
  background: #f2f0e9;
}
.showcase__workspace {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  min-height: calc(100dvh - 64px);
}
.showcase__rail {
  display: flex;
  flex-direction: column;
  padding: 34px 18px 26px;
  border-right: 1px solid var(--d-line);
}
.showcase__rail > .d-kicker {
  padding-left: 14px;
  margin-bottom: 24px;
  font-size: 10px;
}
.showcase__rail nav {
  display: grid;
  gap: 5px;
}
.showcase__rail nav button {
  display: flex;
  align-items: baseline;
  gap: 13px;
  text-align: left;
  padding: 17px 14px;
  border-radius: 6px;
  color: var(--d-muted);
}
.showcase__rail nav button:hover {
  background: var(--d-surface);
}
.showcase__rail nav button[aria-current='step'] {
  color: var(--d-text);
  background: var(--d-surface);
}
.showcase__scene-number {
  font-family: var(--d-mono);
  font-size: 10px;
}
.showcase__rail nav strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
}
.showcase__rail nav small {
  display: block;
  font-size: 10px;
  margin-top: 7px;
  color: var(--d-muted);
}
.showcase__rail nav i {
  width: 4px;
  height: 4px;
  margin-left: auto;
  align-self: center;
  border-radius: 50%;
}
.showcase__rail nav [aria-current='step'] i {
  background: var(--d-accent);
}
.showcase__rail-foot {
  padding: 40px 14px 0;
  margin-top: auto;
}
.showcase__rail-edition {
  font-family: var(--d-mono);
  color: var(--d-accent);
  font-size: 10px;
}
.showcase__rail-foot p {
  font-size: 10px;
  color: var(--d-muted);
  line-height: 1.9;
  margin: 12px 0 20px;
}
.showcase__rail-foot a {
  font-size: 11px;
  color: var(--d-muted);
}
.showcase__main {
  min-width: 0;
  padding: 32px 36px 20px;
}
.showcase__intro {
  display: flex;
  gap: 24px;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 26px;
}
.showcase__intro h2 {
  font-size: 25px;
  font-weight: 450;
  letter-spacing: -0.025em;
  margin-top: 10px;
}
.showcase__intro p {
  color: var(--d-muted);
  font-size: 12px;
  margin-top: 10px;
}
.showcase__tools {
  display: flex;
  gap: 18px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 10px;
  color: var(--d-muted);
}
.showcase__tools label {
  display: flex;
  align-items: center;
  gap: 10px;
}
.showcase__tools select {
  border: none;
  background: var(--d-surface);
  border-radius: 4px;
  color: var(--d-text);
  padding: 6px 10px;
  font-size: 11px;
}
.showcase__tools > button {
  margin-left: auto;
}
.showcase__preview {
  max-width: calc((100dvh - 360px) * 16 / 9);
  margin-inline: auto;
  display: flex;
  justify-content: center;
  align-items: start;
  border: 1px solid var(--d-line);
  box-shadow: var(--d-shadow);
  background: var(--d-bg);
}
.showcase__canvas {
  width: 100%;
  container-type: inline-size;
}
.showcase__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 16px;
  font-size: 10px;
  color: var(--d-muted);
}
.showcase__bottom > div {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--d-mono);
}
.showcase__reading-note {
  color: var(--d-muted);
  font-size: 12px;
  line-height: 1.7;
  margin-bottom: 14px;
}
.showcase__status {
  position: fixed;
  right: 24px;
  bottom: 24px;
  padding: 12px 18px;
  border: 1px solid var(--d-line);
  border-radius: 6px;
  color: var(--d-text);
  background: var(--d-raised);
  font-size: 12px;
}
.showcase--clean .showcase__workspace {
  display: block;
  min-height: 100dvh;
}
.showcase--clean .showcase__main {
  padding: 0;
}
.showcase--clean .showcase__preview {
  max-width: none;
  min-height: 100dvh;
  align-items: center;
  border: 0;
  box-shadow: none;
}
.showcase--clean .showcase__canvas {
  width: min(100%, calc(100dvh * 16 / 9));
}
.showcase--clean .showcase__preview--reading {
  align-items: start;
}
.showcase__preview--reading {
  max-width: none;
}
.showcase--clean .showcase__reading-note {
  padding: 12px 24px;
  margin: 0;
}
.showcase__clean-controls {
  position: fixed;
  inset: auto 0 0;
  z-index: 10;
  display: flex;
  justify-content: center;
  padding: 24px;
}
.showcase__clean-controls > div {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--d-line);
  background: var(--d-surface);
  box-shadow: var(--d-shadow);
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity var(--d-fast),
    transform var(--d-fast);
}
.showcase__clean-controls:hover > div,
.showcase__clean-controls:focus-within > div {
  opacity: 1;
  transform: none;
}
.showcase__clean-controls span {
  font: 11px var(--d-mono);
  padding: 0 4px;
}
.showcase__form {
  display: grid;
  gap: 24px;
}
.showcase__form-layout--wide {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}
.showcase__draft {
  padding: 24px;
  background: var(--d-bg);
  border-radius: 10px;
  border: 1px solid var(--d-line);
}
.showcase__draft h3 {
  margin: 24px 0 18px;
  font-family: var(--d-serif);
  font-weight: 400;
  font-size: 28px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.showcase__draft p {
  color: var(--d-muted);
  line-height: 1.9;
  font-size: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.scene-change-enter-active,
.scene-change-leave-active {
  transition:
    opacity var(--d-fast) var(--d-ease),
    transform var(--d-fast) var(--d-ease);
}
.scene-change-enter-from {
  opacity: 0;
  transform: translateY(5px);
}
.scene-change-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
@media (min-width: 1900px) {
  .showcase__main {
    padding: 40px 64px;
  }
  .showcase__workspace {
    grid-template-columns: 250px minmax(0, 1fr);
  }
}
@media (max-width: 1050px) {
  .showcase__workspace {
    grid-template-columns: 175px minmax(0, 1fr);
  }
  .showcase__main {
    padding: 26px 22px;
  }
  .showcase__rail {
    padding-inline: 10px;
  }
  .showcase__rail nav small {
    display: none;
  }
  .showcase__ratio {
    display: none;
  }
}
@media (max-width: 700px) {
  .showcase__preview {
    max-width: none;
  }
  .showcase__topbar {
    padding: 12px 20px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .showcase__tabs {
    order: 3;
    width: 100%;
  }
  .showcase__tabs button {
    padding: 12px 16px;
  }
  .showcase__workspace {
    display: block;
  }
  .showcase__rail {
    border-right: 0;
    padding: 16px;
    overflow-x: auto;
  }
  .showcase__rail nav {
    display: flex;
    min-width: max-content;
  }
  .showcase__rail nav button {
    padding: 10px 12px;
  }
  .showcase__rail > .d-kicker,
  .showcase__rail-foot {
    display: none;
  }
  .showcase__main {
    padding: 16px;
  }
  .showcase__intro {
    align-items: start;
    gap: 12px;
  }
  .showcase__intro h2 {
    font-size: 20px;
  }
  .showcase__intro > button {
    font-size: 11px;
    padding: 9px;
  }
  .showcase__intro .d-kicker {
    font-size: 9px;
  }
  .showcase__tools {
    flex-wrap: wrap;
  }
  .showcase__bottom {
    flex-wrap: wrap;
  }
  .showcase__bottom > span {
    font-size: 9px;
  }
  .showcase--clean .showcase__canvas {
    width: 100%;
  }
  .showcase__form-layout--wide {
    grid-template-columns: 1fr;
  }
  .showcase__clean-controls {
    padding: 12px;
  }
  .showcase__clean-controls > div {
    gap: 4px;
  }
}
@media (min-width: 701px) and (max-height: 800px) {
  .showcase__main {
    padding: 20px 28px 16px;
  }
  .showcase__intro {
    margin-bottom: 12px;
  }
  .showcase__intro .d-kicker,
  .showcase__intro p {
    display: none;
  }
  .showcase__intro h2 {
    margin-top: 0;
    font-size: 21px;
  }
  .showcase__preview {
    max-width: calc((100dvh - 250px) * 16 / 9);
  }
  .showcase__preview--reading {
    max-width: none;
  }
}
@media (min-width: 701px) and (max-height: 600px) {
  .showcase__preview {
    max-width: none;
  }
}
</style>
