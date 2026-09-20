<script setup lang="ts">
/**
 * 模板画廊（空状态引导，§9.4）
 *
 * 点击模板即创建一个项目并打开（走 store 的创建流程，自动落盘）。
 *
 * M7：这里成了"新建对比"的唯一落点。侧栏的 ＋ 不再就地展开一个小列表，
 * 而是把主区切回本页——模板卡片有名字、有说明、有组成模块，
 * 挤在 260px 宽的侧栏里只能显示成四行小字，白白浪费了它承载的信息。
 * 同时补上"导入 .duet"入口：空状态原本没有任何办法把已有的工程拿进来。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useUiStore } from '@/stores/useUiStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { BUILTIN_TEMPLATES } from '@/services/templateService'
import { t as translate } from '@/i18n/helper'
import { getModuleMeta } from '@/modules/meta'
import { useProjectImport } from '@/composables/useProjectImport'

const { t } = useI18n()
const ui = useUiStore()
const store = useProjectStore()
const { setInput, importing, accept, triggerImport, onFilePicked } = useProjectImport()

const creating = ref<string | null>(null)

const cards = computed(() =>
  BUILTIN_TEMPLATES.filter((template) => template.id.startsWith('stage-')).map((template) => ({
    id: template.id,
    name: translate(template.nameKey),
    desc: translate(template.descKey),
    modules: [
      ...new Set(
        template.fields.map((entry) => getModuleMeta(entry.field.type)?.titleKey ?? 'modules.text'),
      ),
    ],
  })),
)

async function pick(templateId: string, name: string): Promise<void> {
  if (creating.value) return
  creating.value = templateId

  const result = await store.create({ templateId, name })

  creating.value = null
  if (!result.ok) {
    ui.notify(t('errors.projectLoad', { message: result.error }), 'danger')
    return
  }
  ui.notify(t('toast.projectCreated', { title: result.value.title }), 'success')
}
</script>

<template>
  <section class="gallery">
    <header class="gallery__head">
      <span class="gallery__eyebrow">DUET / COMPARATIVE STUDIES</span>
      <h2 class="gallery__title">{{ t('workspace.homeTitle') }}</h2>
      <p class="gallery__desc">{{ t('workspace.homeDescription') }}</p>
      <RouterLink class="gallery__import" :to="{ name: 'showcase' }"
        ><AppIcon name="palette" :size="14" />{{ t('showcase.entry') }} →</RouterLink
      >

      <button class="gallery__import" type="button" :disabled="importing" @click="triggerImport">
        <AppIcon name="import" :size="14" />
        {{ t('export.importProject') }}
      </button>

      <input
        :ref="setInput"
        class="u-visually-hidden"
        type="file"
        :accept="accept"
        @change="onFilePicked"
      />
    </header>

    <ul class="gallery__grid">
      <li
        v-for="card in cards"
        :key="card.id"
        :class="{ gallery__featured: card.id === 'stage-music' }"
      >
        <button
          class="gallery-card"
          type="button"
          :disabled="creating !== null"
          :data-testid="`create-${card.id}`"
          @click="pick(card.id, card.name)"
        >
          <span
            v-if="card.id.startsWith('stage-')"
            class="gallery-card__preview"
            :class="`gallery-card__preview--${card.id}`"
            aria-hidden="true"
          >
            <span class="gallery-card__preview-head">DUET <i>01 — 02</i></span>
            <span class="gallery-card__preview-pair"><i>A</i><i>B</i></span>
            <span class="gallery-card__preview-lines"><i /><i /><i /></span>
          </span>
          <span class="gallery-card__body">
            <span v-if="card.id === 'stage-music'" class="gallery-card__recommended">{{
              t('workspace.recommended')
            }}</span>
            <span class="gallery-card__name">{{ card.name }}</span>
            <span class="gallery-card__desc">{{ card.desc }}</span>
            <span class="gallery-card__modules">
              <span v-for="(key, n) in card.modules" :key="n" class="gallery-card__chip">
                {{ translate(key) }}
              </span>
            </span>
          </span>
          <span class="gallery-card__cta"
            >{{ t('workspace.start') }} <span aria-hidden="true">↗</span></span
          >
        </button>
      </li>
    </ul>
    <p class="gallery__default">{{ t('workspace.defaultHint') }}</p>
  </section>
</template>

<style scoped>
.gallery__eyebrow {
  display: block;
  margin-bottom: 22px;
  font: 10px var(--d-mono);
  letter-spacing: 0.22em;
  color: var(--d-muted);
}
.gallery-card__preview {
  display: block;
  padding: 24px;
  background: var(--d-bg);
  border-bottom: 1px solid var(--d-line);
  height: 156px;
}
.gallery-card__preview-head {
  display: flex;
  justify-content: space-between;
  font: 9px var(--d-mono);
  letter-spacing: 0.14em;
  color: var(--d-muted);
}
.gallery-card__preview-head i {
  font-style: normal;
  font-size: 8px;
}
.gallery-card__preview-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 18px 0 12px;
}
.gallery-card__preview-pair i {
  display: grid;
  place-items: center;
  aspect-ratio: 1.8;
  border: 1px solid var(--d-line);
  font: 28px var(--d-serif);
  font-style: italic;
  color: var(--d-a);
  background: radial-gradient(ellipse at bottom, var(--d-raised), transparent);
}
.gallery-card__preview-pair i + i {
  color: var(--d-b);
}
.gallery-card__preview-lines {
  display: grid;
  gap: 7px;
}
.gallery-card__preview-lines i {
  height: 1px;
  background: var(--d-line);
}
.gallery-card__preview--stage-image .gallery-card__preview-pair i {
  aspect-ratio: 1.7;
  background: linear-gradient(140deg, var(--d-raised) 50%, var(--d-surface) 50%);
}
.gallery-card__preview--stage-generic .gallery-card__preview-pair i {
  border: 0;
  border-bottom: 1px solid var(--d-line);
  aspect-ratio: 2.2;
}
.gallery {
  max-width: 1160px;
  padding: var(--sp-8);
  margin: 0 auto;
}

.gallery__head {
  margin-bottom: var(--sp-8);
  text-align: left;
}

.gallery__title {
  margin-bottom: var(--sp-2);
  font-family: var(--d-serif);
  font-size: clamp(28px, 3vw, 40px);
  font-weight: 450;
  line-height: 1.5;
}

.gallery__desc {
  color: var(--text-muted);
}

.gallery__import {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-2) var(--sp-4);
  margin-top: var(--sp-4);
  margin-right: 12px;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.gallery__import:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.gallery__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-4);
}
.gallery__featured {
  grid-column: span 2;
}
.gallery__grid > li {
  min-width: 0;
}
.gallery__featured .gallery-card {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
}
.gallery__featured .gallery-card__preview {
  grid-row: span 2;
  height: 100%;
  aspect-ratio: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-bottom: 0;
  border-right: 1px solid var(--d-line);
}
.gallery__featured .gallery-card__body {
  justify-content: center;
  padding: 28px;
}
.gallery__featured .gallery-card__cta {
  padding: 0 28px 24px;
  align-self: end;
}
@media (max-width: 1000px) {
  .gallery__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .gallery__featured {
    grid-column: auto;
  }
  .gallery__featured .gallery-card {
    display: flex;
  }
  .gallery__featured .gallery-card__preview {
    aspect-ratio: auto;
    width: 100%;
    height: 156px;
    border-right: 0;
    border-bottom: 1px solid var(--d-line);
  }
  .gallery__grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .gallery {
    padding: 32px 20px;
  }
}

.gallery-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  text-align: left;
  background: var(--d-surface);
  border: 1px solid var(--d-line);
  border-radius: 10px;
  transition:
    border-color var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

.gallery-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.gallery-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-4);
}

.gallery-card__name {
  font-size: var(--fs-md);
  font-weight: 600;
}

.gallery-card__desc {
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.gallery-card__modules {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  margin-top: auto;
  padding-top: var(--sp-3);
}

.gallery-card__chip {
  padding: 1px 7px;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.gallery-card__cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px 20px;
  color: var(--d-muted);
  font-size: 12px;
}

.gallery-card:hover .gallery-card__cta {
  color: var(--d-accent);
}
.gallery-card__recommended {
  color: var(--d-accent);
  font-size: 10px;
  letter-spacing: 0.12em;
}
.gallery__default {
  color: var(--d-muted);
  font-size: 12px;
  line-height: 1.8;
  margin-top: 24px;
}
.gallery-card__preview--stage-blank .gallery-card__preview-pair i {
  border-style: dashed;
  color: var(--d-muted);
}
</style>
