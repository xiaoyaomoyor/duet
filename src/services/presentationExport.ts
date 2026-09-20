import type { Project } from '@/types/project'
import { resolveRuntime } from './comparisonContent'
import type { PresentationRuntime } from '@/types/presentation'
import { isPresentable } from '@/modules/visibility'
import { MULTI_PLAYER } from './multiPlayer'

export interface ExportFrame {
  scene: number
  title: string
  state: PresentationRuntime
  choices: Array<Array<{ id: string | null; title: string }>>
  defaults: Array<string | null>
  factorized?: boolean
}

/** Bounded pre-rendering reuses the app renderer; the portable player only selects existing frames. */
export function exportFrames(project: Project, limit = 120): ExportFrame[] {
  const content = project.comparison!
  const frames: ExportFrame[] = []
  const scenes = content.scenes.filter((scene) => {
    if (scene.hidden) return false
    const c = content.cases.find((c) => c.id === scene.caseId)!
    const section = c.sections.find((s) => s.id === scene.sectionId)!
    const cells =
      section.kind === 'full'
        ? Object.values(section.sharedCells ?? {})
        : Object.values(c.entries).flatMap((e) =>
            e.samples.filter((s) => !s.hidden).map((s) => s.contentBySection[section.id]),
          )
    return cells.some(
      (cell) =>
        cell && !cell.hidden && cell.modules.some((m) => m.type !== 'title' && isPresentable(m)),
    )
  })
  for (const [sceneIndex, scene] of scenes.entries()) {
    const c = content.cases.find((c) => c.id === scene.caseId)!
    const choices = project.sheet.sides.map((p) => [
      { id: null as string | null, title: '本题未提供样本' },
      ...c.entries[p.id]!.samples.filter((s) => !s.hidden).map((s) => ({
        id: s.id,
        title: s.title,
      })),
    ])
    for (let step = 0; step <= scene.steps.length; step++) {
      const state = resolveRuntime(content, scene.id, step)
      // Anonymous exports have no identity mapping, including reveal steps.
      state.revealedIdentities = []
      const defaults = project.sheet.sides.map((p) => state.samples[p.id] ?? null)
      if (project.sheet.sides.length > 2) {
        const selections = [state.samples]
        for (const [n, p] of project.sheet.sides.entries())
          for (const option of choices[n]!)
            if (option.id !== defaults[n]) selections.push({ ...state.samples, [p.id]: option.id })
        for (const samples of selections) {
          if (frames.length >= limit)
            throw new Error(
              `演示网页超过 ${limit} 个画面组合。请减少场景或作品，或导出静态阅读页。`,
            )
          frames.push({
            scene: sceneIndex,
            title: `${c.title} / ${scene.title}`,
            choices,
            defaults,
            factorized: true,
            state: { ...state, samples },
          })
        }
        continue
      }
      for (const a of choices[0]!)
        for (const b of choices[1]!) {
          if (frames.length >= limit)
            throw new Error(
              `演示网页超过 ${limit} 个画面组合。请取消“包含作品切换与步骤”，导出当前测试题的静态阅读页。`,
            )
          frames.push({
            scene: sceneIndex,
            title: `${c.title} / ${scene.title}`,
            choices,
            defaults,
            state: {
              ...state,
              samples: { [project.sheet.sides[0].id]: a.id, [project.sheet.sides[1].id]: b.id },
            },
          })
        }
    }
  }
  return frames
}

/** No project JSON is embedded. Text and choices come only from already sanitized rendered frames. */
export const PORTABLE_PLAYER =
  MULTI_PLAYER +
  String.raw`(()=>{
const frames=[...document.querySelectorAll('[data-export-frame]')];if(!frames.length)return;
if(frames[0].dataset.exportFactorized){duetMulti();return}
const bar=document.createElement('nav');bar.className='duet-player';bar.setAttribute('aria-label','演示控制');
const button=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.onclick=fn;bar.append(b);return b};
const sceneSelect=document.createElement('select');sceneSelect.setAttribute('aria-label','演示场景');bar.append(sceneSelect);
let scene=0,step=0,selected=[],reading=false;
const unique=[...new Set(frames.map(f=>Number(f.dataset.exportScene)))];
unique.forEach(n=>{const f=frames.find(f=>Number(f.dataset.exportScene)===n);const o=new Option(f.dataset.exportTitle,String(n));sceneSelect.add(o)});
const selectors=[0,1].map(n=>{const s=document.createElement('select');s.setAttribute('aria-label',String.fromCharCode(65+n)+' 作品');bar.append(s);s.onchange=()=>{selected[n]=s.value;draw()};return s});
const status=document.createElement('span');status.setAttribute('aria-live','polite');
function pause(){document.querySelectorAll('audio,video').forEach(a=>a.pause())}
function matches(f){return Number(f.dataset.exportScene)===scene&&Number(f.dataset.exportStep)===step}
function enter(n,k=0){scene=n;step=k;const f=frames.find(matches);if(!f)return;const choices=JSON.parse(f.dataset.exportChoices);selected=JSON.parse(f.dataset.exportDefaults).map(v=>v||'');selectors.forEach((s,n)=>{s.replaceChildren(...choices[n].map(c=>new Option(c.title,c.id||'')));s.value=selected[n]});draw()}
function draw(){pause();frames.forEach(f=>{const pair=JSON.parse(f.dataset.exportSamples).map(v=>v||'');f.hidden=!(matches(f)&&pair.every((v,n)=>v===selected[n]))});sceneSelect.value=String(scene);const max=Math.max(...frames.filter(f=>Number(f.dataset.exportScene)===scene).map(f=>Number(f.dataset.exportStep)));status.textContent=(scene+1)+' / '+unique.length+' · '+step+' / '+max+' 步';document.documentElement.dataset.reading=reading?'true':'false'}
function next(d){const max=Math.max(...frames.filter(f=>Number(f.dataset.exportScene)===scene).map(f=>Number(f.dataset.exportStep)));if(d>0&&step<max)enter(scene,step+1);else if(d<0&&step>0)enter(scene,step-1);else if(unique.includes(scene+d)){const n=scene+d;enter(n,d<0?Math.max(...frames.filter(f=>Number(f.dataset.exportScene)===n).map(f=>Number(f.dataset.exportStep))):0)}}
sceneSelect.onchange=()=>enter(Number(sceneSelect.value));button('上一步',()=>next(-1));button('下一步',()=>next(1));button('重新开始',()=>enter(unique[0]));button('阅读 / 剧场',()=>{reading=!reading;draw()});button('全屏',()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{})});bar.append(status);document.body.prepend(bar);
document.addEventListener('play',e=>{document.querySelectorAll('audio,video').forEach(a=>{if(a!==e.target)a.pause()})},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
document.addEventListener('keydown',e=>{if(e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,button,a,audio,video,[contenteditable]'))return;if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();next(1)}else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();next(-1)}else if(e.key==='Home'){e.preventDefault();enter(unique[0])}else if(e.key==='End'){e.preventDefault();enter(unique.at(-1))}else if(e.key.toLowerCase()==='p'){const a=frames.find(f=>!f.hidden)?.querySelector('audio,video');if(a){e.preventDefault();if(a.paused)a.play().catch(()=>{});else a.pause()}}});enter(unique[0]);
})()`
