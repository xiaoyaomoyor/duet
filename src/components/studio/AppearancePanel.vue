<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Project } from '@/types/project'
import type { Appearance, AppearancePatch, AppearancePreset } from '@/types/appearance'
import {
  BUILTIN_APPEARANCES,
  parsePreset,
  presetFile,
  resolveAppearance,
} from '@/services/appearance'
import {
  listAppearancePresets,
  saveAppearancePreset,
  removeAppearancePreset,
} from '@/services/appearancePresets'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { downloadText } from '@/lib/download'
import DButton from '@/components/design/DButton.vue'
const props = defineProps<{ project: Project; sceneId: string }>()
const emit = defineEmits<{ close: []; scene: [id: string] }>()
const store = useProjectStore(),
  ui = useUiStore()
const scope = ref('project'),
  name = ref('我的评测风格'),
  saved = ref<AppearancePreset[]>([]),
  busy = ref(false)
const scene = computed(() => props.project.comparison?.scenes.find((s) => s.id === props.sceneId))
const target = computed(() => (scope.value === 'scene' ? scene.value?.id : undefined))
const effective = computed(() => resolveAppearance(props.project, target.value))
const patch = computed(() => (target.value ? scene.value?.appearance : props.project.appearance))
const fields: { key: keyof Appearance; label: string; choices: [string, string][] }[] = [
  {
    key: 'theme',
    label: '明暗',
    choices: [
      ['ink', '墨色'],
      ['paper', '纸色'],
    ],
  },
  {
    key: 'palette',
    label: '强调色',
    choices: [
      ['amber', '琥珀'],
      ['blue', '冷蓝'],
      ['mono', '黑白'],
    ],
  },
  {
    key: 'typography',
    label: '标题字体',
    choices: [
      ['modern', '现代无衬线'],
      ['editorial', '编辑衬线'],
    ],
  },
  {
    key: 'mediaLayout',
    label: '媒体版式',
    choices: [
      ['wide', '宽幅舞台'],
      ['sleeve', '唱片侧封'],
    ],
  },
  {
    key: 'titleAlign',
    label: '标题对齐',
    choices: [
      ['left', '左对齐'],
      ['center', '居中'],
    ],
  },
  {
    key: 'texture',
    label: '背景纹理',
    choices: [
      ['none', '纯色'],
      ['subtle', '细线'],
    ],
  },
  {
    key: 'showBrand',
    label: '对奏标识',
    choices: [
      ['true', '显示'],
      ['false', '隐藏'],
    ],
  },
  {
    key: 'showProjectTitle',
    label: '项目名称',
    choices: [
      ['true', '显示'],
      ['false', '隐藏'],
    ],
  },
]
function apply(value: AppearancePatch | null) {
  if (scope.value === 'scene' && !target.value) return
  const r = store.dispatch(
    { t: 'appearance/set', appearance: value, ...(target.value ? { sceneId: target.value } : {}) },
    { label: '修改外观与版式' },
  )
  if (!r.ok) ui.notify(r.error, 'danger')
}
function change(key: keyof Appearance, value: string) {
  const next = { ...patch.value }
  if (value === 'inherit') delete next[key]
  else Object.assign(next, { [key]: value === 'true' ? true : value === 'false' ? false : value })
  apply(next)
}
async function reload() {
  saved.value = await listAppearancePresets()
}
async function run(fn: () => Promise<void>) {
  busy.value = true
  try {
    await fn()
  } catch (e) {
    ui.notify(e instanceof Error ? e.message : String(e), 'danger')
  } finally {
    busy.value = false
  }
}
async function save() {
  await run(async () => {
    await saveAppearancePreset({ name: name.value, appearance: effective.value })
    await reload()
  })
}
async function importStyle(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file) return
  await run(async () => {
    if (file.size > 16000) throw new Error('预设文件超过 16 KB；请选择 .duetstyle 外观文件')
    const result = parsePreset(await file.text())
    if (!result.ok) throw new Error(result.error)
    await saveAppearancePreset(result.value)
    await reload()
    ui.notify('外观已加入个人预设，点击即可应用', 'success')
  })
}
onMounted(() => run(reload))
</script>
<template>
  <aside class="appearance-panel no-export" aria-label="外观与版式">
    <header>
      <div>
        <p class="d-kicker">ART DIRECTION</p>
        <h2>外观与版式</h2>
      </div>
      <DButton compact @click="emit('close')">收起</DButton>
    </header>
    <p class="appearance-panel__intro">为整场评测设定基调，也可以让某一幕拥有自己的表达。</p>
    <div class="appearance-panel__scope">
      <button :aria-pressed="scope === 'project'" @click="scope = 'project'">项目默认</button
      ><button :disabled="!scene" :aria-pressed="scope === 'scene'" @click="scope = 'scene'">
        场景覆盖
      </button>
    </div>
    <label v-if="scope === 'scene'"
      >编辑场景<select
        :value="sceneId"
        @change="emit('scene', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="s in project.comparison?.scenes" :key="s.id" :value="s.id">
          {{ s.title }}
        </option>
      </select></label
    >
    <section>
      <h3>精选风格</h3>
      <div class="appearance-panel__presets">
        <button
          v-for="p in BUILTIN_APPEARANCES"
          :key="p.id"
          :aria-label="p.name"
          :data-preset="p.id"
          @click="apply(p.appearance)"
        >
          <span
            class="appearance-panel__preview"
            :data-design-theme="p.appearance.theme"
            :data-palette="p.appearance.palette"
            ><i>Duet / 01</i
            ><b
              :style="{
                fontFamily: p.appearance.typography === 'editorial' ? 'Georgia, serif' : undefined,
              }"
              >Aa 对奏</b
            ><em /></span
          ><strong>{{ p.name }}</strong>
        </button>
      </div>
    </section>
    <section class="appearance-panel__fields">
      <h3>细节调整</h3>
      <label v-for="field in fields" :key="field.key"
        >{{ field.label
        }}<select
          :aria-label="field.label"
          :value="
            target && patch?.[field.key] === undefined ? 'inherit' : String(effective[field.key])
          "
          @change="change(field.key, ($event.target as HTMLSelectElement).value)"
        >
          <option v-if="target" value="inherit">
            继承项目 ·
            {{
              field.choices.find((c) => c[0] === String(resolveAppearance(project)[field.key]))?.[1]
            }}
          </option>
          <option v-for="[value, label] in field.choices" :key="value" :value="value">
            {{ label }}
          </option>
        </select></label
      >
      <p>侧封版式用于双列或单项舞台；多方总览保持紧凑排版。模块自身的显式样式继续优先。</p>
      <DButton compact @click="apply(null)">{{ target ? '恢复项目外观' : '恢复系统默认' }}</DButton>
    </section>
    <section class="appearance-panel__library">
      <h3>个人预设</h3>
      <p>只保存外观，不含作品、工具身份或评价。应用后独立保存，删除预设不会改变项目。</p>
      <label>预设名称<input v-model="name" maxlength="60" /></label>
      <div class="appearance-panel__actions">
        <DButton compact :disabled="busy" @click="save">保存当前外观</DButton
        ><DButton compact @click="downloadText(presetFile(name, effective), 'Duet.duetstyle')"
          >导出外观</DButton
        ><label class="appearance-panel__import"
          >导入外观<input
            type="file"
            accept=".duetstyle,application/json"
            :disabled="busy"
            @change="importStyle"
        /></label>
      </div>
      <div v-for="p in saved" :key="p.id" class="appearance-panel__saved">
        <button @click="apply(p.appearance)">{{ p.name }}</button
        ><DButton
          compact
          :disabled="busy"
          :aria-label="`删除预设 ${p.name}`"
          @click="
            run(async () => {
              await removeAppearancePreset(p.id)
              await reload()
            })
          "
          >删除</DButton
        >
      </div>
    </section>
  </aside>
