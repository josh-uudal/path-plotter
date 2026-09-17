import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from './helpers/editor.mjs';

test('held arrows undo as one gesture, new gestures redo and persist', () => {
  const e=createEditor({layers:[{kind:'rect',g:{x:20,y:30,w:90,h:80}}]});
  const h=e.api.createHistory({state:e.state,normalize:e.model.normalize,toast(){},onRestore(){}});
  let saves=0;
  const actions=e.api.createEditActions({state:e.state,push:h.push,pathEditing:e.api.pathEditing,
    shiftSelection(dx,dy){e.state.selLayers.forEach(i=>{e.state.layers[i].g.x+=dx;e.state.layers[i].g.y+=dy;});},
    changed(){saves++;}});
  actions.nudge('arrowright',1,false);actions.nudge('arrowright',1,true);actions.nudge('arrowright',1,true);
  assert.equal(e.state.layers[0].g.x,23);assert.equal(h.past.length,1);assert.equal(saves,3);
  actions.endNudge();h.undo();assert.equal(e.state.layers[0].g.x,20);
  h.redo();assert.equal(e.state.layers[0].g.x,23);
  actions.nudge('arrowup',10,false);assert.equal(e.state.layers[0].g.y,20);
  h.undo();assert.equal(e.state.layers[0].g.y,30);
});

test('pen curves retain tangents when continuing and moving a smooth anchor', () => {
  const e=createEditor({layers:[{kind:'path'}]});const l=e.state.layers[0],p=e.api.pathEditing;
  p.append(l,10,20);p.pull(l,0,40,20);
  p.append(l,100,100);p.pull(l,1,130,100);
  p.append(l,200,20);
  assert.equal(l.pts[1].c1x,40);assert.equal(l.pts[1].c2x,70);assert.equal(l.pts[2].c1x,130);
  p.setPoint(l,{i:1,key:'a'},110,110);
  assert.equal(l.pts[1].c2x,80);assert.equal(l.pts[2].c1x,140);
  p.setPoint(l,{i:1,key:'c2'},110,80);
  assert.equal(l.pts[2].c1x,110);assert.equal(l.pts[2].c1y,140);
  p.nodeMode(l,1,false);p.setPoint(l,{i:1,key:'c2'},80,110);
  assert.equal(l.pts[2].c1x,110);assert.equal(l.pts[2].c1y,140);
});

test('quadratic to cubic conversion preserves points along the segment', () => {
  const e=createEditor({layers:[{kind:'path',pts:[{cmd:'move',x:0,y:0},{cmd:'quad',x:90,y:0,cx:40,cy:60}]}]});
  const l=e.state.layers[0],before=structuredClone(l.pts[1]);
  e.api.pathEditing.segment(l,1,'cubic');
  for(const t of [0,.2,.5,.9,1]){
    const a=e.geometry.segPoint(l.pts[0],before,t),b=e.geometry.segPoint(l.pts[0],l.pts[1],t);
    assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-9);
  }
  e.api.pathEditing.segment(l,1,'line');assert.equal(l.pts[1].cmd,'line');
  assert.equal(l.pts[1].c1x,undefined);
});

test('point nudge moves linked handles and restores the point selection on undo', () => {
  const e=createEditor({layers:[{kind:'path',pts:[{cmd:'move',x:10,y:20},{cmd:'cubic',x:100,y:100,c1x:40,c1y:20,c2x:70,c2y:100}]}]});
  e.state.sel={i:0,key:'a'};
  const h=e.api.createHistory({state:e.state,normalize:e.model.normalize,toast(){},onRestore(){}});
  const a=e.api.createEditActions({state:e.state,push:h.push,pathEditing:e.api.pathEditing,changed(){},shiftSelection(){throw Error('Wrong branch');}});
  a.nudge('arrowright',10,false);assert.equal(e.state.layers[0].pts[1].c1x,50);
  h.undo();assert.equal(e.state.layers[0].pts[1].c1x,40);assert.equal(e.state.sel.i,0);
});

test('object snapping beats grid, excludes dragged shapes, and respects bypass', () => {
  const e=createEditor({layers:[{name:'target',kind:'rect'},{name:'moving',kind:'rect'}]});
  const S=e.state;S.view.z=2;S.grid=25;
  const snap=e.api.createDrawingSnap({state:S,grid:v=>S.fine?Math.round(v):Math.round(v/25)*25,
    points:l=>[{x:l.name==='target'?103.5:106,y:80,kind:'endpoint',of:l.name}]});
  assert.equal(snap.resolve(106,81,[1],false).x,103.5);
  assert.equal(snap.resolve(106,81,[0,1],false).target,null);
  S.fine=true;assert.equal(snap.resolve(106,81,[],false).x,106);
  S.fine=false;S.snap=false;assert.equal(snap.resolve(106,81,[],false).target,null);
});

test('code mapping links path commands and class fields across output modes', () => {
  for(const buildOnce of [false,true]) for(const out of ['frag','full']){
    const e=createEditor({out,layers:[{kind:'path',name:'outline',pts:[{cmd:'move',x:0,y:0},{cmd:'line',x:30,y:40}]}]},{buildOnce});
    const text=e.java.outputText(),lines=e.api.codeOutput.mapLines(text,e.java.sourceMap(),e.state.layers);
    assert.equal(lines.find(l=>l.text.includes('.lineTo(')).point,1);
    assert.equal(lines.find(l=>l.text.includes('.moveTo(')).layers[0],0);
    assert.equal(lines.find(l=>l.text.includes('GeneralPath outline')).layers[0],0);
  }
});
