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
  BUILTIN_TEMPLATES.map((template) => ({
    id: template.id,
    name: translate(template.nameKey),
    desc: translate(template.descKey),
    accent: template.accent,
    modules: template.fields.map(
      (entry) => getModuleMeta(entry.field.type)?.titleKey ?? 'modules.text',
    ),
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
      <h2 class="gallery__title">{{ t('compare.emptyTitle') }}</h2>
      <p class="gallery__desc">{{ t('compare.emptyDesc') }}</p>

      <button
        class="gallery__import"
        type="button"
        :disabled="importing"
        @click="triggerImport"
      >
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
      <li v-for="card in cards" :key="card.id">
        <button
          class="gallery-card"
          type="button"
          :disabled="creating !== null"
          @click="pick(card.id, card.name)"
        >
          <span
            class="gallery-card__band"
            :style="{
              background: `linear-gradient(90deg, ${card.accent[0]}, ${card.accent[1]})`,
            }"
            aria-hidden="true"
          />
          <span class="gallery-card__body">
            <span class="gallery-card__name">{{ card.name }}</span>
            <span class="gallery-card__desc">{{ card.desc }}</span>
            <span class="gallery-card__modules">
              <span v-for="key in card.modules" :key="key" class="gallery-card__chip">
                {{ translate(key) }}
              </span>
            </span>
          </span>
          <span class="gallery-card__cta">
            <AppIcon name="plus" :size="14" />
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.gallery {
  max-width: 880px;
  padding: var(--sp-12) var(--sp-8);
  margin: 0 auto;
}

.gallery__head {
  margin-bottom: var(--sp-8);
  text-align: center;
}

.gallery__title {
  margin-bottom: var(--sp-2);
  font-size: var(--fs-2xl);
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
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--sp-4);
}

.gallery-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  text-align: left;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
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

.gallery-card__band {
  height: 3px;
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
  position: absolute;
  top: var(--sp-3);
  right: var(--sp-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border-radius: var(--radius-full);
  opacity: 0;
  transition: opacity var(--dur-base) var(--ease-out);
}

.gallery-card:hover .gallery-card__cta {
  opacity: 1;
}
</style>
