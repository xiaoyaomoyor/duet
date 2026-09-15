<script setup lang="ts">
/**
 * 工具表单（新建 / 编辑自定义工具）
 *
 * 设计取舍：品牌色用**预设色板**而非自由取色器——
 * 用户自建工具的目的是快速建对比，色板能保证与紫夜主题的协调，
 * 也避免出现低对比度的脏色（§11.3）。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import ToolIcon from '@/components/common/ToolIcon.vue'
import { TOOL_CATEGORIES } from '@/data/builtinTools'
import { FALLBACK_TOOL_COLORS } from '@/lib/icons'
import { importBlob } from '@/services/assetService'
import { useToolsStore } from '@/stores/useToolsStore'
import type { DisplayTool } from '@/services/toolService'
import type { ToolCategory } from '@/types/project'

const props = defineProps<{
  open: boolean
  /** 传入则为编辑模式 */
  tool?: DisplayTool | null
}>()

const emit = defineEmits<{ close: []; saved: [name: string] }>()

const { t } = useI18n()
const tools = useToolsStore()

const name = ref('')
const vendor = ref('')
const category = ref<ToolCategory>('other')
const homepage = ref('')
const aliases = ref('')
const color = ref<string>(FALLBACK_TOOL_COLORS[0])
const iconAssetId = ref<string | undefined>(undefined)
const uploading = ref(false)
const error = ref<string | null>(null)

const isEdit = computed(() => Boolean(props.tool?.id && tools.customTools.some((item) => item.id === props.tool?.id)))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const source = props.tool
    name.value = source?.name ?? ''
    vendor.value = source?.vendor ?? ''
    category.value = source?.category ?? 'other'
    homepage.value = source?.homepage ?? ''
    aliases.value = source?.aliases.join(', ') ?? ''
    color.value = source?.color ?? FALLBACK_TOOL_COLORS[0]
    iconAssetId.value = source?.iconAssetId
    error.value = null
  },
  { immediate: true },
)

async function pickIcon(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  uploading.value = true
  try {
    const imported = await importBlob(file, file.name, { kind: 'icon' })
    if (!imported.ok) {
      error.value = imported.error
      return
    }
    iconAssetId.value = imported.value.id
  } finally {
    uploading.value = false
  }
}

