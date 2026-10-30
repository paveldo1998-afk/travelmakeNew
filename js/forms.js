import {esc, attr, money, today} from './shared.js';
import {uid, createTrip, toMinor, addExpense, transferFunds} from './domain.js';

const FILE_LIMIT=10*1024*1024;
const kinds={trip:'поездку',item:'вещь',event:'событие',task:'задачу',document:'документ',template:'шаблон',expense:'расход',transfer:'перевод',account:'счёт',category:'категорию',budget:'бюджет',contact:'контакт',status:'состояние вещи'};
const statusNames={missing:'Ещё нет',home:'Дома',packed:'Упаковано'};
const note=s=>`<p class="form-hint">${esc(s)}</p>`;
function field(name,label,value='',type='text',extra='') {return `<div class="field-row"><label for="field-${attr(name)}">${esc(label)}</label><input id="field-${attr(name)}" name="${attr(name)}" type="${type}" value="${attr(value??'')}" ${extra}></div>`;}
function area(name,label,value='',extra=''){return `<div class="field-row"><label for="field-${attr(name)}">${esc(label)}</label><textarea id="field-${attr(name)}" name="${attr(name)}" rows="3" ${extra}>${esc(value??'')}</textarea></div>`;}
function select(name,label,value,options,extra=''){return `<div class="field-row"><label for="field-${attr(name)}">${esc(label)}</label><select id="field-${attr(name)}" name="${attr(name)}" ${extra}>${options.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${attr(v)}" ${String(v)===String(value??'')?'selected':''}>${esc(l)}</option>`;}).join('')}</select></div>`;}
const required='required maxlength="160"';
function dateValid(s){if(!s)return true;const n=new Date(`${s}T12:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(+n)&&n.toISOString().slice(0,10)===s;}
function ensure(condition,message,field){if(!condition){const e=new Error(message);e.field=field;throw e;}}
function validURL(s){if(!s)return '';try{const u=new URL(s);if(!['https:','http:'].includes(u.protocol))throw 0;return u.href;}catch{throw Object.assign(new Error('Укажите полный адрес ссылки с https:// или http://.'),{field:'url'});}}
export async function validateFile(file){
 ensure(file&&file.size>0,'Выберите непустой PDF или изображение.','file');
 ensure(file.size<=FILE_LIMIT,'Файл больше 10 МБ. Выберите файл меньшего размера.','file');
 ensure(['application/pdf','image/png','image/jpeg','image/webp'].includes(file.type),'Допустимы PDF, PNG, JPEG и WebP.','file');
 const b=new Uint8Array(await file.slice(0,16).arrayBuffer());const text=new TextDecoder().decode(b);
 const good=file.type==='application/pdf'?text.startsWith('%PDF-'):file.type==='image/png'?b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71:file.type==='image/jpeg'?b[0]===255&&b[1]===216:text.startsWith('RIFF')&&text.slice(8,12)==='WEBP';
 ensure(good,'Содержимое файла не соответствует выбранному типу.','file');return file;
}

