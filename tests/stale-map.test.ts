import { afterEach, expect, it, vi } from 'vitest';
import { ReaderView } from '../src/view';
import { bindPro, resetPro } from '../src/pro';
import { pairKey } from '../src/reader';
afterEach(resetPro);

function view(files:Record<string,string>){
 const v=Object.create(ReaderView.prototype) as ReaderView;
 const saveSettings=vi.fn(async()=>{});
 const reader={settings:{pairs:{}},views:new Set(),saveSettings,chooseNotes:vi.fn()};
 Object.assign(v,{left:'a.md',right:'b.md',contentEl:createDiv(),generation:0,closed:false,selected:0,map:[],rows:[],leftBlocks:[],rightBlocks:[],reader,
  app:{vault:{getFileByPath:(path:string)=>path in files?{path,extension:'md'}:null,cachedRead:async(f:{path:string})=>files[f.path]}}});
 return {v,reader};
}
it('a row click after a prose edit keeps the saved manual map',async()=>{
 bindPro({isPro:()=>true,onChange:()=>()=>{}} as never);
 const files={'a.md':'A\n\nB','b.md':'X'};const {v,reader}=view(files);await v.reload();
 expect(await v.saveAlignment([[0,null],[1,0]])).toBe(true);
 files['a.md']='A typo fix\n\nB';await v.reload();
 await v.selectRow(1);
 const saved=(reader.settings.pairs as Record<string,{map:unknown}>)[pairKey('a.md','b.md')];
 expect(saved?.map).toEqual([[0,null],[1,0]]);
 expect(v.editText()).toBe('1,-\n2,1');
});
it('a row click after a prose edit saves the row when no manual map exists',async()=>{
 bindPro({isPro:()=>true,onChange:()=>()=>{}} as never);
 const files={'a.md':'A\n\nB','b.md':'X'};const {v,reader}=view(files);await v.reload();
 await v.selectRow(1);
 files['a.md']='A typo fix\n\nB';await v.reload();
 await v.selectRow(1);await v.reload();expect(v.selected).toBe(1);
 expect(v.editText()).toBe('1,1\n2,-');
 expect(Object.keys(reader.settings.pairs)).toHaveLength(1);
});
