import {openStore} from './storage.js';
import {uid,deleteFinancialTransaction} from './domain.js';
import {renderApp} from './views.js';
import {createFormManager} from './forms.js';
import {setupPWA} from './pwa.js';
import {setupGestures} from './gestures.js';
import {esc,attr,icon,href,formatBytes} from './shared.js';

let store,data,route,forms,pwa,mode='local',lastHash='',popClosing=false,fileURLs=[],lastTripId=null;
let storageInfo={},toastTimer,renderToken=0;
const modeKey='travelorganizer.pwa.mode';
const $=s=>document.querySelector(s);
const clone=x=>structuredClone(x);
function parseRoute(){
 const [path,search='']=(location.hash||'#/trips').slice(1).split('?');const parts=path.split('/').filter(Boolean).map(decodeURIComponent);
 if(parts[0]==='trip')return {page:parts[2]||'overview',tripId:parts[1],id:parts[3]||null,query:new URLSearchParams(search)};
 return {page:parts[0]==='template'?'template':parts[0]||'trips',id:parts[1]||null,tripId:null,query:new URLSearchParams(search)};
}
function trip(){return data?.trips.find(t=>t.id===route?.tripId)||null;}
function toast(text,error=false){const n=$('#toast');n.textContent=text;n.className=error?'toast error':'toast';n.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{n.hidden=true;},4200);}
function navigate(hash){if(location.hash===hash)render();else location.hash=hash;}
function download(object,name,type='application/json'){const blob=object instanceof Blob?object:new Blob([JSON.stringify(object,null,2)],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function errorNotice(error){toast(error.message||'Не удалось выполнить действие.',true);}
async function commit(mutator,opts={}){const before=data;data=await store.commit(async d=>{await mutator(d);for(const t of d.trips){const old=before.trips.find(v=>v.id===t.id);const labels={items:'вещи',tasks:'задачи',events:'план',docs:'документы',accounts:'счета',transactions:'финансовые операции',pins:'закрепления',contacts:'контакты'};const changed=Object.keys(labels).filter(k=>JSON.stringify(old?.[k])!==JSON.stringify(t[k]));if(changed.length&&(t.history?.length||0)===(old?.history?.length||0))(t.history||=[]).push({id:uid(),author:'На этом устройстве',action:old?'Обновлено: '+changed.map(k=>labels[k]).join(', '):'Создана поездка',time:new Date().toISOString()});}},opts);return data;}
function theme(){let choice=data?.settings?.theme||'system';try{choice=localStorage.getItem('travelorganizer.pwa.theme')||choice;}catch{}const dark=choice==='dark'||(choice==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';document.body.classList.toggle('dark',dark);}
function onlineStatus(){const el=$('#pwa-status');if(!el)return;const offline=!navigator.onLine;el.hidden=!offline;el.textContent=offline?'Без сети · локальные записи доступны на устройстве':'';}
function modeBar(){const el=$('#mode-bar');el.innerHTML=mode==='demo'?`<span>Деморежим · синтетические данные</span><button data-action="leave-demo">Выйти из демо</button>`:`<span>Локальный режим разработки</span><button data-action="show-integration" data-feature="auth">Аккаунт не подключён</button>`;}
async function render(){
 if(!data)return;route=parseRoute();const token=++renderToken;const t=trip();if(t)lastTripId=t.id;
 if(route.tripId&&!t){$('#app-header').innerHTML=`<a class="icon-btn" href="#/trips" aria-label="К поездкам">${icon('arrow')}</a><h1>Поездка не найдена</h1>`;$('#content').innerHTML=`<section class="empty-state"><h2>Запись недоступна</h2><p>Возможно, поездка удалена в другой вкладке. Остальные записи сохранены.</p><a class="btn primary" href="#/trips">Мои поездки</a></section>`;$('#nav').innerHTML='';return;}
 theme();modeBar();onlineStatus();fileURLs.forEach(u=>URL.revokeObjectURL(u));fileURLs=[];
 const view=renderApp({data,trip:t,route,mode,online:navigator.onLine,storageInfo,pwa:pwa?.state||{}});
 $('#app-header').innerHTML=view.header;$('#content').innerHTML=view.content;$('#nav').innerHTML=view.nav;$('#nav').hidden=!view.nav;
 document.body.dataset.page=route.page;document.title=`${t?t.title+' · ':''}TravelOrganizer`;
 if(location.hash!==lastHash){$('#content').scrollTop=0;lastHash=location.hash;}
 if(route.page==='document'&&t){
  const d=t.docs.find(d=>d.id===route.id);const mount=$('#file-preview');
  if(mount&&d?.filePresent){mount.innerHTML='<p role="status">Открываем локальный файл…</p>';try{const file=await store.getFile(t.id,d.id);if(token!==renderToken)return;if(!file){mount.innerHTML='<p class="notice">Содержимое файла не найдено. Метаданные сохранены; прикрепите файл повторно.</p>';return;}const url=URL.createObjectURL(file.blob);fileURLs.push(url);mount.innerHTML=file.type?.startsWith('image/')?`<img class="document-image" src="${attr(url)}" alt="${attr(d.title)}">`:`<iframe class="document-pdf" src="${attr(url)}" title="${attr(d.title)}"></iframe>`;}catch(e){mount.textContent=e.message;}}
 }
 if(route.page==='storage'){try{storageInfo=await store.storageInfo();if(token===renderToken){const target=$('#storage-estimate');if(target)target.textContent=`${formatBytes(storageInfo.usage||storageInfo.bytes||0)}${storageInfo.quota?' из '+formatBytes(storageInfo.quota):''}`;}}catch{}}
}
async function switchMode(next){if(forms?.isOpen&&!await forms.requestClose())return;const previous=store;const fresh=await openStore({demo:next==='demo'});store=fresh;data=fresh.data;mode=next;lastTripId=null;previous?.close();try{sessionStorage.setItem(modeKey,next);}catch{}const url=new URL(location.href);url.searchParams.delete('demo');url.hash='/trips';history.replaceState({},'',url);render();}
async function exportData(){const result=await store.exportData({includeFiles:true});download(result,`TravelOrganizer-${mode}-${new Date().toISOString().slice(0,10)}.json`);toast('Экспорт подготовлен. Сохраните скачанный файл.');}
function showInstall(){forms.show('Установка TravelOrganizer',`<p>В Chrome или Edge используйте пункт «Установить приложение» в меню браузера.</p><p>На iPhone откройте сайт в Safari, нажмите «Поделиться» → «На экран Домой». При наличии переключателя включите «Открывать как веб-приложение».</p><p>После первого успешного открытия дождитесь готовности офлайн-оболочки. Установка не заменяет экспорт личных данных.</p><p class="small muted">${pwa?.state?.standalone?'Приложение уже открыто в отдельном окне.':'Сейчас обычная вкладка браузера.'}</p>`);}
const editorActions={'new-trip':'trip','edit-trip':'trip','new-item':'item','edit-item':'item','item-state':'status','new-event':'event','edit-event':'event','new-task':'task','edit-task':'task','new-document':'document','edit-document':'document','new-template':'template','edit-template':'template','new-expense':'expense','new-transfer':'transfer','new-account':'account','edit-account':'account','new-category':'category','edit-budget':'budget','new-contact':'contact','edit-contact':'contact'};
async function action(button){
 const a=button.dataset.action,id=button.dataset.id;
 if(editorActions[a])return forms.open(editorActions[a],a.startsWith('edit')||a==='item-state'?id||((a==='edit-trip'||a==='edit-budget')?trip()?.id:route.id):null);
 if(a==='show-integration')return forms.integration(button.dataset.feature||'sync');
 if(a==='choose-demo')return switchMode('demo');if(a==='leave-demo')return switchMode('local');
 if(a==='back'){if(history.length>1)history.back();else navigate(trip()?href(trip().id):'#/trips');return;}
 if(a==='theme'){const chosen=button.dataset.theme||'system';await commit(d=>{d.settings={...d.settings,theme:chosen};});try{localStorage.setItem('travelorganizer.pwa.theme',chosen);}catch{}return render();}
 if(a==='export-data')return exportData();
 if(a==='import-data'){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const f=input.files[0];if(!f)return;if(f.size>80*1024*1024)throw new Error('Файл экспорта больше 80 МБ.');const payload=JSON.parse(await f.text());data=await store.importData(payload);await render();toast('Данные импортированы на устройство.');}catch(error){errorNotice(error);}};input.click();return;}
 if(a==='clear-data'){if(!await forms.confirm('Очистить текущие локальные данные?','Сначала будет скачан экспорт. Будут удалены записи и файлы текущего режима TravelOrganizer. Исходная копия прежнего хранилища для восстановления останется. Другие приложения и отдельная демонстрационная база не затрагиваются.',{accept:'Экспортировать и очистить',danger:true}))return;await exportData();await store.clearOwnData();data=store.data;navigate('#/trips');return render();}
 if(a==='persist-storage'){const allowed=await navigator.storage?.persist?.();toast(allowed?'Браузер предоставил устойчивое хранение. Экспорт всё равно нужен.':'Браузер не предоставил устойчивое хранение. Данные доступны, сохраняйте экспорт.');return;}
 if(a==='install'){const result=await pwa?.install();if(result?.status==='instructions')showInstall();return;}
 if(a==='check-update'){const result=await pwa?.checkUpdate();if(['error','unavailable'].includes(result?.status))toast(result.message||'Проверка обновлений недоступна.',true);else if(result?.status==='current')toast('Установлена актуальная версия.');return;}
 if(a==='apply-update'){if(forms.isOpen&&!await forms.requestClose())return;await pwa.applyUpdate();return;}
 if(a==='notifications'){if(!('Notification'in window))return forms.integration('push');const permission=await Notification.requestPermission();await commit(d=>{d.settings={...d.settings,notificationPermission:permission};});forms.show('Уведомления',`<p>Разрешение браузера: <strong>${esc(permission==='granted'?'разрешены':permission==='denied'?'отказано':'не выбрано')}</strong>.</p><p>Фоновая доставка и серверное расписание не подключены. Уведомления при закрытом приложении не отправляются.</p>`);return;}
 if(a==='copy-address'){const text=button.dataset.address||trip()?.events.find(v=>v.id===id)?.address||trip()?.contacts?.find(v=>v.id===id)?.address;if(!text)throw new Error('Адрес не указан.');try{await navigator.clipboard.writeText(text);toast('Адрес скопирован.');}catch{forms.show('Скопировать адрес',`<p class="selectable">${esc(text)}</p><p>Браузер запретил буфер обмена. Выделите и скопируйте адрес.</p>`);}return;}
 if(a==='toggle-task'){await commit(d=>{const t=d.trips.find(t=>t.id===route.tripId);const x=t.tasks.find(x=>x.id===id);if(!x)throw new Error('Задача не найдена.');x.completed=!x.completed;x.completedAt=x.completed?new Date().toISOString():null;});return render();}
 if(a==='toggle-pin'){await commit(d=>{const t=d.trips.find(t=>t.id===route.tripId);t.pins=t.pins.includes(id)?t.pins.filter(v=>v!==id):[...t.pins,id];});return render();}
 if(a==='archive-trip'){await commit(d=>{const t=d.trips.find(t=>t.id===(id||route.tripId));t.archived=!t.archived;});navigate('#/trips');return render();}
 if(a==='delete-trip'){const t=trip()||data.trips.find(t=>t.id===id);if(!t)return;if(!await forms.confirm('Удалить поездку?',`«${t.title}»: будут удалены её записи, операции и локальные файлы. Сохраните экспорт заранее.`,{accept:'Удалить поездку',danger:true}))return;await commit(d=>{d.trips=d.trips.filter(x=>x.id!==t.id);if(d.currentTripId===t.id)d.currentTripId=null;},{deleteTripId:t.id});navigate('#/trips');return render();}
 if(a==='apply-template'){const x=data.templates.find(v=>v.id===(id||route.id));let t=button.dataset.trip?data.trips.find(v=>v.id===button.dataset.trip):trip()||data.trips.find(v=>v.id===(route.query.get('trip')||lastTripId||data.currentTripId));if(!t&&data.trips.length===1)t=data.trips[0];if(!x)throw new Error('Набор не найден.');if(!t){forms.show('Выберите поездку',`<p>Куда добавить ${x.items.length} позиций из «${esc(x.title)}»?</p><div class="button-stack">${data.trips.map(v=>`<button class="btn secondary" data-action="apply-template" data-id="${attr(x.id)}" data-trip="${attr(v.id)}">${esc(v.title)}</button>`).join('')||'<p>Сначала создайте поездку.</p>'}</div>`);return;}if($('#dialog').open&&!forms.isOpen)await forms.requestClose();if(!await forms.confirm('Применить набор?',`Добавить ${x.items.length} позиций из «${x.title}» в «${t.title}»? Все новые вещи начнутся с «Ещё нет».`,{accept:'Добавить вещи'}))return;await commit(d=>{const target=d.trips.find(v=>v.id===t.id);target.items.push(...x.items.map(item=>({...typeof item==='string'?{title:item,quantity:1,category:'Личное'}:clone(item),id:uid(),status:'missing',assignee:'',taskId:'',createdAt:new Date().toISOString()})));});navigate(href(t.id,'packing'));toast('Вещи из набора добавлены.');return;}
 if(a==='copy-template'){await commit(d=>{const x=d.templates.find(v=>v.id===id);if(!x)throw new Error('Набор не найден.');d.templates.push({...clone(x),id:uid(),title:x.title+' · копия',items:x.items.map(v=>({...v,id:uid()}))});});return render();}
 if(a==='delete-template'){if(!await forms.confirm('Удалить набор?','Применённые вещи в поездках останутся.',{accept:'Удалить набор',danger:true}))return;await commit(d=>{d.templates=d.templates.filter(v=>v.id!==id);});navigate('#/templates');return render();}
 if(a==='open-file'){const d=trip()?.docs.find(v=>v.id===(id||route.id));if(!d)return;const f=await store.getFile(trip().id,d.id);if(!f)throw new Error('Файл не сохранён на устройстве. Здесь пока только запись.');download(f.blob,f.name||d.title,f.type);return;}
 if(a==='delete-file'){if(!await forms.confirm('Удалить локальную копию?','Метаданные документа останутся. Если это единственная копия, открыть файл можно будет только после повторного выбора.',{accept:'Удалить копию',danger:true}))return;await commit(d=>{const t=d.trips.find(t=>t.id===route.tripId);const x=t.docs.find(v=>v.id===(id||route.id));x.filePresent=false;x.localCopy=false;x.fileName='';x.fileSize=0;x.fileType='';},{fileDelete:{tripId:route.tripId,docId:id||route.id}});return render();}
 if(a==='delete-transaction'){if(!await forms.confirm('Отменить финансовую операцию?','Сумма будет возвращена на исходный счёт, а перевод вычтен у получателя. Изменение попадёт в историю.',{accept:'Отменить операцию'}))return;await commit(d=>{const t=d.trips.find(t=>t.id===route.tripId);deleteFinancialTransaction(t,id);(t.history||=[]).push({id:uid(),author:'На этом устройстве',action:'Отменена финансовая операция',time:new Date().toISOString()});});return render();}
 const deleting={'delete-item':['items','packing'],'delete-event':['events','plan'],'delete-task':['tasks','tasks'],'delete-document':['docs','documents'],'delete-contact':['contacts','contacts']};
 if(deleting[a]){const [list,parent]=deleting[a];if(!await forms.confirm('Удалить запись?','Будет удалена только выбранная запись и её локальные связи. Связанные задачи и события останутся.',{accept:'Удалить',danger:true}))return;await commit(d=>{const t=d.trips.find(t=>t.id===route.tripId);t[list]=(t[list]||[]).filter(v=>v.id!==id);if(list==='docs'){t.pins=t.pins.filter(v=>v!==id);t.events.forEach(v=>{if(v.documentId===id)v.documentId='';});}if(list==='tasks')t.items.forEach(v=>{if(v.taskId===id)v.taskId='';});if(list==='events')t.docs.forEach(v=>{if(v.eventId===id)v.eventId='';});},list==='docs'?{fileDelete:{tripId:route.tripId,docId:id}}:{});navigate(href(route.tripId,parent));return render();}
 if(a==='demo-message'){if(mode!=='demo')return forms.integration('sync');const input=$('[name="message"]')||$('#message-input');const text=String(input?.value||'').trim();if(!text)return;await commit(d=>{const t=d.trips.find(t=>t.id===route.tripId);(t.messages||=[]).push({id:uid(),author:'Вы',text,time:new Date().toISOString(),contextType:route.query.get('context')||'general',contextId:route.query.get('id')||''});});return render();}
 if(a==='demo-vote'){if(mode!=='demo')return forms.integration('sync');await commit(d=>{const p=d.trips.find(t=>t.id===route.tripId).poll;if(!p)return;const choice=button.dataset.option||id;if(p.myVote){const old=p.options.find(v=>v.id===p.myVote);if(old)old.votes=Math.max(0,(old.votes||0)-1);}const o=p.options.find(v=>v.id===choice);if(o){o.votes=(o.votes||0)+1;p.myVote=choice;}});return render();}
 if(a==='clear-filters'){navigate(href(route.tripId,route.page));return;}
 if(a==='retry-boot')return boot();
 console.warn('Unhandled action',a);toast('Это действие пока недоступно.',true);
}
document.addEventListener('click',e=>{if(e.target.closest('.skip-link')){e.preventDefault();$('#content').focus();return;}const b=e.target.closest('[data-action]');if(!b||b.disabled)return;e.preventDefault();Promise.resolve(action(b)).catch(errorNotice);});
document.addEventListener('submit',e=>{if(e.target.matches('[data-demo-message],[data-chat-form]')){e.preventDefault();action({dataset:{action:'demo-message'}}).catch(errorNotice);}if(e.target.matches('[data-search-form]'))e.preventDefault();});
let searchTimer;
document.addEventListener('input',e=>{if(!e.target.matches('[data-search]'))return;const input=e.target;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const query=new URLSearchParams(route.query);if(input.value)query.set('q',input.value);else query.delete('q');const hash=href(route.tripId,route.page,route.id,query);history.replaceState({},'',hash);const name=input.dataset.search,position=input.selectionStart;render().then(()=>{const x=document.querySelector(`[data-search="${CSS.escape(name)}"]`);if(x){x.focus();x.setSelectionRange(position,position);}});},140);});
document.addEventListener('change',e=>{if(!e.target.matches('[data-filter]'))return;const q=new URLSearchParams(route.query);const key=e.target.dataset.filter;q.set(key,e.target.value);if(key==='day')q.delete('undated');navigate(href(route.tripId,route.page,route.id,q));});
window.addEventListener('hashchange',()=>render().catch(errorNotice));
window.addEventListener('popstate',async()=>{if(forms?.isOpen&&!popClosing){popClosing=true;const closed=await forms.requestClose();if(!closed)history.pushState({editor:true},'',location.href);popClosing=false;}});
window.addEventListener('beforeunload',e=>{if(forms?.isDirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',onlineStatus);window.addEventListener('offline',onlineStatus);
const viewport=window.visualViewport;viewport?.addEventListener('resize',()=>{document.body.classList.toggle('keyboard-open',viewport.height<window.innerHeight*.75&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName));});
if('ResizeObserver'in window)new ResizeObserver(()=>{document.documentElement.style.setProperty('--nav-height',$('#nav').getBoundingClientRect().height+'px');}).observe($('#nav'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);

async function boot(){
 try{
  try{mode=new URLSearchParams(location.search).get('demo')==='1'||sessionStorage.getItem(modeKey)==='demo'?'demo':'local';}catch{}
  store=await openStore({demo:mode==='demo'});data=store.data;
  forms=createFormManager({data:()=>data,trip,commit,toast,navigate,refresh:render,refreshBase:async()=>{data=await store.refresh();return data;},mode:()=>mode,onFormOpen(){history.pushState({editor:true},'',location.href);},async onFormClose(){if(history.state?.editor&&!popClosing)await new Promise(resolve=>{window.addEventListener('popstate',resolve,{once:true});history.back();});}});
  setupGestures({trip,forms,commit,render,toast});
  pwa=setupPWA({onStatus(){if(data){onlineStatus();if(['settings','profile'].includes(route?.page)&&!forms?.isOpen)render();}},onUpdate(info){const b=$('#update-banner');b.hidden=!info.available;b.innerHTML=info.available?`<span>Доступна новая версия. Ввод не будет сброшен автоматически.</span><button class="btn secondary" data-action="apply-update">Обновить</button>`:'';}});
  if(!location.hash)history.replaceState({},'','#/trips');$('#boot-error')?.setAttribute('hidden','');await render();
 }catch(error){
  const target=$('#boot-error')||$('#content');target.hidden=false;target.innerHTML=`<section class="empty-state"><h1>Не удалось открыть локальные данные</h1><p>${esc(error.message)}</p><p>Исходная запись не заменена примером. Можно сохранить её для восстановления и повторить открытие.</p><button class="btn primary" id="export-legacy">Экспорт исходной записи</button><button class="btn secondary" data-action="retry-boot">Повторить</button><button class="btn secondary" id="boot-demo">Открыть отдельный деморежим</button></section>`;
  $('#export-legacy')?.addEventListener('click',()=>{try{const raw=localStorage.getItem('travelorganizer.multitool.v1');download(new Blob([raw||''],{type:'text/plain'}),'TravelOrganizer-original.txt');}catch(e){errorNotice(e);}});
  $('#boot-demo')?.addEventListener('click',()=>{try{sessionStorage.setItem(modeKey,'demo');}catch{}location.search='?demo=1';});
 }
}
boot();
