<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { legacyRestrictions } from '@/services/workspace'
import { resolveAppearance } from '@/services/appearance'
import type { WorkspaceKind } from '@/types/project'
import DDialog from '@/components/design/DDialog.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const { t } = useI18n()
const store = useProjectStore(),
  ui = useUiStore()
const open = ref(false),
  failure = ref('')
const restrictions = computed(() => (store.current ? legacyRestrictions(store.current) : []))
const theme = computed(() => (store.current ? resolveAppearance(store.current).theme : 'ink'))
async function choose(workspace: WorkspaceKind) {
  failure.value = ''
  const result = await store.switchWorkspace(workspace)
  if (!result.ok) {
    failure.value = t('workspace.failed', { message: result.error })
    return
  }
  open.value = false
  ui.notify(t('workspace.switched', { workspace: t(`workspace.${workspace}`) }), 'success')
}
function close() {
  if (!store.switchingWorkspace) open.value = false
}
function show() {
  failure.value = ''
  open.value = true
}
</script>

<template>
  <button
    class="stage-menu"
    type="button"
    :aria-label="t('workspace.menu')"
    aria-haspopup="dialog"
    :aria-expanded="open"
    data-testid="stage-menu"
    @click="show"
  >
    <span>{{ t(`workspace.${store.current?.workspace ?? 'legacy'}`) }}</span>
    <AppIcon name="chevron-down" :size="12" />
  </button>
  <DDialog
    :open="open"
    :theme="theme"
    :title="t('workspace.switch')"
    :description="t('workspace.description')"
    @close="close"
  >
    <div class="workspace-options" :aria-busy="store.switchingWorkspace">
      <button
        v-for="workspace in ['modern', 'legacy'] as const"
        :key="workspace"
        type="button"
        class="workspace-option"
        :data-testid="`workspace-${workspace}`"
        :aria-pressed="store.current?.workspace === workspace"
        :disabled="
          store.switchingWorkspace ||
          store.current?.workspace === workspace ||
          (workspace === 'legacy' && restrictions.length > 0)
        "
        @click="choose(workspace)"
      >
        <span class="workspace-option__title"
          >{{ t(`workspace.${workspace}`) }}
          <small v-if="store.current?.workspace === workspace">{{ t('workspace.current') }}</small>
        </span>
        <span>{{ t(`workspace.${workspace}Description`) }}</span>
        <span v-if="store.current?.workspace !== workspace" class="workspace-option__action">
          {{ t('workspace.switchTo', { workspace: t(`workspace.${workspace}`) }) }} →
        </span>
      </button>
    </div>
    <div v-if="restrictions.length" class="workspace-restrictions" role="note">
      <strong>{{ t('workspace.restricted') }}</strong>
      <ul>
        <li v-for="reason in restrictions" :key="reason">{{ t(`workspace.${reason}`) }}</li>
      </ul>
      <p>{{ t('workspace.preserved') }}</p>
    </div>
    <p class="workspace-note">{{ t('workspace.retained') }}</p>
    <p v-if="store.switchingWorkspace" role="status" class="workspace-note">
      {{ t('workspace.switching') }}
    </p>
    <p v-if="failure" role="alert" class="d-error">{{ failure }}</p>
  </DDialog>
</template>

<style scoped>
.stage-menu {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.stage-menu:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.workspace-options {
  display: grid;
  gap: 12px;
}
.workspace-option {
  display: grid;
  gap: 10px;
  padding: 20px;
  text-align: left;
  color: var(--d-muted);
  background: var(--d-bg);
  border: 1px solid var(--d-line);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
}
.workspace-option[aria-pressed='true'] {
  border-color: var(--d-accent);
}
.workspace-option:hover:not(:disabled) {
  background: var(--d-raised);
  border-color: var(--d-muted);
}
.workspace-option:disabled {
  cursor: default;
}
.workspace-option__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--d-text);
  font-size: 16px;
}
.workspace-option__title small {
  font-size: 11px;
  color: var(--d-accent);
}
.workspace-option__action {
  color: var(--d-text);
  font-size: 12px;
}
.workspace-option:disabled .workspace-option__action {
  color: var(--d-muted);
}
.workspace-note {
  margin-top: 18px;
  color: var(--d-muted);
  font-size: 12px;
  line-height: 1.8;
}
.workspace-restrictions {
  margin-top: 20px;
  padding: 16px;
  background: var(--d-raised);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--d-muted);
}
.workspace-restrictions strong {
  color: var(--d-text);
  font-weight: 500;
}
.workspace-restrictions ul {
  margin: 8px 0;
  padding-left: 18px;
  list-style: disc;
}
</style>
