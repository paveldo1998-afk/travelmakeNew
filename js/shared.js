// Small, shared presentation primitives. All user-supplied strings are escaped.
import {formatMoney} from './domain.js';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const attr = esc;
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const initials = value => String(value || 'Вы').trim().split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toLocaleUpperCase('ru');
export const dateLabel = (value, options = {}) => { if(!value) return 'Без даты'; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value); return Number.isNaN(d.getTime()) ? 'Дата не указана' : new Intl.DateTimeFormat('ru-RU', {day:'numeric',month:'short',...options}).format(d); };
export function formatDateRange(start, end) { if(!start&&!end) return 'Даты пока не выбраны'; if(!start) return `До ${dateLabel(end,{year:'numeric'})}`; if(!end) return `С ${dateLabel(start,{year:'numeric'})}`; if(start===end) return dateLabel(start,{year:'numeric'}); const a=new Date(start+'T12:00:00'),b=new Date(end+'T12:00:00'); if(a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()) return `${a.getDate()}–${dateLabel(end,{year:'numeric'})}`; return `${dateLabel(start)} — ${dateLabel(end,{year:'numeric'})}`; }
export function money(value, currency='RUB') { try { return formatMoney(value===''||value==null?0:value,currency); } catch { return `${esc(value)} ${esc(currency)}`; } }
export function formatBytes(value=0) { const n=Number(value); if(!Number.isFinite(n)||n<0) return '—'; if(n<1024) return `${n} Б`; if(n<1048576) return `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n/1024)} КБ`; return `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n/1048576)} МБ`; }
export const href = (tripId, page='overview', id=null, query=null) => { let p=tripId ? `#/trip/${encodeURIComponent(tripId)}/${page}` : `#/${page}`; if(id!=null) p+='/'+encodeURIComponent(id); const q=query instanceof URLSearchParams ? query.toString() : new URLSearchParams(Object.entries(query||{}).filter(([,v])=>v!==undefined&&v!==null&&v!=='')).toString(); return p+(q?'?'+q:''); };
const paths = {
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
 trips:'<rect x="4" y="6" width="16" height="15" rx="3"/><path d="M9 6V3h6v3M8 6v15M16 6v15"/>',
 packing:'<rect x="6" y="5" width="12" height="16" rx="3"/><path d="M9 5V4a3 3 0 0 1 6 0v1M9 10h6M10 15h4"/>',
 plan:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18M8 14h.01M13 14h.01"/>',
 docs:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
 money:'<circle cx="12" cy="12" r="9"/><path d="M12 6v12M15 8H10a2.5 2.5 0 0 0 0 5h3a2.5 2.5 0 0 1 0 5H8"/>',
 tasks:'<rect x="4" y="4" width="16" height="17" rx="3"/><path d="m8 12 3 3 5-6M9 2h6v4H9z"/>',
 chat:'<path d="M21 11a9 9 0 0 1-9 9H5l-3 2V11a9.5 9.5 0 0 1 19 0Z"/><path d="M7 11h.01M12 11h.01M17 11h.01"/>',
 arrow:'<path d="m14 5-7 7 7 7M7 12h14"/>', chevron:'<path d="m9 5 7 7-7 7"/>',down:'<path d="m6 9 6 6 6-6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 search:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>', user:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
 people:'<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M19 14a6 6 0 0 1 3 5v2"/>',
 location:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
 plane:'<path d="m22 2-7 20-4-9L2 9 22 2ZM11 13 22 2"/>', shirt:'<path d="m8 3-6 4 3 5 3-2v12h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0Z"/>',
 check:'<path d="m5 12 4 4L19 6"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 lock:'<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 1 1 8 0v4M12 15v3"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M9 12h6"/>',
 food:'<path d="M3 2v7a3 3 0 0 0 6 0V2M6 2v20M17 22V2c-5 4-5 11 0 11h3V2"/>',
 transfer:'<path d="M3 7h18m-5-5 5 5-5 5M21 17H3m5-5-5 5 5 5"/>',bell:'<path d="M5 17h14l-2-3V8a5 5 0 0 0-10 0v6l-2 3ZM10 21h4"/>',
 building:'<path d="M4 22V6h10v16M14 11h6v11M8 10h2M8 14h2M8 18h2M17 15h1M17 19h1"/>',settings:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
 warning:'<path d="m12 2 10 20H2L12 2ZM12 8v6M12 18h.01"/>',wifi:'<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h.01"/>',
 heart:'<path d="M20 4c-3-2-6 0-8 2C10 4 7 2 4 4c-6 6 8 17 8 17S26 10 20 4Z"/>',
 edit:'<path d="m14 5 5 5M4 20l1-6L17 2l5 5-12 12-6 1Z"/>',trash:'<path d="M3 6h18M8 6V3h8v3M5 6l1 16h12l1-16M10 10v8M14 10v8"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',moon:'<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/>',
 phone:'<path d="m5 2 4 1 1 5-3 2a14 14 0 0 0 7 7l2-3 5 1 1 4c-1 7-12 0-16-4S-2 3 5 2Z"/>',copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H3V3h13v2"/>',
 pin:'<path d="m8 3 8 0-1 6 4 4v2H5v-2l4-4-1-6ZM12 15v7"/>', globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 16 5-4 4 4 4-7 5 6"/>',send:'<path d="m22 2-7 20-4-9L2 9l20-7ZM11 13 11-4"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',refresh:'<path d="M20 7V2l-4 4a9 9 0 1 0 4 10M20 2h-5"/>',cloud:'<path d="M7 19h11a4 4 0 1 0-1-8A7 7 0 0 0 3 12a4 4 0 0 0 4 7Z"/>',
 wallet:'<path d="M3 5h17v16H3V5Zm0 0V3h14v2M20 10h-6v6h6M16 13h.01"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 6h.01"/>'
};
export const icon = (name, cls='') => `<svg class="icon ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.trips}</svg>`;
export function emptyState(title, text, actionHtml='', iconName='trips') { return `<section class="empty-state"><span class="empty-icon">${icon(iconName)}</span><h2>${esc(title)}</h2><p>${esc(text)}</p>${actionHtml}</section>`; }
