import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEditor } from './helpers/editor.mjs';

const e=createEditor();
test('older projects validate without mutation and partial shape defaults survive',()=>{
  const project=JSON.parse(readFileSync(new URL('../examples/curves-and-cutout.json',import.meta.url),'utf8'));
  const original=JSON.stringify(project),loaded=e.api.validateProject(project);
  assert.equal(JSON.stringify(project),original);assert(loaded.layers.length);
  const layer=e.model.normalize({kind:'rect',g:{x:20},tf:{rot:15}});
  assert.equal(layer.g.w,160);assert.equal(layer.tf.sx,1);
});
test('invalid imports are rejected before live state can change',()=>{
  for(const project of [
    {layers:[{kind:'path',pts:[{cmd:'line',x:0,y:1}]}]},
    {layers:[{kind:'rect',g:{x:'broken'}}]},
    {layers:[{kind:'text',text:{s:42}}]},
    {layers:[{kind:'rect'}],rulers:{list:[{kind:'span'}]}},
    {version:100,layers:[{kind:'rect'}]},
    {layers:[{kind:'image',img:{src:'https://example.com/image.png'}}]}
  ]) assert.throws(()=>e.api.validateProject(project));
});
function storage(quota=Infinity){
  const data=new Map();return {getItem:k=>data.get(k)||null,removeItem:k=>data.delete(k),
    setItem(k,v){if(v.length>quota)throw Error('Quota exceeded');data.set(k,v);}};
}
test('storage fallback preserves images when possible and reports quota loss',async()=>{
  const project={version:9,layers:[{kind:'image',img:{src:'data:image/png;base64,'+'a'.repeat(1000)}}],trimmed:false};
  const full=e.api.createSessionStore({local:storage(),indexedDB:null});
  assert.equal((await full.save(project)).state,'saved');
  assert.equal((await full.read()).layers[0].img.src,project.layers[0].img.src);
  const limited=e.api.createSessionStore({local:storage(500),indexedDB:null});
  assert.equal((await limited.save(project)).state,'partial');
  const recovered=await limited.read();assert.equal(recovered.trimmed,true);assert.equal(recovered.layers[0].img.src,'');
  assert.equal((await limited.save(recovered)).state,'partial');
  const blocked=e.api.createSessionStore({local:storage(0),indexedDB:null});
  assert.equal((await blocked.save(project)).state,'error');
});
test('clearing storage cancels pending writes and leaves no restored project',async()=>{
  const store=e.api.createSessionStore({local:storage(),indexedDB:null});
  const saving=store.save({layers:[{kind:'rect'}]});
  await store.clear();await saving;assert.equal(await store.read(),null);
});
test('corrupt legacy recovery stays available and reports a failure',async()=>{
  const local=storage();local.setItem('pathPlotter/session@1','{broken');
  const store=e.api.createSessionStore({local,indexedDB:null});
  await assert.rejects(store.read(),/damaged/);
  assert.equal(local.getItem('pathPlotter/session@1'),'{broken');
});
test('complete project snapshots undo import settings alongside geometry',()=>{
  const ed=createEditor({layers:[{kind:'rect',g:{x:5}}]});let extra={bg:'#fff',className:'Before'};
  const h=ed.api.createHistory({state:ed.state,normalize:ed.model.normalize,toast(){},onRestore(){},
    getProject:()=>extra,restoreProject:d=>{extra=d;}});
  h.push();ed.state.layers[0].g.x=99;extra={bg:'#000',className:'After'};
  h.undo();assert.equal(extra.className,'Before');assert.equal(ed.state.layers[0].g.x,5);
  h.redo();assert.equal(extra.className,'After');assert.equal(ed.state.layers[0].g.x,99);
});
