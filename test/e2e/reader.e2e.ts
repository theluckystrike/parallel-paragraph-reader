import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { pluginId, reloadPlugin } from './load';
interface V { contentEl:HTMLElement; selected:number; reload():Promise<void>; saveAlignment(map:[number|null,number|null][]):Promise<boolean>;selectRow(n:number):Promise<void>; }
interface P {openPair(l:string,r:string):Promise<void>;views:Set<V>;pro:{opts:{http:unknown};signOut():void;refreshNow():Promise<void>};}
async function setPro(on:boolean):Promise<void>{
 await browser.executeObsidian(async({app},id,on)=>{
  const p=(app as unknown as {plugins:{plugins:Record<string,P>}}).plugins.plugins[id]!;
  if(!on){p.pro.signOut();return;}
  p.pro.opts.http=async()=>({status:200,json:{data:{viewer:{login:'demo-reader'},user:{sponsorshipForViewerAsSponsor:{isActive:true,isOneTimePayment:false,tier:{name:'$5 a month',monthlyPriceInCents:500}}}}}});
  app.secretStorage.setSecret(id+'-github-token','gho_'+'0'.repeat(36));await p.pro.refreshNow();
 },pluginId,on);
}
async function open(l='Samples/English.md',r='Samples/French.md'):Promise<void>{
 await browser.executeObsidian(async({app},id,l,r)=>{await (app as unknown as {plugins:{plugins:Record<string,P>}}).plugins.plugins[id]!.openPair(l,r);},pluginId,l,r);
 await browser.waitUntil(async()=>browser.execute(()=>!!document.querySelector('.workspace-leaf.mod-active .ppr-rows')),{timeout:10000,timeoutMsg:'Reader is not active'});
}
async function snapshot(){return browser.execute(()=>{
 const el=document.querySelector<HTMLElement>('.workspace-leaf.mod-active .ppr')!;
 const rows=Array.from(el.querySelectorAll('.ppr-row')).map(r=>{
  const l=r.querySelector<HTMLElement>('.ppr-left')!,t=r.querySelector<HTMLElement>('.ppr-right')!;
  return {left:l.querySelector('.ppr-text')?.textContent??null,right:t.querySelector('.ppr-text')?.textContent??null,lh:l.getBoundingClientRect().height,rh:t.getBoundingClientRect().height,ly:l.getBoundingClientRect().top,ry:t.getBoundingClientRect().top,bottom:Math.max(l.getBoundingClientRect().bottom,t.getBoundingClientRect().bottom),top:r.getBoundingClientRect().top};
 });
 return {rows,message:el.querySelector('.ppr-message')?.textContent??'',images:el.querySelectorAll('img,iframe,script').length,stacked:el.classList.contains('ppr-stacked'),width:el.clientWidth,outerWidth:Math.round(el.getBoundingClientRect().width),scroll:el.scrollWidth};
});}
before(async()=>{
 await browser.executeObsidian(({app})=>{app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();});
 expect((await reloadPlugin(pluginId)).errors).toEqual([]);await setPro(false);
});
after(async()=>{await setPro(false);});
describe('reading rows',()=>{
 it('chooses two notes from the command pickers',async()=>{
  await browser.executeObsidianCommand(pluginId+':choose-notes');const input=await browser.$('.prompt-input');await input.waitForDisplayed();await input.setValue('Samples/English.md');
  await browser.waitUntil(async()=>(await browser.$('.suggestion-item.is-selected').getText()).includes('Samples/English.md'),{timeout:10000});await browser.keys('Enter');
  await browser.waitUntil(async()=>(await browser.$('.prompt-input').getAttribute('placeholder'))==='Choose the right note',{timeout:10000});await browser.$('.prompt-input').setValue('Samples/French.md');
  await browser.waitUntil(async()=>(await browser.$('.suggestion-item.is-selected').getText()).includes('Samples/French.md'),{timeout:10000});await browser.keys('Enter');
  await browser.waitUntil(async()=>(await browser.execute(()=>document.querySelector('.workspace-leaf.mod-active .ppr-paths')?.textContent??'')).includes('French.md'),{timeout:10000});expect((await snapshot()).rows).toHaveLength(4);
 });
 it('pairs by order with equal cell heights and an extra empty cell',async()=>{
  await open();const s=await snapshot();expect(s.rows).toHaveLength(4);expect(s.rows[0]!.left).toContain('morning ferry');expect(s.rows[0]!.right).toContain('bateau du matin');expect(s.rows[3]!.right).toBeNull();
  for(const r of s.rows)expect(Math.abs(r.lh-r.rh)).toBeLessThan(1);expect(s.rows[2]!.top).toBeGreaterThanOrEqual(s.rows[1]!.bottom);
 });
 it('stacks at 360 pixels without horizontal overflow',async()=>{
  await open();await browser.execute(()=>{const el=document.querySelector<HTMLElement>('.workspace-leaf.mod-active .ppr')!;el.style.width='360px';el.style.maxWidth='360px';});
  await browser.waitUntil(async()=>(await snapshot()).stacked,{timeout:10000});const s=await snapshot();expect(s.outerWidth).toBe(360);expect(s.scroll).toBeLessThanOrEqual(s.width);for(const r of s.rows)expect(r.ry).toBeGreaterThan(r.ly);
 });
 it('detects Arabic and English directions in separate cells',async()=>{
  await open('Samples/Arabic.md','Samples/English.md');expect(await browser.execute(()=>Array.from(document.querySelectorAll('.workspace-leaf.mod-active .ppr-row:first-child .ppr-text')).map(e=>getComputedStyle(e).direction))).toEqual(['rtl','ltr']);expect((await snapshot()).rows[0]!.left).toContain('يغادر');
 });
 it('excludes YAML and fences while HTML remains inert text',async()=>{
  await open('Samples/Literal.md','Samples/French.md');const s=await snapshot();expect(s.rows[0]!.left).toContain('<img src="https://example.com/x">');expect(s.rows[0]!.left).not.toContain('hidden');expect(s.images).toBe(0);expect(s.rows[1]!.left).toContain('[the sample]');
  expect(await browser.execute(()=>performance.getEntriesByType('resource').filter(e=>e.name.startsWith('https://example.com/')).length)).toBe(0);
 });
 it('opens row two at its editor line and leaves source text unchanged',async()=>{
  await open();const before=await obsidianPage.read('Samples/English.md');await browser.$('.workspace-leaf.mod-active .ppr-row[data-row="1"] .ppr-left button').click();
  const line=before.split('\n').findIndex(s=>s.startsWith('She writes'));
  await browser.waitUntil(async()=>browser.executeObsidian(({app,obsidian},line)=>app.workspace.getActiveFile()?.path==='Samples/English.md'&&app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.editor.getCursor().line===line,line),{timeout:10000,timeoutMsg:'Left cursor did not reach its paragraph'});
  expect(await obsidianPage.read('Samples/English.md')).toBe(before);
 });
 it('opens the right source paragraph without edits',async()=>{
  await open();const before=await obsidianPage.read('Samples/French.md');await browser.$('.workspace-leaf.mod-active .ppr-row[data-row="1"] .ppr-right button').click();
  const line=before.split('\n').findIndex(s=>s.startsWith('Elle note'));
  await browser.waitUntil(async()=>browser.executeObsidian(({app,obsidian},line)=>app.workspace.getActiveFile()?.path==='Samples/French.md'&&app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.editor.getCursor().line===line,line),{timeout:10000,timeoutMsg:'Right cursor did not reach its paragraph'});
  expect(await obsidianPage.read('Samples/French.md')).toBe(before);
 });
 it('refuses over 100 blocks on either side without edits',async()=>{
  const text=Array.from({length:101},(_,i)=>'Paragraph '+i).join('\n\n');await obsidianPage.write('Limit.md',text);
  for(const [l,r] of [['Limit.md','Samples/French.md'],['Samples/English.md','Limit.md']]){await open(l,r);const s=await snapshot();expect(s.rows).toHaveLength(0);expect(s.message).toContain('Size limit');}
  expect(await obsidianPage.read('Limit.md')).toBe(text);
 });
});
describe('Pro guards and local saved pairs',()=>{
 it('free mode refuses map saving and retains order',async()=>{
  await setPro(false);await open();const saved=await browser.executeObsidian(async({app},id)=>{const p=(app as unknown as {plugins:{plugins:Record<string,P>}}).plugins.plugins[id]!;return [...p.views].pop()!.saveAlignment([[0,0],[1,null],[2,1],[3,2]]);},pluginId);expect(saved).toBe(false);expect((await snapshot()).rows[1]!.right).toContain('trois oiseaux');
 });
 it('saves a map and row and restores them after plugin reload',async()=>{
  await setPro(true);await open();const saved=await browser.executeObsidian(async({app},id)=>{const p=(app as unknown as {plugins:{plugins:Record<string,P>}}).plugins.plugins[id]!;const v=[...p.views].pop()!;const result=await v.saveAlignment([[0,0],[1,null],[2,1],[3,2]]);await v.selectRow(2);return result;},pluginId);expect(saved).toBe(true);expect((await snapshot()).rows[1]!.right).toBeNull();
  expect((await reloadPlugin(pluginId)).errors).toEqual([]);await setPro(true);await open();expect(await browser.execute(()=>document.querySelector('.workspace-leaf.mod-active .ppr-selected')?.getAttribute('data-row'))).toBe('2');expect((await snapshot()).rows[1]!.right).toBeNull();
 });
 it('free mode ignores the Pro saved pair',async()=>{
  await setPro(false);await open();expect((await snapshot()).rows[1]!.right).toContain('trois oiseaux');expect(await browser.execute(()=>document.querySelector('.workspace-leaf.mod-active .ppr-selected')?.getAttribute('data-row'))).toBe('0');
 });
 it('changed prose invalidates the saved map and row',async()=>{
  const original=await obsidianPage.read('Samples/English.md');try{await obsidianPage.write('Samples/English.md',original.replace('morning ferry','evening ferry'));await setPro(true);await open();expect((await snapshot()).message).toContain('prose changed');expect((await snapshot()).rows[1]!.right).not.toBeNull();}finally{await obsidianPage.write('Samples/English.md',original);}
 });
});
