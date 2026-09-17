(function(root){
"use strict";
// Validate before changing live state. Older projects acquire defaults through
// normalize(), while malformed geometry is rejected instead of half imported.
root.validateProject=function(input){
  function fail(message){ throw new Error(message); }
  function num(v,name,min,max){
    if(typeof v!=='number'||!isFinite(v)||v<min||v>max) fail('Invalid '+name);
  }
  if(!input||typeof input!=='object'||!Array.isArray(input.layers))
    fail('Missing shapes list in this project');
  if(input.version!==undefined&&(!Number.isInteger(input.version)||input.version>9||input.version<1))
    fail('Unsupported project version');
  var d=JSON.parse(JSON.stringify(input));
  ['W','H'].forEach(function(k){ if(d[k]!==undefined) num(d[k],k,50,3000); });
  if(d.grid!==undefined) num(d.grid,'grid',1,200);
  if(d.precision!==undefined) num(d.precision,'precision',0,6);
  function color(v,name){if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v)) fail('Invalid '+name);}
  if(d.bg!==undefined) color(d.bg,'background');
  ['className','varPrefix','g2Name'].forEach(function(k){if(d[k]!==undefined&&typeof d[k]!=='string')fail('Invalid '+k);});
  if(d.editor){
    if(typeof d.editor!=='object'||Array.isArray(d.editor))fail('Invalid editor settings');
    if(d.editor.fineStep!==undefined)num(d.editor.fineStep,'fine step',1,50);
    if(d.editor.fineKey!==undefined&&['alt','ctrl','shift'].indexOf(d.editor.fineKey)<0)fail('Invalid fine key');
    if(d.editor.out!==undefined&&['frag','full'].indexOf(d.editor.out)<0)fail('Invalid output mode');
  }
  if(d.gridLook){
    if(d.gridLook.color!==undefined)color(d.gridLook.color,'grid color');
    [['opacity',0,1],['width',.1,10],['major',1,100]].forEach(function(a){if(d.gridLook[a[0]]!==undefined)num(d.gridLook[a[0]],'grid '+a[0],a[1],a[2]);});
  }
  function layers(list){
    if(!Array.isArray(list)) fail('Invalid shapes');
    list.forEach(function(l){
      if(!l||typeof l!=='object'||['path','rect','ellipse','arc','text','image'].indexOf(l.kind===undefined?'path':l.kind)<0)
        fail('Unknown shape');
      if(l.name!==undefined&&typeof l.name!=='string') fail('Invalid shape name');
      ['fillColor','fillColor2','strokeColor'].forEach(function(k){if(l[k]!==undefined)color(l[k],k);});
      ['g','tf','text','img','tex'].forEach(function(k){
        if(l[k]!==undefined&&(!l[k]||typeof l[k]!=='object'||Array.isArray(l[k]))) fail('Invalid '+k);
      });
      ['g','tf'].forEach(function(k){ Object.keys(l[k]||{}).forEach(function(p){
        if(p!=='arcType') num(l[k][p],k+'.'+p,-1e7,1e7);
      }); });
      if(l.pts!==undefined&&!Array.isArray(l.pts)) fail('Invalid points');
      (l.pts||[]).forEach(function(p,i){
        if(!p||['move','line','quad','cubic'].indexOf(p.cmd)<0||(i===0&&p.cmd!=='move')) fail('Invalid path segment');
        var keys=['x','y'];
        if(p.cmd==='quad') keys=keys.concat(['cx','cy']);
        if(p.cmd==='cubic') keys=keys.concat(['c1x','c1y','c2x','c2y']);
        keys.forEach(function(k){ num(p[k],'point '+k,-1e7,1e7); });
        if(p.outX!==undefined){ num(p.outX,'outgoing x',-1e7,1e7); num(p.outY,'outgoing y',-1e7,1e7); }
      });
      ['x','y','size'].forEach(function(k){ if(l.text&&l.text[k]!==undefined) num(l.text[k],'text '+k,k==='size'?1:-1e7,1e7); });
      ['s','family'].forEach(function(k){ if(l.text&&l.text[k]!==undefined&&typeof l.text[k]!=='string') fail('Invalid text '+k); });
      ['render','paint','wind'].forEach(function(k){
        var allowed={render:['fill','draw','both'],paint:['solid','linear','radial','texture'],wind:['nonzero','evenodd']};
        if(l[k]!==undefined&&allowed[k].indexOf(l[k])<0) fail('Invalid '+k);
      });
      if(l.g&&l.g.arcType!==undefined&&['OPEN','CHORD','PIE'].indexOf(l.g.arcType)<0) fail('Invalid arc closure');
      ['img','tex'].forEach(function(k){ if(l[k]&&l[k].src&& !/^data:image\//.test(l[k].src)) fail('Images must be embedded in the project'); });
      if(l.combine!==undefined&&['none','add','subtract','intersect','exclusiveOr'].indexOf(l.combine)<0) fail('Invalid area operation');
      ['strokeW','miter','dashPhase','gradAngle','alpha'].forEach(function(k){ if(l[k]!==undefined) num(l[k],k,-1e7,1e7); });
    });
  }
  layers(d.layers);
  if(d.lab){ layers(d.lab.shapes||[]); if(typeof d.lab.expr!=='string') fail('Invalid lab expression'); }
  if(d.image){
    if(typeof d.image.src!=='string'||!/^data:image\//.test(d.image.src)) fail('Invalid trace image');
    ['x','y','scale','alpha'].forEach(function(k){ num(d.image[k],'trace '+k,-1e7,1e7); });
    if(d.image.scale<=0) fail('Invalid trace scale');
  }
  if(d.rulers){
    if(!Array.isArray(d.rulers.list)) fail('Invalid measurements');
    d.rulers.list.forEach(function(m){
      if(!m||['span','angle','gap'].indexOf(m.kind)<0) fail('Invalid measurement');
      (m.kind==='angle'?['a','v','b']:['a','b']).forEach(function(k){
        if(!m[k]) fail('Missing measurement point');
        num(m[k].x,'measurement x',-1e7,1e7);num(m[k].y,'measurement y',-1e7,1e7);
      });
      if(m.kind==='gap') num(m.d,'gap',0,1e10);
      // Coordinates are validated recursively; older ruler records may carry
      // optional labels or source-shape names as well as point objects.
      function walk(v){
        if(typeof v==='number') num(v,'measurement',-1e10,1e10);
        else if(v&&typeof v==='object') Object.keys(v).forEach(function(k){ walk(v[k]); });
      }
      walk(m);
    });
  }
  d.active=Math.max(-1,Math.min(Number.isInteger(d.active)?d.active:0,d.layers.length-1));
  return d;
};
})(window.PathPlotter = window.PathPlotter || {});
