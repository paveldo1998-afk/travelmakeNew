import {esc} from './shared.js';
/** Optional transfers; ordinary labelled buttons are always available. */
export function setupGestures(api){
 let timer,origin=null,active=null,suppressUntil=0;
 const clear=()=>{clearTimeout(timer);origin=null;active=null;document.querySelector('#gesture-panel')?.remove();document.querySelectorAll('.money-drag-source,.money-drag-target').forEach(e=>e.classList.remove('money-drag-source','money-drag-target'));document.body.classList.remove('gesture-active');};
 const show=held=>{active=held;document.body.classList.add('gesture-active');const panel=document.createElement('section');panel.id='gesture-panel';panel.className='gesture-panel';panel.setAttribute('aria-label','Перенос с подтверждением');
  if(held.type==='item'){const item=api.trip()?.items.find(i=>i.id===held.id);panel.innerHTML=`<p>Перенести «${esc(item?.title)}»</p><div class="gesture-targets">${[['missing','Ещё нет'],['home','Дома'],['packed','Упаковано']].map(([v,label])=>`<button type="button" class="btn secondary" data-drop-state="${v}">${label}</button>`).join('')}</div><button class="btn ghost" type="button" data-gesture-cancel>Отмена переноса</button>`;
  }else{panel.innerHTML='<p>Отпустите над категорией или другим счётом. Сумма и подтверждение — на следующем шаге.</p><button class="btn secondary" type="button" data-gesture-cancel>Отмена переноса</button>';document.querySelector(`[data-money-account="${CSS.escape(held.id)}"]`)?.classList.add('money-drag-source');}
  document.body.append(panel);suppressUntil=Date.now()+1000;
 };
 async function drop(target){const held=active;if(!held)return;const state=target?.closest('[data-drop-state]')?.dataset.dropState;const to=target?.closest('[data-money-account]')?.dataset.moneyAccount;const category=target?.closest('[data-money-category]')?.dataset.moneyCategory;
  if(held.type==='item'&&state){clear();await api.commit(d=>{const t=d.trips.find(t=>t.id===held.tripId);const item=t.items.find(i=>i.id===held.id);if(item)item.status=state;});api.toast('Состояние вещи сохранено');api.render();return;}
  if(held.type==='money'&&((to&&to!==held.id)||category)){clear();await api.forms.open(to?'transfer':'expense');const form=document.querySelector('#dialog form');if(form){form.elements.fromId.value=held.id;if(to)form.elements.toId.value=to;else form.elements.categoryId.value=category;form.elements.amount.focus();}return;}
 }
 document.addEventListener('pointerdown',e=>{if(document.querySelector('dialog[open]')||active)return;const money=e.target.closest('[data-money-account]'),item=e.target.closest('[data-long-item]');if(!money&&(!item||e.target.closest('button,input')))return;const t=api.trip();if(!t)return;origin={x:e.clientX,y:e.clientY,type:money?'money':'item',id:money?.dataset.moneyAccount||item.dataset.longItem,tripId:t.id};timer=setTimeout(()=>show({...origin}),500);});
 document.addEventListener('pointermove',e=>{if(active){e.preventDefault();document.querySelectorAll('.money-drag-target').forEach(n=>n.classList.remove('money-drag-target'));document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-money-account],[data-money-category],[data-drop-state]')?.classList.add('money-drag-target');}else if(origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>12){clearTimeout(timer);origin=null;}},{passive:false});
 document.addEventListener('pointerup',e=>{clearTimeout(timer);origin=null;if(active){suppressUntil=Date.now()+500;drop(document.elementFromPoint(e.clientX,e.clientY)).catch(error=>{clear();api.toast(error.message,true);});}});
 document.addEventListener('pointercancel',clear);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();clear();}});
 document.addEventListener('click',e=>{if(e.target.closest('[data-gesture-cancel]')){e.preventDefault();e.stopImmediatePropagation();clear();return;}if(active&&e.target.closest('[data-drop-state],[data-money-account],[data-money-category]')){e.preventDefault();e.stopImmediatePropagation();drop(e.target).catch(error=>api.toast(error.message,true));return;}if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();suppressUntil=0;}},true);
 window.addEventListener('hashchange',clear);
}