export function createFormManager(api){
 const dialog=document.querySelector('#dialog');let current=null,baseline='',busy=false,lastFocus=null,conflict=null;
 const confirmDialog=document.createElement('dialog');confirmDialog.id='confirm-dialog';confirmDialog.setAttribute('aria-labelledby','confirm-title');document.body.append(confirmDialog);
 const serial=()=>{const f=dialog.querySelector('form');return f?JSON.stringify([...new FormData(f)].map(([k,v])=>[k,v instanceof File?(v.size?`${v.name}:${v.size}:${v.lastModified}`:''):v])):'';};
 const dirty=()=>!!current&&serial()!==baseline;
 const closeNow=async()=>{current=null;busy=false;dialog.close();dialog.querySelector('#dialog-body').innerHTML='';lastFocus?.focus?.();await api.onFormClose?.();};
 function confirm(title,text,{accept='Продолжить',danger=false}={}){
  return new Promise(resolve=>{confirmDialog.innerHTML=`<div class="dialog-inner"><h2 id="confirm-title">${esc(title)}</h2><p>${esc(text)}</p><div class="dialog-actions"><button class="btn secondary" data-confirm="no" autofocus>Отмена</button><button class="btn ${danger?'danger':'primary'}" data-confirm="yes">${esc(accept)}</button></div></div>`;
   const finish=result=>{confirmDialog.close();confirmDialog.onclick=null;confirmDialog.oncancel=null;resolve(result);};
   confirmDialog.onclick=e=>{const b=e.target.closest('[data-confirm]');if(b)finish(b.dataset.confirm==='yes');};confirmDialog.oncancel=e=>{e.preventDefault();finish(false);};confirmDialog.showModal();confirmDialog.querySelector('[autofocus]').focus();});
 }
 async function requestClose(){if(busy)return false;if(dirty()&&!await confirm('Выйти без сохранения?','Изменённые поля будут потеряны. Можно отменить выход и продолжить редактирование.',{accept:'Выйти без сохранения',danger:true}))return false;await closeNow();return true;}
 function fail(error){const el=dialog.querySelector('.form-error');if(!el)return;el.hidden=false;el.textContent=error.message||'Не удалось сохранить. Введённые поля остались в форме.';if(error.code==='CONFLICT'){conflict=error.latestData;const b=document.createElement('button');b.type='button';b.className='btn secondary';b.dataset.formConflict='';b.textContent='Сравнить изменения';el.append(document.createElement('br'),b);}const target=dialog.querySelector(`[name="${CSS.escape(error.field||'')}"]`);(target||el).focus();}
 function compareConflict(){
  if(!conflict||!current)return;const {kind,id,tripId}=current;const t=conflict.trips.find(v=>v.id===tripId);const lists={item:'items',status:'items',event:'events',task:'tasks',document:'docs',contact:'contacts',account:'accounts',category:'categories'};
  const record=kind==='trip'?conflict.trips.find(v=>v.id===id):kind==='template'?conflict.templates.find(v=>v.id===id):kind==='budget'?t:t?.[lists[kind]]?.find(v=>v.id===id);
  const rows=[];for(const [name,value]of new FormData(dialog.querySelector('form'))){if(value instanceof File)continue;const latest=record?.[name]??'';if(String(value)!==String(latest)){const label=dialog.querySelector(`[for="field-${CSS.escape(name)}"]`)?.textContent||name;rows.push(`<tr><th>${esc(label)}</th><td>${esc(value)}</td><td>${esc(latest)}</td></tr>`);}}
  confirmDialog.innerHTML=`<div class="dialog-inner"><h2 id="confirm-title">Сравнение локальных правок</h2><p>Другая вкладка сохранила более новую версию. Это локальный конфликт, серверная синхронизация не подключена.</p>${rows.length?`<div class="table-scroll"><table><thead><tr><th>Поле</th><th>Ваш ввод</th><th>Сохранено другой вкладкой</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'<p>Поля этой формы не отличаются. Изменения произошли в других записях.</p>'}<p>Если принять актуальную базу, ваш ввод останется в форме. Последующее «Сохранить» заменит показанные поля вашей версией; остальные записи останутся актуальными.</p>${id&&!record?'<p class="notice">Эта запись удалена другой вкладкой. Сохранить её под прежним ID нельзя. Скопируйте нужный ввод перед закрытием.</p>':''}<div class="dialog-actions"><button type="button" class="btn secondary" data-conflict-back>Вернуться к форме</button><button type="button" class="btn primary" data-conflict-adopt ${id&&!record?'disabled':''}>Принять актуальную базу</button></div></div>`;
  confirmDialog.onclick=async e=>{if(e.target.closest('[data-conflict-back]'))confirmDialog.close();if(e.target.closest('[data-conflict-adopt]')){try{await api.refreshBase();conflict=null;confirmDialog.close();dialog.querySelector('.form-error').textContent='Актуальная база принята. Проверьте поля и нажмите «Сохранить», если хотите применить свой ввод.';}catch(error){api.toast(error.message,true);}}};confirmDialog.oncancel=e=>{e.preventDefault();confirmDialog.close();};confirmDialog.showModal();
 }
 function options(xs,labelKey='title'){return [['','Не связывать'],...(xs||[]).map(x=>[x.id,x[labelKey]])];}
 async function open(kind,id){
  if(current&&!await requestClose())return;
  const data=api.data(),trip=api.trip();let obj;
  const list={item:'items',event:'events',task:'tasks',document:'docs',account:'accounts',category:'categories',contact:'contacts'}[kind];
  if(kind==='trip')obj=id?data.trips.find(x=>x.id===id):null;
  else if(kind==='template')obj=id?data.templates.find(x=>x.id===id):null;
  else if(kind==='budget')obj=trip;
  else if(kind==='status')obj=trip?.items.find(x=>x.id===id);
  else obj=id?trip?.[list]?.find(x=>x.id===id):null;
  if(id&&!obj){api.toast('Запись не найдена. Возможно, она удалена в другой вкладке.');return;}
  let fields='',title=`${obj?'Изменить':'Добавить'} ${kinds[kind]}`,submit='Сохранить';const x=obj||{};
  if(kind==='trip'){
   title=obj?'Изменить поездку':'Новое путешествие';submit=obj?'Сохранить изменения':'Создать поездку';
   const covers=[['','Без обложки'],['kyoto','Киото · пагода на закате'],['amalfi','Побережье Амальфи'],['barcelona','Барселона']];if(x.cover&&!covers.some(c=>c[0]===x.cover))covers.push([x.cover,'Существующая обложка']);
   fields=field('title','Название поездки *',x.title,'text',required)+`<div class="form-grid">${field('start','Начало',x.start,'date')}${field('end','Окончание',x.end,'date')}</div>`+note('Обе даты можно оставить пустыми или задать только начало.')+`<details ${obj?'open':''}><summary>Направление и другие сведения</summary>${field('destinations','Города и места',Array.isArray(x.destinations)?x.destinations.join(', '):x.destinations||'')}${select('cover','Обложка по желанию',x.cover||'',covers)}${area('description','О поездке',x.description)}${select('currency','Основная валюта',x.currency||'RUB',['RUB','EUR','USD','JPY','THB','KRW','KWD'])}${note('Валюту поездки с финансовыми операциями изменить нельзя. Счета и суммы сохраняются.')}</details>`;
  }else if(kind==='item'){
   fields=field('title','Название *',x.title,'text',required)+`<div class="form-grid">${field('quantity','Количество *',x.quantity||1,'number','required min="1" max="9999" step="1"')}${field('category','Категория',x.category||'Личное')}</div>`+select('status','Состояние',x.status||'missing',Object.entries(statusNames))+field('assignee','Ответственный · локальная метка',x.assignee)+area('note','Заметка',x.note)+field('url','Товарная ссылка',x.url,'url')+select('taskId','Связанная задача',x.taskId,options(trip?.tasks));
  }else if(kind==='status'){
   title='Состояние вещи';fields=`<p>${esc(x.title)}</p><div class="state-targets">${Object.entries(statusNames).map(([v,n])=>`<label class="state-target"><input type="radio" name="status" value="${v}" ${x.status===v?'checked':''}> <strong>${esc(n)}</strong></label>`).join('')}</div>`+note('Это три состояния одной вещи. Выполнение связанной задачи не меняет их автоматически.');
  }else if(kind==='event'){
   fields=field('title','Название *',x.title,'text',required)+`<div class="form-grid">${field('date','День · можно не назначать',x.date,'date')}${field('time','Время по месту события',x.time,'time')}</div>`+select('timeZone','Часовой пояс',x.timeZone||'Asia/Tokyo',['Europe/Moscow','Asia/Tokyo','Europe/Rome','Europe/Paris','UTC'])+field('address','Адрес',x.address)+field('category','Категория',x.category||'Место')+select('photo','Фото по желанию',x.photo||'',[['','Без фото'],['temple','Храм Киёмидзу-дэра'],['breakfast','Японский завтрак · иллюстрация кухни'],['kyoto-alley','Улица Киото'],['kyoto','Пагода в Киото']])+area('note','Заметка',x.note)+field('contact','Контакт',x.contact)+select('documentId','Связанный документ',x.documentId,options(trip?.docs))+note('При назначении или очистке дня сохраняются прежние ID и связи.');
  }else if(kind==='task'){
   fields=field('title','Название *',x.title,'text',required)+`<div class="form-grid">${field('due','Срок · можно без даты',x.due,'date')}${field('time','Время',x.time,'time')}</div>`+select('timeZone','Часовой пояс',x.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone,['Europe/Moscow','Asia/Tokyo','Europe/Rome','UTC',Intl.DateTimeFormat().resolvedOptions().timeZone].filter((v,i,a)=>a.indexOf(v)===i))+select('phase','Когда выполнить',x.phase||'before',[['before','До поездки'],['during','Во время поездки'],['after','После поездки']])+field('assignee','Ответственный · локальная метка',x.assignee)+select('reminder','Напоминание',x.reminder||'none',[['none','Не напоминать'],['at','В указанное время — настройка']])+note('Фоновая доставка не подключена. Сохранённая настройка не гарантирует уведомление при закрытом приложении.')+area('note','Описание',x.note)+`<label class="check-field"><input name="completed" type="checkbox" ${x.completed?'checked':''}> Задача выполнена</label>`;
  }else if(kind==='document'){
   title=obj?'Изменить документ':'Добавить документ';
   fields=field('title','Название *',x.title,'text',required)+select('category','Категория',x.category||'other',[['other','Другое'],['booking','Бронирование'],['ticket','Билет'],['personal','Личное'],['insurance','Страхование']])+`<div class="field-row"><label for="field-file">${obj?'Прикрепить или заменить файл':'Файл по желанию'}</label><input id="field-file" name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp"><small>PDF, PNG, JPEG, WebP · до 10 МБ</small></div>`+note('Без файла создаётся запись. Наличие локальной копии подтверждается только после записи содержимого в IndexedDB.')+select('eventId','Связать с событием',x.eventId,options(trip?.events))+area('note','Реквизиты или заметка',x.note)+`<div class="notice"><strong>Только на этом устройстве</strong><p>Серверные права и передача другим участникам не подключены. Локальный файл не становится общим.</p></div>`;
  }else if(kind==='template'){
   const items=(x.items||[]).map(v=>`${v.title} | ${v.quantity||1} | ${v.category||'Личное'}`).join('\n');
   fields=field('title','Имя набора *',x.title,'text',required)+area('items','Состав набора *',items,'required rows="7"')+note('Одна вещь в строке: название | количество | категория. Например: Дождевик | 1 | Одежда. Применённые вещи независимы от набора.');
  }else if(kind==='expense'){
   title='Добавить расход';fields=field('amount','Сумма *','','text','required inputmode="decimal" autocomplete="off"')+select('currency','Валюта расхода',trip.currency,[trip.currency,...['RUB','EUR','USD','JPY','THB','KRW','KWD'].filter(v=>v!==trip.currency)])+select('fromId','Счёт *',trip.accounts[0]?.id,(trip.accounts||[]).map(a=>[a.id,`${a.name} · ${money(a.balance,trip.currency)}`]),'required')+select('categoryId','Категория *',trip.categories[0]?.id,(trip.categories||[]).map(c=>[c.id,c.name]),'required')+field('date','Дата',today(),'date','required')+`<details><summary>Курс для другой валюты</summary>${field('rate',`За 1 единицу валюты расхода в ${trip.currency}`,'','text','inputmode="decimal"')}${field('rateDate','Дата введённого курса','','date')}${note('Курс вводится вручную. Сумма в валюте счёта должна точно представляться без округления. Внешний источник курсов не подключён.')}</details><details><summary>Участники, заметка и документ</summary>${field('payer','Плательщик · личная метка','Я')}${field('participants','Участники · через запятую','')}${area('note','Заметка','')}${select('documentId','Документ','',options(trip.docs))}${note('Личные метки сохраняются локально. Общий расчёт долгов требует отдельной серверной реализации.')}</details>`;
  }else if(kind==='transfer'){
   title='Перевести между счетами';fields=select('fromId','Откуда',trip.accounts[0]?.id,trip.accounts.map(a=>[a.id,`${a.name} · ${money(a.balance,trip.currency)}`]))+select('toId','Куда',trip.accounts[1]?.id,trip.accounts.map(a=>[a.id,a.name]))+field('amount',`Сумма в ${trip.currency} *`,'','text','required inputmode="decimal"')+field('date','Дата',today(),'date','required')+area('note','Заметка','')+note('Перевод меняет остатки счетов и не увеличивает сумму расходов.');
  }else if(kind==='account'){
   fields=field('name','Название счёта *',x.name,'text',required)+select('kind','Расположение',x.kind||'withMe',[['withMe','С собой'],['storage','В номере'],['other','Другое']])+field('balance',`Текущий остаток в ${trip.currency} *`,x.balance??'0','text','required inputmode="decimal"')+note('Это текущий остаток, а не плановый бюджет. Изменение остатка записывается в историю как сверка, не как расход.');
  }else if(kind==='category'){
   fields=field('name','Название *',x.name,'text',required)+field('icon','Символ по желанию',x.icon||'','text','maxlength="4"');
  }else if(kind==='budget'){
   title='Плановый бюджет';fields=field('budget',`Плановая сумма в ${trip.currency}`,x.budget??'','text','inputmode="decimal"')+note('Можно оставить пустым. Остатки счетов и сумма долгов не подставляются вместо бюджета.');
  }else if(kind==='contact'){
   fields=field('title','Название *',x.title,'text',required)+field('phone','Телефон',x.phone,'tel')+field('address','Адрес',x.address)+field('url','Ссылка',x.url,'url')+area('note','Заметка',x.note);
  }else throw new Error('Неизвестная форма');
  current={kind,id,tripId:trip?.id};lastFocus=document.activeElement;
  dialog.querySelector('#dialog-body').innerHTML=`<div class="dialog-inner"><div class="dialog-heading"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="icon-btn" data-form-close aria-label="Закрыть форму">×</button></div><form data-editor="${attr(kind)}"><p class="form-error" role="alert" tabindex="-1" hidden></p>${fields}<div class="dialog-actions"><button type="button" class="btn secondary" data-form-close>Отмена</button><button class="btn primary" type="submit">${esc(submit)}</button></div><p class="form-hint">${api.mode()==='demo'?'Изменения сохранятся в отдельной демонстрационной базе.':'Локальный режим разработки · сохранение на этом устройстве.'}</p></form></div>`;
  baseline=serial();dialog.showModal();dialog.querySelector('input:not([type=file]), select, textarea')?.focus();api.onFormOpen?.();
 }
 dialog.addEventListener('cancel',e=>{e.preventDefault();requestClose();});
 dialog.addEventListener('click',e=>{if(e.target.closest('[data-form-conflict]'))compareConflict();else if(e.target===dialog||e.target.closest('[data-form-close]'))requestClose();});
 dialog.addEventListener('submit',async e=>{
  const f=e.target;if(!f.matches('[data-editor]'))return;e.preventDefault();if(busy)return;
  const {kind,id,tripId}=current;const fd=new FormData(f);const val=n=>String(fd.get(n)||'').trim();const fields=Object.fromEntries([...fd].filter(([,v])=>!(v instanceof File)).map(([k,v])=>[k,String(v).trim()]));
  const data=api.data(),oldTrip=data.trips.find(t=>t.id===tripId);let file=null,newId=id||uid();
  try{
   if(['trip','item','event','task','document','template','contact'].includes(kind))ensure(val('title').length>0,'Введите название.','title');
   if(['account','category'].includes(kind))ensure(val('name').length>0,'Введите название.','name');
   for(const n of ['start','end','date','due','rateDate'])ensure(dateValid(val(n)),'Проверьте дату.',n);
   if(kind==='trip')ensure(!val('start')||!val('end')||val('end')>=val('start'),'Дата окончания раньше даты начала.','end');
   if(kind==='item')ensure(Number.isInteger(Number(val('quantity')))&&+val('quantity')>0&&+val('quantity')<=9999,'Количество должно быть целым числом от 1 до 9999.','quantity');
   if(['item','contact'].includes(kind))fields.url=validURL(val('url'));
   if(kind==='task'&&val('reminder')!=='none')ensure(val('due')&&val('time'),'Для настройки напоминания укажите срок и время. Фоновая доставка не подключена.','due');
   if(kind==='document'){const candidate=fd.get('file');if(candidate instanceof File&&candidate.size)file=await validateFile(candidate);}
   if(kind==='trip'&&id){const original=data.trips.find(t=>t.id===id);const hasMoney=original.transactions?.length||original.accounts?.some(a=>Number(a.balance)!==0)||(original.budget!==''&&original.budget!=null&&Number(original.budget)!==0);ensure(!hasMoney||original.currency===fields.currency,'Поездка содержит финансовые суммы. Валюту можно изменить только в отдельной миграции.','currency');}
   if(['expense','transfer','account','budget'].includes(kind)){
    const name=kind==='account'?'balance':kind==='budget'?'budget':'amount';if(val(name)!==''||kind!=='budget'){let minor;try{minor=toMinor(val(name),kind==='expense'?fields.currency:oldTrip.currency);}catch(error){error.field=name;throw error;}ensure(BigInt(minor)>=0n,'Сумма не может быть отрицательной.',name);if(['expense','transfer'].includes(kind))ensure(BigInt(minor)>0n,'Введите сумму больше нуля.',name);}
   }
   if(kind==='template')ensure(val('items'),'Добавьте хотя бы одну вещь в набор.','items');
   busy=true;const save=f.querySelector('[type=submit]');save.disabled=true;save.textContent=file?'Сохраняем файл…':'Сохраняем…';f.querySelector('.form-error').hidden=true;
   const fileOptions=file?{filePut:{tripId,docId:newId,blob:file,name:file.name,type:file.type}}:{};
   await api.commit(d=>{
    const t=d.trips.find(t=>t.id===tripId);if(kind!=='trip'&&kind!=='template')ensure(t,'Поездка не найдена.');
    const now=new Date().toISOString();
    function put(list,patch){const xs=t[list]||(t[list]=[]);const i=xs.findIndex(v=>v.id===id);if(id)ensure(i>=0,'Запись больше не существует.');if(i>=0&&Object.hasOwn(xs[i],'notes')&&Object.hasOwn(patch,'note'))patch.notes=patch.note;const record={...(i>=0?xs[i]:{}),...patch,id:newId,updatedAt:now};if(i>=0)xs[i]=record;else xs.push({...record,createdAt:now,author:'На этом устройстве'});return record;}
    if(kind==='trip'){
     if(id){const x=d.trips.find(t=>t.id===id);Object.assign(x,fields,{destinations:val('destinations').split(',').map(v=>v.trim()).filter(Boolean),updatedAt:now});}
     else {const x=createTrip({...fields,id:newId});x.id=newId;d.trips.push(x);d.currentTripId=newId;}
    }else if(kind==='item')put('items',{...fields,quantity:Number(fields.quantity),status:fields.status||'missing'});
    else if(kind==='status'){const x=t.items.find(x=>x.id===id);ensure(x,'Вещь не найдена.');ensure(Object.hasOwn(statusNames,fields.status),'Выберите состояние.');x.status=fields.status;x.updatedAt=now;}
    else if(kind==='task')put('tasks',{...fields,completed:fd.has('completed')});
    else if(kind==='event'){
     const previous=t.events.find(v=>v.id===id);if(previous?.documentId!==fields.documentId){const old=t.docs.find(v=>v.id===previous?.documentId);if(old?.eventId===id)old.eventId='';}
     put('events',fields);const doc=t.docs.find(v=>v.id===fields.documentId);if(doc){const displaced=t.events.find(v=>v.id===doc.eventId);if(displaced&&displaced.id!==newId&&displaced.documentId===doc.id)displaced.documentId='';doc.eventId=newId;}
    }else if(kind==='document'){
     const patch={...fields};if(!id)Object.assign(patch,{owner:'На этом устройстве',audience:'Только мне',cached:false,filePresent:false});if(file)Object.assign(patch,{filePresent:true,fileName:file.name,fileType:file.type,fileSize:file.size,cached:false});
     const prev=t.docs.find(v=>v.id===id);if(prev?.eventId!==patch.eventId){const ev=t.events.find(v=>v.id===prev?.eventId);if(ev?.documentId===id)ev.documentId='';}
     put('docs',patch);const ev=t.events.find(v=>v.id===patch.eventId);if(ev){const displaced=t.docs.find(v=>v.id===ev.documentId);if(displaced&&displaced.id!==newId&&displaced.eventId===ev.id)displaced.eventId='';ev.documentId=newId;}
    }else if(kind==='template'){
     const old=d.templates.find(v=>v.id===id);const items=val('items').split('\n').filter(s=>s.trim()).map((s,i)=>{const [title,q='1',category='Личное']=s.split('|').map(v=>v.trim());ensure(title&&Number.isInteger(+q)&&+q>0&&+q<=9999,'Проверьте названия и количество в составе набора.','items');return {id:old?.items?.[i]?.id||uid(),title,quantity:+q,category};});
     const record={...old,id:newId,title:fields.title,name:fields.title,items,updatedAt:now};const index=d.templates.findIndex(v=>v.id===id);if(index>=0)d.templates[index]=record;else d.templates.push(record);
    }else if(kind==='expense'){addExpense(t,{...fields,participants:val('participants').split(',').map(v=>v.trim()).filter(Boolean),currency:fields.currency||t.currency});}
    else if(kind==='transfer')transferFunds(t,fields);
    else if(kind==='account')put('accounts',{...fields,balance:fields.balance.replace(',','.'),balanceMinor:toMinor(fields.balance,t.currency)});
    else if(kind==='category')put('categories',{...fields,sort:t.categories.length});
    else if(kind==='budget'){t.budget=fields.budget;if(fields.budget==='')delete t.budgetMinor;else t.budgetMinor=toMinor(fields.budget,t.currency);}
    else if(kind==='contact')put('contacts',{...fields,name:fields.title});
    if(t){t.history=t.history||[];t.history.push({id:uid(),author:'На этом устройстве',action:`${id?'Изменено':'Добавлено'}: ${kinds[kind]}`,time:now});}
   },fileOptions);
   await closeNow();api.toast(file?'Файл сохранён на устройстве':'Сохранено на устройстве');
   if(kind==='trip')api.navigate(`#/trip/${encodeURIComponent(newId)}/overview`);
   else if(kind==='template')api.navigate(`#/template/${encodeURIComponent(newId)}`);
   else api.refresh();
  }catch(error){busy=false;const save=f.querySelector('[type=submit]');if(save){save.disabled=false;save.textContent='Сохранить';}fail(error);}
 });
 return {open,confirm,requestClose,get isDirty(){return dirty();},get isOpen(){return !!current;},get busy(){return busy;},show(title,body){if(current)return;lastFocus=document.activeElement;dialog.querySelector('#dialog-body').innerHTML=`<div class="dialog-inner"><h2 id="dialog-title">${esc(title)}</h2>${body}<div class="dialog-actions"><button class="btn secondary" data-form-close>Закрыть</button></div></div>`;dialog.showModal();dialog.querySelector('button')?.focus();},integration(feature){const text={auth:'Вход через Google и Apple требует серверной проверки аккаунта. Сейчас доступен явно обозначенный локальный режим разработки.',invitation:'Создание и принятие приглашений, истечение и отзыв требуют сервера. Работающая ссылка не создаётся.',permissions:'Серверные права файлов не подключены. Метка аудитории записи не передаёт доступ к содержимому.',sync:'Серверная синхронизация не подключена. Эти записи существуют только в браузере. Экспортируйте резервную копию.',push:'Фоновая доставка уведомлений и серверное расписание не подключены. Разрешение браузера само по себе не включает доставку.',maps:'Картографический адаптер не настроен. Адреса остаются доступны в списке. Офлайн-карта не реализована.',settlements:'Совместное распределение, балансы участников и погашение долгов требуют общей серверной книги. Локальные расходы и переводы между своими счетами уже доступны.'};this.show('Интеграция пока не подключена',`<div class="notice"><p>${esc(text[feature]||text.sync)}</p></div>`);}};
}