</template>
<style scoped>
.appearance-panel {
  position: absolute;
  z-index: 30;
  inset: 0 0 0 auto;
  width: min(380px, 100%);
  padding: 22px;
  overflow: auto;
  background: var(--d-surface);
  color: var(--d-text);
  border-left: 1px solid var(--d-line);
  box-shadow: -20px 0 60px #0002;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
header,
.appearance-panel__actions,
.appearance-panel__saved {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
h2 {
  font-size: 19px;
  font-weight: 500;
  margin-top: 6px;
}
h3 {
  font-size: 12px;
  letter-spacing: 0.08em;
  margin: 0 0 14px;
}
p {
  color: var(--d-muted);
  font-size: 12px;
  line-height: 1.8;
  margin: 0;
}
section + section {
  border-top: 1px solid var(--d-line);
  padding-top: 22px;
}
button {
  color: inherit;
  cursor: pointer;
}
.appearance-panel__scope {
  display: flex;
  padding: 4px;
  gap: 4px;
  background: var(--d-bg);
  border: 1px solid var(--d-line);
  border-radius: 8px;
}
.appearance-panel__scope button {
  flex: 1;
  padding: 9px;
  background: transparent;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
}
.appearance-panel__scope button[aria-pressed='true'] {
  background: var(--d-raised);
  color: var(--d-accent);
}
.appearance-panel__presets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.appearance-panel__presets button {
  padding: 0;
  border: 1px solid var(--d-line);
  border-radius: 6px;
  overflow: hidden;
  background: transparent;
  text-align: left;
}
.appearance-panel__presets button:hover {
  border-color: var(--d-accent);
}
.appearance-panel__presets strong {
  display: block;
  padding: 9px 10px;
  font-size: 11px;
  font-weight: 450;
}
.appearance-panel__preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--d-bg);
  color: var(--d-text);
}
.appearance-panel__preview i {
  font-size: 8px;
  font-style: normal;
  color: var(--d-muted);
  letter-spacing: 0.1em;
}
.appearance-panel__preview b {
  font-size: 20px;
  font-weight: 450;
}
.appearance-panel__preview em {
  width: 55%;
  height: 2px;
  background: var(--d-accent);
}
label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  margin-bottom: 12px;
}
select,
input {
  min-width: 0;
  max-width: 210px;
  color: var(--d-text);
  background: var(--d-bg);
  border: 1px solid var(--d-line);
  border-radius: 5px;
  padding: 9px;
  font: inherit;
}
.appearance-panel__fields p,
.appearance-panel__library p {
  margin: 14px 0;
}
.appearance-panel__import {
  position: relative;
  margin: 0;
  cursor: pointer;
  padding: 7px;
  font-size: 11px;
  border: 1px solid var(--d-line);
  border-radius: 5px;
}
.appearance-panel__import input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  cursor: pointer;
}
.appearance-panel__saved {
  margin-top: 12px;
  border-top: 1px solid var(--d-line);
  padding-top: 10px;
}
.appearance-panel__saved > button:first-child {
  flex: 1;
  text-align: left;
  border: 0;
  background: transparent;
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
