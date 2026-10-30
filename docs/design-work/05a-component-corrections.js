// Apply after edit access returns. This has not yet been executed in Figma.
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(S.pages.system));
for(const state of ['missing','home']){
 const c=comps['ItemRow/'+state];const marker=c.children[0];
 marker.name='Индикатор состояния · '+state+' · не чекбокс';round(marker,999);
 for(const child of [...marker.children]){mutatedNodeIds.push(child.id);child.remove();}
 marker.primaryAxisAlignItems='CENTER';marker.counterAxisAlignItems='CENTER';
 add(marker,tx(state==='missing'?'–':'Д','Caption',state==='missing'?'muted':'success'));
 c.description='One of three item states. The leading circle is a status indicator, not an independent completed flag. Tap row for details or use state menu.';
 mutatedNodeIds.push(c.id,marker.id);
}
const checked=comps['Checkbox/True'];const tickBox=checked.children[0];for(const ch of [...tickBox.children]){mutatedNodeIds.push(ch.id);ch.remove();}add(tickBox,tx('✓','Label','onAccent'));tickBox.primaryAxisAlignItems='CENTER';tickBox.counterAxisAlignItems='CENTER';mutatedNodeIds.push(checked.id,tickBox.id);
const doc=comps.DocumentRow;const col=doc.children.find(n=>n.type==='FRAME'&&n.width===258);const status=col.children.find(n=>n.type==='TEXT'&&n.name==='Status');
if(!status)throw new Error('Expected the existing Status text layer; inspect before continuing.');
const strip=box(258,18,'HORIZONTAL',null,0,8);strip.name='Отдельные признаки · аудитория и копия';add(col,strip);add(strip,status);status.characters='Только мне';status.fills=[paint('muted')];status.name='Аудитория';
const copy=tx('На устройстве','Caption','success');copy.name='Локальная копия';add(strip,copy);const key=doc.addComponentProperty('LocalCopy','TEXT','На устройстве');copy.componentPropertyReferences={characters:key};
doc.description='Record, audience, local Blob, and pinned state are separate. Status text is the audience label only; LocalCopy is a separate property. No server rights are implied.';
mutatedNodeIds.push(doc.id,col.id,status.id);
return {createdNodeIds,mutatedNodeIds,documentCopyProperty:key,corrections:['Item states use circular indicators, not independent checkboxes','Task completion has a visible checked variant','Document audience and local-copy labels are independent editable properties']};
