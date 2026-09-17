<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { APP } from '@/app.config'
import DButton from './DButton.vue'
import AppIcon from '@/components/common/AppIcon.vue'
const emit = defineEmits<{ window: [size: 's' | 'm' | 'l'] }>()
const { t } = useI18n()
const colors = [
  ['Bg', 'bg'],
  ['Surface', 'surface'],
  ['Text', 'text'],
  ['Muted', 'muted'],
  ['A', 'a'],
  ['B', 'b'],
]
</script>
<template>
  <div class="specimen">
    <header>
      <span class="d-kicker">{{ APP.nameEn.toUpperCase() }} / DESIGN LANGUAGE</span>
      <h1>{{ t('showcase.componentsTitle') }}</h1>
      <p>{{ t('showcase.componentsDescription') }}</p>
    </header>
    <section>
      <h2><span>01</span>{{ t('showcase.colors') }}</h2>
      <div class="specimen__colors">
        <div v-for="[label, token] in colors" :key="token">
          <i :style="{ background: `var(--d-${token})` }" /><strong>{{
            t(`showcase.token${label}`)
          }}</strong
          ><code>--d-{{ token }}</code>
        </div>
      </div>
    </section>
    <section>
      <h2><span>02</span>{{ t('showcase.typography') }}</h2>
      <div class="specimen__type">
        <div>
          <h3>{{ t('showcase.fontTitle') }}</h3>
          <p>{{ t('showcase.fontBody') }}</p>
        </div>
        <div class="specimen__numbers">
          <strong>08.4</strong><span>0123456789 / Aa</span><code>48 · 32 · 24 · 16</code>
        </div>
      </div>
    </section>
    <section>
      <h2><span>03</span>{{ t('showcase.controls') }}</h2>
      <div class="specimen__buttons">
        <DButton tone="primary" icon="play" @click="emit('window', 'm')">{{
          t('showcase.primary')
        }}</DButton
        ><DButton icon="edit" @click="emit('window', 'm')">{{ t('showcase.secondary') }}</DButton
        ><DButton tone="quiet" @click="emit('window', 'l')">{{ t('showcase.quiet') }}</DButton
        ><DButton disabled>{{ t('showcase.disabled') }}</DButton>
      </div>
      <div class="specimen__empty">
        <AppIcon name="music" :size="24" />
        <div>
          <strong>{{ t('showcase.neutralState') }}</strong>
          <p>{{ t('showcase.neutralDescription') }}</p>
        </div>
      </div>
    </section>
    <section>
      <h2><span>04</span>{{ t('showcase.windows') }}</h2>
      <div class="specimen__windows">
        <button
          v-for="[size, width] in [
            ['s', '440'],
            ['m', '640'],
            ['l', '960'],
          ] as const"
          :key="size"
          type="button"
          @click="emit('window', size)"
        >
          <div class="specimen__window" :style="{ width: `${Number(width) / 11}px` }">
            <i /><span /><span /><b />
          </div>
          <strong>{{ t(`showcase.dialog${size.toUpperCase()}`) }}</strong
          ><small>{{ width }} px / 14 px</small>
        </button>
      </div>
    </section>
  </div>
</template>
<style scoped>
.specimen {
  max-width: 1100px;
  margin: 0 auto;
  padding: 40px 48px 60px;
}
.specimen header {
  margin-bottom: 48px;
}
.specimen header h1 {
  margin: 12px 0;
  font-size: 30px;
  font-weight: 450;
  letter-spacing: -0.03em;
}
.specimen header p {
  color: var(--d-muted);
  font-size: 13px;
}
.specimen section {
  border-top: 1px solid var(--d-line);
  padding: 28px 0 36px;
}
.specimen h2 {
  display: flex;
  gap: 20px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 24px;
}
.specimen h2 > span {
  font-family: var(--d-mono);
  color: var(--d-accent);
  font-size: 12px;
}
.specimen__colors {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
}
.specimen__colors i {
  display: block;
  height: 70px;
  border: 1px solid var(--d-line);
  border-radius: 6px;
  margin-bottom: 12px;
}
.specimen__colors strong {
  display: block;
  font-size: 12px;
  font-weight: 400;
}
.specimen code {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  font-family: var(--d-mono);
  color: var(--d-muted);
}
.specimen__type {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: 32px;
}
.specimen__type h3 {
  font-family: var(--d-serif);
  font-size: 32px;
  font-weight: 400;
  line-height: 1.6;
}
.specimen__type p {
  max-width: 38em;
  margin-top: 20px;
  font-size: 14px;
  line-height: 1.9;
  color: var(--d-muted);
}
.specimen__numbers {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 1px solid var(--d-line);
  padding-left: 32px;
}
.specimen__numbers strong {
  font-size: 52px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.specimen__numbers span {
  font-family: var(--d-mono);
  color: var(--d-muted);
  font-size: 12px;
}
.specimen__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.specimen__empty {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 22px;
  margin-top: 24px;
  border: 1px dashed var(--d-line);
  border-radius: 10px;
  color: var(--d-muted);
}
.specimen__empty strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--d-text);
}
.specimen__empty p {
  margin-top: 8px;
  font-size: 12px;
}
.specimen__windows {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.specimen__windows > button {
  display: flex;
  align-items: start;
  flex-direction: column;
  padding: 24px;
  border: 1px solid var(--d-line);
  border-radius: 10px;
  text-align: left;
  transition: background var(--d-fast);
}
.specimen__windows > button:hover {
  background: var(--d-surface);
}
.specimen__windows strong {
  font-size: 12px;
  font-weight: 500;
  margin-top: 20px;
}
.specimen__windows small {
  font-size: 10px;
  color: var(--d-muted);
  margin-top: 8px;
}
.specimen__window {
  height: 64px;
  border: 1px solid var(--d-faint);
  border-radius: 5px;
  padding: 7px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.specimen__window i {
  border-bottom: 1px solid var(--d-line);
  height: 8px;
}
.specimen__window span {
  display: block;
  height: 3px;
  width: 75%;
  background: var(--d-line);
}
.specimen__window b {
  display: block;
  margin-left: auto;
  width: 12px;
  height: 7px;
  border-radius: 2px;
  background: var(--d-accent);
}
@media (max-width: 700px) {
  .specimen {
    padding: 28px 24px;
  }
  .specimen header h1 {
    font-size: 25px;
  }
  .specimen__colors {
    grid-template-columns: repeat(3, 1fr);
  }
  .specimen__type {
    grid-template-columns: 1fr;
  }
  .specimen__windows {
    grid-template-columns: 1fr;
  }
}
</style>