async function save(): Promise<void> {
  error.value = null
  const trimmed = name.value.trim()
  if (!trimmed) {
    error.value = t('tools.namePlaceholder')
    return
  }

  const payload = {
    name: trimmed,
    category: category.value,
    color: color.value,
    aliases: aliases.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
    vendor: vendor.value.trim(),
    homepage: homepage.value.trim(),
  }

  const target = props.tool
  const okResult =
    isEdit.value && target
      ? await tools.update(target.id, {
          ...payload,
          ...(iconAssetId.value ? { iconAssetId: iconAssetId.value } : {}),
        })
      : await tools.create({
          ...payload,
          ...(iconAssetId.value ? { iconAssetId: iconAssetId.value } : {}),
        })

  if (!okResult) {
    error.value = tools.lastError ?? t('errors.unknown')
    return
  }

  emit('saved', trimmed)
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

/** 供模板调用的预览名（未填时用占位） */
const previewName = computed(() => name.value.trim() || t('tools.newTool'))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @click.self="emit('close')" @keydown="onKeydown">
      <div class="form" role="dialog" aria-modal="true" :aria-label="isEdit ? t('tools.editTool') : t('tools.newTool')">
        <header class="form__head">
          <h2 class="form__title">{{ isEdit ? t('tools.editTool') : t('tools.newTool') }}</h2>
          <button class="form__close" type="button" :aria-label="t('common.close')" @click="emit('close')">
            <AppIcon name="close" :size="16" />
          </button>
        </header>

        <div class="form__preview">
          <ToolIcon :name="previewName" :color="color" :icon-asset-id="iconAssetId" :size="40" />
          <span class="form__preview-name">{{ previewName }}</span>
          <button
            v-if="iconAssetId"
            class="form__link"
            type="button"
            @click="iconAssetId = undefined"
          >
            {{ t('common.removeIcon') }}
          </button>
        </div>

        <div class="form__grid">
          <label class="form__row">
            <span class="form__label">{{ t('common.name') }}</span>
            <input v-model="name" class="input" type="text" :placeholder="t('tools.namePlaceholder')" />
          </label>

          <label class="form__row">
            <span class="form__label">{{ t('tools.vendor') }}</span>
            <input v-model="vendor" class="input" type="text" :placeholder="t('tools.vendorPlaceholder')" />
          </label>

          <label class="form__row">
            <span class="form__label">{{ t('common.category') }}</span>
            <select v-model="category" class="input">
              <option v-for="item in TOOL_CATEGORIES" :key="item.id" :value="item.id">
                {{ t(item.labelKey) }}
              </option>
            </select>
          </label>

          <label class="form__row">
            <span class="form__label">{{ t('tools.homepage') }}</span>
            <input v-model="homepage" class="input" type="url" :placeholder="t('tools.homepagePlaceholder')" />
          </label>

          <label class="form__row form__row--wide">
            <span class="form__label">{{ t('tools.aliases') }}</span>
            <input v-model="aliases" class="input" type="text" :placeholder="t('tools.aliasesPlaceholder')" />
          </label>

          <div class="form__row form__row--wide">
            <span class="form__label">{{ t('common.color') }}</span>
            <div class="swatches">
              <button
                v-for="swatch in FALLBACK_TOOL_COLORS"
                :key="swatch"
                class="swatch"
                type="button"
                :class="{ 'swatch--active': color === swatch }"
                :style="{ background: swatch }"
                :aria-label="swatch"
                :aria-pressed="color === swatch"
                @click="color = swatch"
              />
            </div>
          </div>

          <div class="form__row form__row--wide">
            <span class="form__label">{{ t('common.icon') }}</span>
            <label class="upload">
              <input class="u-visually-hidden" type="file" accept="image/*" @change="pickIcon" />
              <AppIcon name="image" :size="14" />
              {{ uploading ? t('common.loading') : t('common.upload') }}
            </label>
          </div>
        </div>

        <p v-if="error" class="form__error">{{ error }}</p>

        <footer class="form__foot">
          <button class="btn" type="button" @click="emit('close')">{{ t('common.cancel') }}</button>
          <button class="btn btn--primary" type="button" @click="save">{{ t('common.save') }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
}

.form {
  width: min(520px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  padding: var(--sp-5);
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
}

.form__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-4);
}

.form__title {
  font-size: var(--fs-lg);
}

.form__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.form__close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.form__preview {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  padding: var(--sp-3);
  margin-bottom: var(--sp-4);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.form__preview-name {
  flex: 1;
  font-size: var(--fs-md);
  font-weight: 600;
}

.form__link {
  font-size: var(--fs-xs);
  color: var(--accent-500);
}

.form__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
}

.form__row {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.form__row--wide {
  grid-column: 1 / -1;
}

.form__label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.input {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.swatch {
  width: 22px;
  height: 22px;
  border: 2px solid transparent;
  border-radius: var(--radius-full);
}

.swatch--active {
  border-color: var(--text-primary);
}

.upload {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  width: fit-content;
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  cursor: pointer;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
}

.upload:hover {
  color: var(--text-primary);
}

.form__error {
  margin-top: var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--danger);
}

.form__foot {
  display: flex;
  gap: var(--sp-2);
  justify-content: flex-end;
  margin-top: var(--sp-5);
}

.btn {
  padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--text-primary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.btn:hover {
  background: var(--bg-hover);
}

.btn--primary {
  color: var(--accent-fg);
  background: var(--accent-600);
  border-color: var(--accent-600);
}

.btn--primary:hover {
  background: var(--accent-700);
}
</style>
