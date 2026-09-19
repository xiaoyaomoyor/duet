<script setup lang="ts">
/**
 * 外观设置：主题 / 动效强度
 *
 * 主题现在是四选一：跟随系统 / 暗 / 亮 / 紫夜。
 * 每张卡片都画出**该主题真实的样子**（用它自己的底色与文字色），
 * 而不是统一用当前主题渲染——否则用户在暗色下看到的四张卡片长得一样，
 * 选择就变成了盲选。这里的内联色值来自 tokens.css，
 * 是"预览缩略图"这一种特殊场景，属于 §11.1 纪律的合理例外。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import SettingsField from '@/components/common/SettingsField.vue'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { resolveTheme } from '@/lib/theme'
import type { ThemeId } from '@/types'

const { t } = useI18n()
const settings = useSettingsStore()

interface ThemeOption {
  id: ThemeId
  labelKey: string
  /** 缩略图配色：[底色, 卡片色, 主文字色, 强调色] */
  swatch: [string, string, string, string]
  /** 跟随系统：缩略图画成左暗右亮，直观表达"跟着系统变" */
  split?: boolean
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'system',
    labelKey: 'settings.themeSystem',
    split: true,
    swatch: ['#101414', '#191e1d', '#eeeae2', '#d9bd91'],
  },
  {
    id: 'dark',
    labelKey: 'settings.themeDark',
    swatch: ['#101414', '#191e1d', '#eeeae2', '#d9bd91'],
  },
  {
    id: 'light',
    labelKey: 'settings.themeLight',
    swatch: ['#f2f0e9', '#fbf9f3', '#222c2c', '#6f512a'],
  },
  {
    id: 'violet-dark',
    labelKey: 'settings.themeVioletDark',
    swatch: ['#150f26', '#1d1533', '#f3effb', '#a78bfa'],
  },
]

const previewStyle = (option: ThemeOption): Record<string, string> =>
  option.split
    ? { background: `linear-gradient(90deg, ${option.swatch[0]} 0 50%, #fafafa 50% 100%)` }
    : { background: option.swatch[0] }

/** 当前真正生效的具体主题（system 会被解析掉），用于在"跟随系统"卡片上标注实际结果 */
const effective = computed(() => resolveTheme(settings.settings.themeId))

async function choose(id: ThemeId): Promise<void> {
  await settings.patch({ themeId: id })
}

const motionOptions = computed(() => [
  { value: 'auto' as const, label: t('settings.reducedMotionAuto') },
  { value: 'always' as const, label: t('settings.reducedMotionAlways') },
  { value: 'never' as const, label: t('settings.reducedMotionNever') },
])

async function updateMotion(value: 'auto' | 'always' | 'never'): Promise<void> {
  await settings.patch({ reducedMotion: value })
}
</script>

<template>
  <h3 class="panel__heading">{{ t('settings.appearance') }}</h3>

  <SettingsField :label="t('settings.theme')" :hint="t('settings.themeHint')">
    <div class="themes" role="radiogroup" :aria-label="t('settings.theme')">
      <button
        v-for="option in THEME_OPTIONS"
        :key="option.id"
        class="theme"
        type="button"
        role="radio"
        :aria-checked="settings.settings.themeId === option.id"
        :class="{ 'theme--active': settings.settings.themeId === option.id }"
        @click="choose(option.id)"
      >
        <span class="theme__preview" aria-hidden="true" :style="previewStyle(option)">
          <span class="theme__preview-card" :style="{ background: option.swatch[1] }">
            <span class="theme__preview-line" :style="{ background: option.swatch[2] }" />
            <span
              class="theme__preview-line theme__preview-line--short"
              :style="{ background: option.swatch[2], opacity: 0.6 }"
            />
          </span>
          <span class="theme__preview-accent" :style="{ background: option.swatch[3] }" />
        </span>

        <span class="theme__label">
          {{ t(option.labelKey) }}
          <!-- 跟随系统时把"实际落到了哪个主题"写出来，避免用户以为没生效 -->
          <span v-if="option.id === 'system'" class="theme__resolved">
            {{
              t(
                `settings.theme${effective === 'light' ? 'Light' : effective === 'dark' ? 'Dark' : 'VioletDark'}`,
              )
            }}
          </span>
        </span>

        <AppIcon
          v-if="settings.settings.themeId === option.id"
          name="check"
          :size="15"
          class="theme__check"
        />
      </button>
    </div>
  </SettingsField>

  <SettingsField :label="t('settings.reducedMotion')">
    <select
      class="control"
      :value="settings.settings.reducedMotion"
      @change="
        updateMotion(($event.target as HTMLSelectElement).value as 'auto' | 'always' | 'never')
      "
    >
      <option v-for="option in motionOptions" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </SettingsField>
</template>

<style scoped>
.panel__heading {
  margin-bottom: var(--sp-5);
  font-size: var(--fs-lg);
}

.themes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--sp-3);
}

.theme {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  text-align: left;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.theme:hover {
  background: var(--bg-hover);
}

.theme--active {
  border-color: var(--accent-500);
}

/* 缩略图：用主题自己的颜色画，让用户直接看到"选了会变成什么样" */
.theme__preview {
  position: relative;
  display: block;
  height: 46px;
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}

.theme__preview-card {
  position: absolute;
  inset: 8px 10px auto 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 7px;
  border-radius: 3px;
}

.theme__preview-line {
  display: block;
  width: 100%;
  height: 3px;
  border-radius: 2px;
}

.theme__preview-line--short {
  width: 58%;
}

.theme__preview-accent {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
}

.theme__label {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: var(--fs-sm);
  color: var(--text-primary);
}

.theme__resolved {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.theme__check {
  position: absolute;
  top: var(--sp-3);
  right: var(--sp-3);
  color: var(--accent-500);
}

.control {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}
</style>
