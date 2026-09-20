<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getModule } from '@/modules/registry'
import { moduleTitle } from '@/i18n/helper'
import { useI18n } from 'vue-i18n'
import type { ModuleInstance } from '@/types/project'
import type { ModuleOption } from '@/modules/types'
import DDialog from '@/components/design/DDialog.vue'
import DButton from '@/components/design/DButton.vue'
const props = defineProps<{
  open: boolean
  module: ModuleInstance
  sideId: string
  theme: 'ink' | 'paper'
  context: string
  options: ModuleOption[]
}>()
const emit = defineEmits<{
  close: []
  patch: [patch: { title: string }]
  patchData: [patch: Record<string, unknown>]
  patchProps: [patch: Record<string, unknown>]
}>()
const { t } = useI18n()
const definition = computed(() => getModule(props.module.type))
const tab = ref('content')
watch(
  () => props.module.id,
  () => {
    tab.value = 'content'
  },
)
</script>
<template>
  <DDialog
    :open="open"
    :theme="theme"
    :title="`编辑${module.title || moduleTitle(module.type)}`"
    :description="context"
    size="l"
    @close="emit('close')"
  >
    <div class="studio-editor-fields studio-dialog">
      <nav class="studio-dialog__tabs">
        <button :aria-pressed="tab === 'content'" @click="tab = 'content'">内容</button
        ><button :aria-pressed="tab === 'style'" @click="tab = 'style'">呈现选项</button>
      </nav>
      <template v-if="tab === 'content'">
        <label class="d-field"
          >模块标题<input
            class="d-input"
            :value="module.title"
            @change="emit('patch', { title: ($event.target as HTMLInputElement).value })"
        /></label>
        <component
          :is="definition.editor"
          v-if="definition"
          :key="module.id"
          :module="module"
          :side-id="sideId"
          :readonly="false"
          :patch-data="(patch: Record<string, unknown>) => emit('patchData', patch)"
          :patch-props="(patch: Record<string, unknown>) => emit('patchProps', patch)"
        />
      </template>
      <div v-else class="studio-dialog__options">
        <label v-for="option in options" :key="option.key" class="d-field"
          >{{ t(option.labelKey) }}
          <select
            v-if="option.type === 'select'"
            class="d-input"
            :value="module.props[option.key] ?? option.default"
            @change="
              emit('patchProps', { [option.key]: ($event.target as HTMLSelectElement).value })
            "
          >
            <option v-for="item in option.values" :key="String(item.value)" :value="item.value">
              {{ t(item.labelKey) }}
            </option>
          </select>
          <input
            v-else-if="option.type === 'boolean'"
            type="checkbox"
            :checked="Boolean(module.props[option.key] ?? option.default)"
            @change="
              emit('patchProps', { [option.key]: ($event.target as HTMLInputElement).checked })
            "
          />
          <input
            v-else
            class="d-input"
            :type="option.type === 'number' ? 'number' : 'text'"
            :min="option.min"
            :max="option.max"
            :step="option.step ?? 1"
            :value="module.props[option.key] ?? option.default"
            @change="
              emit('patchProps', {
                [option.key]:
                  option.type === 'number'
                    ? Number(($event.target as HTMLInputElement).value)
                    : ($event.target as HTMLInputElement).value,
              })
            "
          />
        </label>
        <p v-if="!options.length" class="d-muted">此模块使用场景的统一版式。</p>
      </div>
    </div>
    <template #footer
      ><span class="studio-dialog__saved">修改即时应用，可撤销。</span
      ><DButton tone="primary" @click="emit('close')">完成</DButton></template
    >
  </DDialog>
</template>
<style scoped>
.studio-dialog {
  display: grid;
  gap: 24px;
}
.studio-dialog__tabs {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--d-line);
}
.studio-dialog__tabs button {
  padding: 0 0 12px;
  font-size: 13px;
  color: var(--d-muted);
  border-bottom: 2px solid transparent;
}
.studio-dialog__tabs button[aria-pressed='true'] {
  color: var(--d-text);
  border-color: var(--d-accent);
}
.studio-dialog__options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}
.studio-dialog__saved {
  margin-right: auto;
  font-size: 12px;
  color: var(--d-muted);
}
</style>
