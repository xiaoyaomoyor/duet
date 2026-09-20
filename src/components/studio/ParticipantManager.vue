<script setup lang="ts">
import { ref } from 'vue'
import type { Project } from '@/types/project'
import type { ParticipantCommand } from '@/services/participants'
import { useProjectStore } from '@/stores/useProjectStore'
import { useToolsStore } from '@/stores/useToolsStore'
import { useUiStore } from '@/stores/useUiStore'
import DButton from '@/components/design/DButton.vue'
const props = defineProps<{ project: Project }>()
const store = useProjectStore(),
  tools = useToolsStore(),
  ui = useUiStore()
const name = ref(''),
  pending = ref('')
function run(command: ParticipantCommand) {
  const result = store.dispatch(command, {
    label:
      command.t === 'participant/add'
        ? '添加对比对象'
        : command.t === 'participant/remove'
          ? '删除对象及引用'
          : '调整对象顺序',
  })
  if (!result.ok) ui.notify(result.error, 'danger')
  else {
    name.value = ''
    pending.value = ''
  }
}
function move(index: number, delta: number) {
  const ids = props.project.sheet.sides.map((s) => s.id)
  const [id] = ids.splice(index, 1)
  ids.splice(index + delta, 0, id!)
  run({ t: 'participant/reorder', ids })
}
</script>
<template>
  <div class="participants-manager">
    <p>为同一测试题添加 2—6 个工具。标记随对象保留，调整顺序不会改变作品归属。</p>
    <section v-for="(p, n) in project.sheet.sides" :key="p.id" class="participants-manager__item">
      <header>
        <strong>{{ p.catalogueLabel ?? String.fromCharCode(65 + n) }}</strong
        ><span>{{ tools.resolve(p.toolRef).name }}</span>
      </header>
      <label class="d-field"
        >显示名称<input
          class="d-input"
          :aria-label="'对象 ' + (p.catalogueLabel ?? String.fromCharCode(65 + n)) + ' 名称'"
          :value="p.labelOverride ?? tools.resolve(p.toolRef).name"
          @change="
            store.setSideField(p.id, { labelOverride: ($event.target as HTMLInputElement).value })
          "
      /></label>
      <details class="participants-manager__details">
        <summary>版本、备注与匿名</summary>
        <label class="d-field"
          >版本<input
            class="d-input"
            :value="p.modelVersion ?? ''"
            @change="
              store.setSideField(p.id, { modelVersion: ($event.target as HTMLInputElement).value })
            "
        /></label>
        <label class="d-field"
          >备注<textarea
            class="d-input"
            rows="2"
            :value="p.note ?? ''"
            @change="
              store.setSideField(p.id, { note: ($event.target as HTMLTextAreaElement).value })
            "
          />
        </label>
        <label
          ><input
            type="checkbox"
            :checked="p.anonymizeName === true"
            @change="
              store.setSideField(p.id, {
                anonymizeName: ($event.target as HTMLInputElement).checked,
                anonymizeVersion: ($event.target as HTMLInputElement).checked,
                anonymizeIcon: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          匿名展示身份</label
        >
      </details>
      <div class="participants-manager__actions">
        <DButton compact tone="quiet" :disabled="n === 0" @click="move(n, -1)">上移</DButton>
        <DButton
          compact
          tone="quiet"
          :disabled="n === project.sheet.sides.length - 1"
          @click="move(n, 1)"
          >下移</DButton
        >
        <DButton
          compact
          tone="quiet"
          :disabled="project.sheet.sides.length <= 2"
          @click="pending = p.id"
          >移除对象</DButton
        >
      </div>
      <div v-if="pending === p.id" role="alert" class="participants-manager__confirm">
        <p>移除该对象在全部测试题中的作品，以及相关步骤和组合引用。共同内容保留，此操作可撤销。</p>
        <DButton compact @click="run({ t: 'participant/remove', id: p.id })"
          >确认移除及清理引用</DButton
        >
        <DButton compact tone="quiet" @click="pending = ''">取消</DButton>
      </div>
    </section>
    <form
      v-if="project.sheet.sides.length < 6"
      @submit.prevent="run({ t: 'participant/add', name })"
    >
      <label class="d-field"
        >新工具名称<input v-model="name" class="d-input" placeholder="例如：第三个音乐生成工具"
      /></label>
      <DButton type="submit" compact>添加对比对象</DButton>
    </form>
    <p v-else>已添加六个对象。可在舞台切换全体总览、重点双人和单项观看。</p>
  </div>
</template>
<style scoped>
.participants-manager {
  display: grid;
  gap: 20px;
}
.participants-manager p {
  color: var(--d-muted);
  font-size: 12px;
  line-height: 1.8;
}
.participants-manager__item {
  display: grid;
  gap: 12px;
  padding-block: 16px;
  border-bottom: 1px solid var(--d-line);
}
.participants-manager header {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.participants-manager header strong {
  font-family: var(--d-mono);
  font-size: 20px;
}
.participants-manager__actions {
  display: flex;
  gap: 6px;
}
.participants-manager form,
.participants-manager__confirm {
  display: grid;
  gap: 12px;
}
.participants-manager__details {
  color: var(--d-muted);
  font-size: 12px;
}
.participants-manager__details summary {
  cursor: pointer;
  padding-block: 4px;
}
.participants-manager__details[open] > label {
  margin-top: 12px;
}
</style>
