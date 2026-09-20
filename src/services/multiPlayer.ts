/** Portable multi-party viewer: compose sanitized participant fragments, never project JSON. */
export const MULTI_PLAYER = String.raw`function duetMulti(){
const frames=[...document.querySelectorAll('[data-export-frame]')], first=frames[0];
const ids=JSON.parse(first.dataset.exportIds),labels=JSON.parse(first.dataset.exportLabels),scenes=[...new Set(frames.map(f=>Number(f.dataset.exportScene)))];
const host=document.createElement('div');first.before(host);frames.forEach(f=>f.remove());
const bar=document.createElement('nav');bar.className='duet-player';bar.setAttribute('aria-label','演示控制');document.body.prepend(bar);
let scene=0,step=0,selected=[],mode='overview',target=ids[0],reference='',reading=false;
const select=(label)=>{const e=document.createElement('select');e.setAttribute('aria-label',label);bar.append(e);return e};
const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=fn;bar.append(b);return b};
const sceneSelect=select('演示场景');scenes.forEach(n=>sceneSelect.add(new Option(frames.find(f=>Number(f.dataset.exportScene)===n).dataset.exportTitle,String(n))));
const selectors=ids.map((id,n)=>{const s=select(labels[n]+' 作品');s.onchange=()=>{selected[n]=s.value;draw()};return s});
const viewSelect=select('观看方式');[['overview','全体总览'],['pair','重点双人'],['single','单项']].forEach(([v,t])=>viewSelect.add(new Option(t,v)));viewSelect.onchange=()=>{mode=viewSelect.value;draw()};
const refSelect=select('固定参照');refSelect.add(new Option('不固定',''));ids.forEach((id,n)=>refSelect.add(new Option(labels[n],id)));refSelect.onchange=()=>{reference=refSelect.value;draw()};
const targetSelect=select('当前对象');ids.forEach((id,n)=>targetSelect.add(new Option(labels[n],id)));targetSelect.onchange=()=>{target=targetSelect.value;draw()};
const status=document.createElement('span');status.setAttribute('aria-live','polite');bar.append(status);
function pause(){host.querySelectorAll('audio,video').forEach(a=>a.pause())}
function matches(f){return Number(f.dataset.exportScene)===scene&&Number(f.dataset.exportStep)===step}
function max(n){return Math.max(...frames.filter(f=>Number(f.dataset.exportScene)===n).map(f=>Number(f.dataset.exportStep)))}
function enter(n,k=0){scene=n;step=k;const f=frames.find(matches);selected=JSON.parse(f.dataset.exportDefaults).map(v=>v||'');const choices=JSON.parse(f.dataset.exportChoices);selectors.forEach((s,n)=>{s.replaceChildren(...choices[n].map(c=>new Option(c.title,c.id||'')));s.value=selected[n]});draw()}
function draw(){
pause();const candidates=frames.filter(matches),base=candidates[0].cloneNode(true);
ids.forEach((id,n)=>{const source=candidates.find(f=>(JSON.parse(f.dataset.exportSamples)[n]||'')===selected[n]);if(!source)return;
const from=[...source.querySelectorAll('[data-compare-id]')].filter(e=>e.dataset.compareId===id),to=[...base.querySelectorAll('[data-compare-id]')].filter(e=>e.dataset.compareId===id);
to.forEach((el,i)=>{if(from[i])el.replaceWith(from[i].cloneNode(true))})});
base.hidden=false;const fixed=reference&&reference!==target?reference:ids.find(id=>id!==target),visible=reading||mode==='overview'?ids:mode==='single'?[target]:[fixed,target];
base.querySelectorAll('.project-scene__empty').forEach(el=>el.remove());
base.querySelectorAll('[data-compare-id]').forEach(el=>{if(!visible.includes(el.dataset.compareId))el.style.display='none'});
if(mode!=='overview'&&!reading){const parents=new Set([...base.querySelectorAll('[data-compare-id]')].map(el=>el.parentElement));parents.forEach(parent=>visible.forEach(id=>{const el=[...parent.children].find(el=>el.dataset.compareId===id);if(el)parent.append(el)}))}
base.querySelectorAll('.project-scene').forEach(el=>{el.dataset.view=reading?'overview':mode;el.dataset.count=String(visible.length);if(reading){delete el.dataset.multi;el.dataset.reading='true'}});
base.querySelectorAll('.project-scene__pair').forEach(el=>el.style.setProperty('--participants',String(visible.length)));
base.querySelectorAll('.stage-table').forEach(el=>el.dataset.columns=String(visible.length));
base.dataset.exportSamples=JSON.stringify(selected);host.replaceChildren(base);sceneSelect.value=String(scene);viewSelect.value=mode;targetSelect.value=target;status.textContent=(scene+1)+' / '+scenes.length+' · '+step+' / '+max(scene)+' 步';document.documentElement.dataset.reading=String(reading);
}
function next(d){if(d>0&&step<max(scene))enter(scene,step+1);else if(d<0&&step>0)enter(scene,step-1);else if(scenes.includes(scene+d))enter(scene+d,d<0?max(scene+d):0)}
sceneSelect.onchange=()=>enter(Number(sceneSelect.value));button('上一步',()=>next(-1));button('下一步',()=>next(1));button('重新开始',()=>{mode='overview';enter(scenes[0])});button('阅读 / 剧场',()=>{reading=!reading;draw()});button('全屏',()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{})});
document.addEventListener('play',e=>{host.querySelectorAll('audio,video').forEach(a=>{if(a!==e.target)a.pause()})},true);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
document.addEventListener('keydown',e=>{if(e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select,button,a,audio,video,[contenteditable]'))return;
if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();next(1)}else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();next(-1)}else if(e.key==='Home'){e.preventDefault();enter(scenes[0])}else if(e.key==='End'){e.preventDefault();enter(scenes.at(-1))}else if(/^[1-6]$/.test(e.key)){const n=labels.indexOf(String.fromCharCode(64+Number(e.key)));if(n>=0){target=ids[n];draw()}}else if(e.key==='Enter'){e.preventDefault();mode=mode==='overview'?'single':'overview';draw()}else if(e.key==='Escape'&&mode!=='overview'){mode='overview';draw()}else if(e.key.toLowerCase()==='p'){const a=[...host.querySelectorAll('[data-compare-id]')].find(e=>e.dataset.compareId===target)?.querySelector('audio,video');if(a){e.preventDefault();if(a.paused)a.play().catch(()=>{});else a.pause()}}});enter(scenes[0]);
}
`
