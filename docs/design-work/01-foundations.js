// Executed with the Figma Plugin API, not application code.
const createdNodeIds=[];
const page=figma.root.children[0];
page.name='00 · Источник и система';
await figma.setCurrentPageAsync(page);
if(page.children.length) throw new Error('Foundation page already contains nodes. Inspect before retry.');
const main=figma.createPage(); main.name='01 · Основные экраны';createdNodeIds.push(main.id);
const extra=figma.createPage();extra.name='02 · Формы и состояния';createdNodeIds.push(extra.id);
await Promise.all([{family:'Golos Text',style:'Regular'},{family:'Golos Text',style:'Medium'},{family:'Golos Text',style:'SemiBold'},{family:'Golos Text',style:'Bold'},{family:'Lora',style:'Medium'}].map(f=>figma.loadFontAsync(f)));
// Based on the installed skill's createVariableCollection helper.
async function createVariableCollection(name, modeNames) {
 const collection=figma.variables.createVariableCollection(name);const modeIds={};
 collection.renameMode(collection.modes[0].modeId,modeNames[0]);modeIds[modeNames[0]]=collection.modes[0].modeId;
 for(let i=1;i<modeNames.length;i++)modeIds[modeNames[i]]=collection.addMode(modeNames[i]);
 return {collection,modeIds};
}
const prim=await createVariableCollection('TO · Primitives',['Value']);
const semantic=await createVariableCollection('TO · Color',['Light']);
let darkMode=null,modeLimitation=null;
try {darkMode=semantic.collection.addMode('Dark');}catch(e){modeLimitation=String(e);}
const dimensions=await createVariableCollection('TO · Layout & Type',['Value']);
const cv=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255,a:1});
const palette={cream:'#FBF6EB',paper:'#FFFBF2',sand:'#F2E9D8',border:'#E5D8C2',ink:'#2E281F',muted:'#6F6455',terracotta:'#AD440C',softOrange:'#FBE6CA',green:'#316842',softGreen:'#E3EDD9',error:'#A43026',softError:'#FCE8E2',white:'#FFFFFF',darkBg:'#221F19',darkCard:'#2E2A23',darkSoft:'#3A342B',darkBorder:'#655847',darkText:'#FFF6E8',darkMuted:'#C8BCA9',darkAccent:'#F6A568',darkGreen:'#A6C89A'};
const vars={},pvars={};
for(const [n,h]of Object.entries(palette)){const v=figma.variables.createVariable(n,prim.collection,'COLOR');v.scopes=[];v.setValueForMode(prim.modeIds.Value,cv(h));v.setVariableCodeSyntax('WEB','var(--to-primitive-'+n+')');pvars[n]=v;}
const roles={bg:['cream','darkBg'],card:['paper','darkCard'],soft:['sand','darkSoft'],stroke:['border','darkBorder'],ink:['ink','darkText'],muted:['muted','darkMuted'],accent:['terracotta','darkAccent'],accentSoft:['softOrange','darkSoft'],success:['green','darkGreen'],successSoft:['softGreen','darkSoft'],danger:['error','darkAccent'],dangerSoft:['softError','darkSoft'],onAccent:['white','darkBg']};
for(const [n,[light,dark]]of Object.entries(roles)){
 const v=figma.variables.createVariable(n,semantic.collection,'COLOR');v.scopes=['ink','muted','onAccent'].includes(n)?['TEXT_FILL']:['FRAME_FILL','SHAPE_FILL','STROKE_COLOR'];
 v.setValueForMode(semantic.modeIds.Light,{type:'VARIABLE_ALIAS',id:pvars[light].id});
 if(darkMode)v.setValueForMode(darkMode,{type:'VARIABLE_ALIAS',id:pvars[dark].id});
 v.setVariableCodeSyntax('WEB','var(--'+(n==='onAccent'?'on-accent':n)+')');vars[n]=v;
}
for(const x of [0,4,8,12,16,20,24,32,48]){const v=figma.variables.createVariable('space/'+x,dimensions.collection,'FLOAT');v.scopes=['GAP'];v.setValueForMode(dimensions.modeIds.Value,x);v.setVariableCodeSyntax('WEB','var(--space-'+x+')');vars['space/'+x]=v;}
for(const x of [8,12,16,24,999]){const v=figma.variables.createVariable('radius/'+x,dimensions.collection,'FLOAT');v.scopes=['CORNER_RADIUS'];v.setValueForMode(dimensions.modeIds.Value,x);v.setVariableCodeSyntax('WEB','var(--radius-'+x+')');vars['radius/'+x]=v;}
const typeDefs=[['Brand','Lora','Medium',25,32],['Title','Golos Text','SemiBold',22,28],['Heading','Golos Text','SemiBold',18,24],['Body','Golos Text','Regular',16,23],['Label','Golos Text','Medium',15,21],['Small','Golos Text','Regular',13,18],['Caption','Golos Text','Medium',12,16]];
const styles={};
for(const [name,family,style,size,line]of typeDefs){
 const ts=figma.createTextStyle();ts.name='TO/'+name;ts.fontName={family,style};ts.fontSize=size;ts.lineHeight={unit:'PIXELS',value:line};styles[name]=ts.id;
 for(const [prop,val,scope]of [['size',size,'FONT_SIZE'],['line',line,'LINE_HEIGHT']]){const v=figma.variables.createVariable('type/'+name+'/'+prop,dimensions.collection,'FLOAT');v.scopes=[scope];v.setValueForMode(dimensions.modeIds.Value,val);v.setVariableCodeSyntax('WEB','var(--type-'+name.toLowerCase()+'-'+prop+')');vars['type/'+name+'/'+prop]=v;}
}
const family=figma.variables.createVariable('type/family',dimensions.collection,'STRING');family.scopes=['FONT_FAMILY'];family.setValueForMode(dimensions.modeIds.Value,'Golos Text');family.setVariableCodeSyntax('WEB','var(--font)');vars['type/family']=family;
const shadow=figma.createEffectStyle();shadow.name='TO/Soft card';shadow.effects=[{type:'DROP_SHADOW',color:{r:.32,g:.22,b:.08,a:.065},offset:{x:0,y:2},radius:6,spread:0,visible:true,blendMode:'NORMAL'}];
const paint=key=>figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',vars[key]);
function textNode(label,style='Body',color='ink'){const t=figma.createText();createdNodeIds.push(t.id);t.name=label;t.textStyleId=styles[style];t.characters=label;t.fills=[paint(color)];return t;}
const intro=figma.createAutoLayout('VERTICAL');createdNodeIds.push(intro.id);intro.name='О системе · прочитать сначала';intro.x=80;intro.y=80;intro.resize(1448,100);intro.itemSpacing=12;intro.fills=[];intro.primaryAxisSizingMode='AUTO';
intro.appendChild(textNode('TravelOrganizer — PWA Design System','Brand'));
intro.appendChild(textNode('Единственный визуальный источник — утверждённый владельцем референс. Восемь экранов и общие компоненты доступны на соседних страницах.','Body'));
intro.appendChild(textNode('Макеты заполнены синтетическими данными. Совместная работа, вход и push требуют настоящего сервера. Сначала согласование Figma, затем код PWA.','Small','muted'));
const ref=figma.createRectangle();createdNodeIds.push(ref.id);ref.name='SOURCE · approved-travel-reference.png · неизменённый оригинал';ref.resize(1448,1086);ref.x=80;ref.y=240;ref.fills=[paint('soft')];
const tokens=figma.createAutoLayout('VERTICAL');createdNodeIds.push(tokens.id);tokens.name='Foundations · цвет, типографика и размеры';tokens.x=80;tokens.y=1400;tokens.resize(680,100);tokens.paddingTop=24;tokens.paddingBottom=24;tokens.paddingLeft=24;tokens.paddingRight=24;tokens.itemSpacing=16;tokens.primaryAxisSizingMode='AUTO';tokens.fills=[paint('card')];tokens.cornerRadius=16;
tokens.appendChild(textNode('Тёплые поверхности. Чёткая иерархия.','Heading'));
for(const [key,label]of [['bg','Основа · крем'],['card','Карточка · сливочный'],['accent','Действие · терракота'],['success','Готовность · зелёный'],['ink','Текст · тёплый тёмный']]){const row=figma.createAutoLayout('HORIZONTAL');createdNodeIds.push(row.id);row.fills=[];row.itemSpacing=12;row.counterAxisAlignItems='CENTER';const sw=figma.createRectangle();createdNodeIds.push(sw.id);sw.resize(48,48);sw.cornerRadius=12;sw.fills=[paint(key)];row.appendChild(sw);row.appendChild(textNode(label,'Label'));tokens.appendChild(row);}
tokens.appendChild(textNode('Рабочий текст 16 / 23 · подписи 13 / 18','Body'));
tokens.appendChild(textNode('Шаги: 4, 8, 12, 16, 20, 24, 32, 48 · радиусы: 8, 12, 16, 24','Small','muted'));
tokens.appendChild(textNode('Сборы: Ещё нет → Дома → Упаковано. Отдельного флага «готово» нет.','Small','muted'));
return {createdNodeIds,mutatedNodeIds:[page.id],pages:{system:page.id,main:main.id,extra:extra.id},referenceId:ref.id,collections:{primitive:prim.collection.id,color:semantic.collection.id,layout:dimensions.collection.id},modes:{light:semantic.modeIds.Light,dark:darkMode},modeLimitation,variables:Object.fromEntries(Object.entries(vars).map(([k,v])=>[k,v.id])),styles,shadow:shadow.id,tokenCount:Object.keys(vars).length+Object.keys(pvars).length};
