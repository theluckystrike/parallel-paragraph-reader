import { afterEach, expect, it, vi } from 'vitest';
import { ReaderView } from '../src/view';
import { bindPro, resetPro } from '../src/pro';
import { pairKey } from '../src/reader';
afterEach(resetPro);

function view(files:Record<string,string>){
 const v=Object.create(ReaderView.prototype) as ReaderView;
 const saveSettings=vi.fn(async()=>{});
 const reader={settings:{pairs:{}},views:new Set(),saveSettings,chooseNotes:vi.fn()};
 Object.assign(v,{left:'C# ^1.md',right:'b.md',contentEl:createDiv(),generation:0,closed:false,selected:0,map:[],rows:[],leftBlocks:[],rightBlocks:[],reader,
  app:{vault:{getFileByPath:(path:string)=>path in files?{path,extension:'md'}:null,cachedRead:async(f:{path:string})=>files[f.path]}}});
 return {v,reader,saveSettings};
}
it('shows HTML as inert text and retains source cells',async()=>{
 const {v}=view({'C# ^1.md':'<img src="https://example.com/x">\n\nB','b.md':'X'});await v.reload();
 expect(v.contentEl.querySelector('img')).toBeNull();expect(v.contentEl.querySelector('.ppr-text')?.textContent).toContain('<img');
 expect(v.rows[1]?.right).toBeNull();expect(v.contentEl.querySelector('.ppr-empty')?.textContent).toBe('No paragraph');
});
it('free mode neither saves maps nor remembers a row',async()=>{
 const {v,saveSettings}=view({'C# ^1.md':'A\n\nB','b.md':'X'});await v.reload();await v.selectRow(1);expect(saveSettings).not.toHaveBeenCalled();
 expect(await v.saveAlignment([[0,0],[1,null]])).toBe(false);expect(saveSettings).not.toHaveBeenCalled();
});
it('Pro saves local data and invalidates it after a prose edit',async()=>{
 bindPro({isPro:()=>true,onChange:()=>()=>{}} as never);
 const files={'C# ^1.md':'A\n\nB','b.md':'X'};const {v,reader,saveSettings}=view(files);await v.reload();
 expect(await v.saveAlignment([[0,null],[1,0]])).toBe(true);await v.selectRow(1);expect(saveSettings).toHaveBeenCalled();
 expect(reader.settings.pairs).toHaveProperty(pairKey(v.left,v.right));
 await v.reload();expect(v.selected).toBe(1);expect(v.rows[0]?.right).toBeNull();
 files['C# ^1.md']='Changed\n\nB';await v.reload();expect(v.selected).toBe(0);expect(v.rows[0]?.right?.text).toBe('X');
 expect(v.contentEl.querySelector('.ppr-message')?.textContent).toContain('prose changed');
});
it('a missing source gives a message without a file operation',async()=>{
 const {v}=view({'b.md':'X'});await v.reload();expect(v.rows).toEqual([]);expect(v.contentEl.textContent).toContain('moved or deleted');
});
it('a read error gives a useful message',async()=>{
 const {v}=view({'C# ^1.md':'A','b.md':'X'});
 v.app.vault.cachedRead=async()=>{throw new Error('read denied');};await v.reload();expect(v.contentEl.textContent).toContain('read denied');
});
it('a failed local save returns failure so the map dialog stays open',async()=>{
 bindPro({isPro:()=>true,onChange:()=>()=>{}} as never);
 const {v,saveSettings}=view({'C# ^1.md':'A\n\nB','b.md':'X'});await v.reload();
 saveSettings.mockRejectedValueOnce(new Error('disk full'));
 expect(await v.saveAlignment([[0,null],[1,0]])).toBe(false);
 expect(saveSettings).toHaveBeenCalledOnce();
});
it('a closed view ignores a pending read',async()=>{
 const {v}=view({'C# ^1.md':'A','b.md':'X'});
 let resolve!:(text:string)=>void;const deferred=new Promise<string>(r=>{resolve=r;});v.app.vault.cachedRead=()=>deferred;
 const pending=v.reload();await v.onClose();resolve('A');await pending;expect(v.contentEl.childElementCount).toBe(0);
});
