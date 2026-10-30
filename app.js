const showBootError=error=>{
 const target=document.querySelector('#boot-error');if(!target)return;
 target.hidden=false;const heading=document.createElement('h1');heading.textContent='Не удалось загрузить приложение';
 const message=document.createElement('p');message.textContent=error?.message||'Проверьте подключение и повторите открытие. Локальные данные не очищены.';
 const retry=document.createElement('button');retry.className='btn primary';retry.textContent='Повторить загрузку';retry.addEventListener('click',()=>location.reload());
 target.replaceChildren(heading,message,retry);
};
import('./js/controller.js').catch(showBootError);
