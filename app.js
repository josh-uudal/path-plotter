
(function(){
"use strict";

var GUT=34, K=0.5522847498307936;   // ruler gutter; circle-to-bezier constant
var board=document.getElementById('board'), ctx=board.getContext('2d');
var stage=document.getElementById('stage');
var PALETTE=['#2f6f8f','#b02f4c','#4f7a3a','#8a5cc4','#c26a1f','#1f7a72'];
var VW=0,VH=0;
var off=document.createElement('canvas'), offc=off.getContext('2d');
// identity-transform context used only for point-in-path classification
var hitCv=document.createElement('canvas'), hitCtx=hitCv.getContext('2d');

var S={
  W:600,H:450,grid:25,snap:true,showGrid:true,labels:true,aa:true,
  gridColor:'#c3cdc1',gridOpacity:1,gridWidth:1,gridMajor:4,gridStyle:'lines',solidView:false,
  tool:'line', out:'frag',
  view:{z:1,x:0,y:0},
  layers:[],active:0,selLayers:[0],
  sel:null,drag:null,hover:null,nextIsMove:false,
  panDrag:null,imgDrag:null,newDrag:null,moveDrag:null,rotDrag:null,marquee:null,
  scaleDrag:null,scaleMode:'geom',scaleEach:false,scaleLock:true,
  bg:'#ffffff',bgSet:true,varPrefix:'',g2Name:'g2',precision:2,
  fine:false,constrain:false,scaleMod:false,fineStep:1,fineKey:'alt',rotEach:false,
  img:null,imgTop:false,imgLock:false,
  measures:[],measMode:'span',measSel:-1,measShow:true,measGapFrom:-1,
  measSnaps:['endpoint','midpoint','centre','quadrant','intersection','grid'],
  measDraft:null,measDrag:null,measHover:null
};
var HIST=[],FUT=[];
var GID=0;

function L(){ return S.layers[S.active]; }

function defaults(name,kind){
  var c=PALETTE[S.layers.length%PALETTE.length];
  return {name:name,kind:kind||'path',visible:true,group:null,
    pts:[], g:{x:60,y:60,w:160,h:120,rx:0,ry:0,start:0,extent:270,arcType:'PIE'},
    text:{s:'Hello',x:80,y:120,family:'SansSerif',size:32,bold:false,italic:false},
    img:{src:'',name:''},
    tex:{src:'',name:'',x:0,y:0,w:64,h:64},
    render:'draw',paint:'solid',
    fillColor:c,fillColor2:'#ffffff',gradAngle:0,alpha:1,
    strokeColor:c,strokeW:2,
    cap:'square',join:'miter',miter:10,dash:'',dashPhase:0,
    closed:true,wind:'nonzero',shapeClass:'GeneralPath',combine:'none',isClip:false,clipped:false,collapsed:false,
    tf:{rot:0,sx:1,sy:1,shx:0,shy:0}};
}
var CAPS={butt:1,round:1,square:1}, JOINS={miter:1,round:1,bevel:1};
var SHAPECLASS={'GeneralPath':1,'Path2D.Double':1,'Path2D.Float':1,'Polygon':1};
// java.awt.Polygon is one closed run of straight int-coordinate edges, nothing else
function polygonal(l){
  if(!l||l.kind!=='path'||!l.pts||l.pts.length<3) return false;
  for(var i=0;i<l.pts.length;i++){
    var c=l.pts[i].cmd;
    if(i===0){ if(c!=='move') return false; continue; }
    if(c!=='line') return false;
  }
  return true;
}
function normalize(l){
  var d=defaults(l.name||'path',l.kind||'path');
  var o=Object.assign(d,l);
  o.g=Object.assign(d.g,l.g||{});
  o.text=Object.assign(d.text,l.text||{});
  o.img=Object.assign(d.img,l.img||{});
  o.tex=Object.assign(d.tex,l.tex||{});
  o.tf=Object.assign(d.tf,l.tf||{});
  o.pts=l.pts||[];
  o.group=l.group||null;
  if(!CAPS[o.cap]) o.cap='square';
  if(!JOINS[o.join]) o.join='miter';
  o.miter=Math.max(1,parseFloat(o.miter)||10);
  o.dash=typeof o.dash==='string'?o.dash:'';
  o.dashPhase=parseFloat(o.dashPhase)||0;
  if(!SHAPECLASS[o.shapeClass]) o.shapeClass='GeneralPath';
  // Polygon has no winding rule and always closes, so keep the model honest
  if(o.shapeClass==='Polygon'&&!polygonal(o)) o.shapeClass='GeneralPath';
  if(o.shapeClass==='Polygon') o.closed=true;
  if(o.group){ var n=parseInt(String(o.group).slice(1),10); if(n>GID) GID=n; }
  return o;
}

/* ================= selection & groups ================= */

function normSel(){
  S.selLayers=(S.selLayers||[]).filter(function(i){ return i>=0&&i<S.layers.length; });
  if(!S.selLayers.length) S.selLayers=[S.active];
  if(S.selLayers.indexOf(S.active)<0) S.selLayers=[S.active];
}
function groupIdxs(gid){
  var a=[];
  if(!gid) return a;
  S.layers.forEach(function(l,i){ if(l.group===gid) a.push(i); });
  return a;
}
function expandSel(idxs){
  var out=[];
  idxs.forEach(function(i){
    var l=S.layers[i]; if(!l) return;
    if(l.group) groupIdxs(l.group).forEach(function(j){ if(out.indexOf(j)<0) out.push(j); });
    else if(out.indexOf(i)<0) out.push(i);
  });
  return out.sort(function(a,b){ return a-b; });
}
function setSel(idxs,active){
  S.selLayers=expandSel(idxs);
  if(!S.selLayers.length) S.selLayers=[0];
  var a=(active===undefined)?idxs[idxs.length-1]:active;
  S.active=(S.selLayers.indexOf(a)>=0)?a:S.selLayers[0];
}
function toggleSel(i){
  var grp=expandSel([i]);
  if(S.selLayers.indexOf(i)>=0){
    S.selLayers=S.selLayers.filter(function(j){ return grp.indexOf(j)<0; });
    if(!S.selLayers.length) S.selLayers=[i];
    if(S.selLayers.indexOf(S.active)<0) S.active=S.selLayers[0];
  } else {
    grp.forEach(function(j){ if(S.selLayers.indexOf(j)<0) S.selLayers.push(j); });
    S.selLayers.sort(function(a,b){ return a-b; });
    S.active=i;
  }
}
function selObjs(){
  var a=[];
  S.selLayers.forEach(function(i){ if(S.layers[i]) a.push(S.layers[i]); });
  return a;
}
function groupColor(gid){
  var n=parseInt(String(gid||'').slice(1),10)||0;
  return PALETTE[n%PALETTE.length];
}
function moveLayers(idxs,target){
  idxs=idxs.slice().sort(function(a,b){ return a-b; });
  var moving=idxs.map(function(i){ return S.layers[i]; });
  var activeObj=S.layers[S.active];
  var before=[],after=[];
  S.layers.forEach(function(l,i){
    if(idxs.indexOf(i)>=0) return;
    if(i<target) before.push(l); else after.push(l);
  });
  S.layers=before.concat(moving,after);
  S.selLayers=moving.map(function(l){ return S.layers.indexOf(l); })
                    .sort(function(a,b){ return a-b; });
  var na=S.layers.indexOf(activeObj);
  S.active=na>=0?na:S.selLayers[0];
}

/* ================= history ================= */

function snapshot(){
  return JSON.stringify({layers:S.layers,active:S.active,sel:S.selLayers,W:S.W,H:S.H,
    measures:S.measures,measSel:S.measSel});
}
function push(){ HIST.push(snapshot()); if(HIST.length>80) HIST.shift(); FUT.length=0; }
function restore(str){
  var st=JSON.parse(str);
  var folds=S.layers.map(function(l){ return !!l.collapsed; });
  S.layers=st.layers.map(normalize);
  // fold is how the list is being read, not part of the drawing; a stale flag on
  // a row that is no longer a base is inert, so index carry-over is enough
  S.layers.forEach(function(l,i){ if(folds[i]!==undefined) l.collapsed=folds[i]; });
  S.active=Math.min(st.active,st.layers.length-1);
  S.selLayers=st.sel||[S.active];
  S.W=st.W; S.H=st.H; S.sel=null;
  S.measures=st.measures||[];
  S.measSel=Math.min(st.measSel===undefined?-1:st.measSel,S.measures.length-1);
  S.measDraft=null; S.measGapFrom=-1;
  document.getElementById('w').value=S.W;
  document.getElementById('h').value=S.H;
  sync();
}
function undo(){ if(!HIST.length){ toast('Nothing to undo'); return; } FUT.push(snapshot()); restore(HIST.pop()); }
function redo(){ if(!FUT.length){ toast('Nothing to redo'); return; } HIST.push(snapshot()); restore(FUT.pop()); }

/* ================= image assets ================= */

var IMGS={};
function getImg(src){
  if(!src) return null;
  var rec=IMGS[src];
  if(rec) return rec.ok?rec.el:null;
  var el=new Image();
  IMGS[src]={el:el,ok:false};
  el.onload=function(){ IMGS[src].ok=true; sync(); };
  el.onerror=function(){ IMGS[src].bad=true; };
  el.src=src;
  return null;
}
function imgReady(src){ var r=IMGS[src]; return !!(r&&r.ok); }

/* ================= geometry ================= */

// holding the fine key drops the grid and lands on exact fineStep pixels instead
function snapV(v){
  if(S.fine) return Math.round(v/S.fineStep)*S.fineStep;
  return S.snap?Math.round(v/S.grid)*S.grid:Math.round(v);
}
function fineOn(e){
  return S.fineKey==='alt'?!!e.altKey
       : S.fineKey==='ctrl'?!!(e.ctrlKey||e.metaKey)
       : !!e.shiftKey;
}
function snapAngle(a){
  if(S.fine) return Math.round(a);
  return S.snap?Math.round(a/5)*5:Math.round(a);
}
function isCircularArc(l){
  if(!l||l.kind!=='arc') return false;
  var g=norm(l.g);
  return Math.abs(g.w-g.h)<0.5;
}
// Arc2D angles are measured on the unit-squashed ellipse, not as true screen angles
function arcAngleAt(l,x,y){
  var g=norm(l.g), cx=g.x+g.w/2, cy=g.y+g.h/2;
  var dx=(x-cx)/((g.w/2)||1), dy=(y-cy)/((g.h/2)||1);
  return Math.atan2(-dy,dx)*180/Math.PI;
}
// keep a swept angle near its previous value instead of jumping a full turn
function nearest(a,ref){
  while(a-ref>180) a-=360;
  while(ref-a>180) a+=360;
  return a;
}
function hex2rgb(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
function rgba(h,a){ var c=hex2rgb(h); return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')'; }
function norm(g){ // positive width/height
  return {x:g.w<0?g.x+g.w:g.x, y:g.h<0?g.y+g.h:g.y, w:Math.abs(g.w), h:Math.abs(g.h)};
}

// Java arc angles: counter-clockwise on screen, 0 at 3 o'clock
function arcPoint(cx,cy,rx,ry,deg){
  var t=deg*Math.PI/180;
  return {x:cx+rx*Math.cos(t), y:cy-ry*Math.sin(t)};
}
function arcDeriv(rx,ry,deg){
  var t=deg*Math.PI/180;
  return {x:-rx*Math.sin(t), y:-ry*Math.cos(t)};
}
// cubic segments approximating an elliptical arc
function arcToCubics(cx,cy,rx,ry,start,extent){
  var segs=Math.max(1,Math.ceil(Math.abs(extent)/90));
  var step=extent/segs, out=[], a=start;
  for(var i=0;i<segs;i++){
    var b=a+step;
    var p0=arcPoint(cx,cy,rx,ry,a), p1=arcPoint(cx,cy,rx,ry,b);
    var d0=arcDeriv(rx,ry,a), d1=arcDeriv(rx,ry,b);
    var alpha=(4/3)*Math.tan((step*Math.PI/180)/4);
    out.push({p0:p0,
      c1:{x:p0.x+alpha*d0.x, y:p0.y+alpha*d0.y},
      c2:{x:p1.x-alpha*d1.x, y:p1.y-alpha*d1.y},
      p1:p1});
    a=b;
  }
  return out;
}

function shapePath(l){
  if(l.kind==='text'||l.kind==='image') return null;
  var p=new Path2D();
  if(l.kind==='path'){
    if(!l.pts.length) return null;
    var open=false;
    l.pts.forEach(function(q){
      if(q.cmd==='move'){ if(open&&l.closed) p.closePath(); p.moveTo(q.x,q.y); open=true; }
      else if(q.cmd==='line')  p.lineTo(q.x,q.y);
      else if(q.cmd==='quad')  p.quadraticCurveTo(q.cx,q.cy,q.x,q.y);
      else if(q.cmd==='cubic') p.bezierCurveTo(q.c1x,q.c1y,q.c2x,q.c2y,q.x,q.y);
    });
    if(open&&l.closed) p.closePath();
    return p;
  }
  var g=norm(l.g);
  if(g.w<=0||g.h<=0) return null;
  if(l.kind==='rect'){
    var rx=Math.min(l.g.rx||0,g.w/2), ry=Math.min(l.g.ry||0,g.h/2);
    if(rx>0&&ry>0){
      p.moveTo(g.x+rx,g.y);
      p.lineTo(g.x+g.w-rx,g.y);
      p.bezierCurveTo(g.x+g.w-rx+rx*K,g.y, g.x+g.w,g.y+ry-ry*K, g.x+g.w,g.y+ry);
      p.lineTo(g.x+g.w,g.y+g.h-ry);
      p.bezierCurveTo(g.x+g.w,g.y+g.h-ry+ry*K, g.x+g.w-rx+rx*K,g.y+g.h, g.x+g.w-rx,g.y+g.h);
      p.lineTo(g.x+rx,g.y+g.h);
      p.bezierCurveTo(g.x+rx-rx*K,g.y+g.h, g.x,g.y+g.h-ry+ry*K, g.x,g.y+g.h-ry);
      p.lineTo(g.x,g.y+ry);
      p.bezierCurveTo(g.x,g.y+ry-ry*K, g.x+rx-rx*K,g.y, g.x+rx,g.y);
      p.closePath();
    } else p.rect(g.x,g.y,g.w,g.h);
    return p;
  }
  if(l.kind==='ellipse'){
    p.ellipse(g.x+g.w/2,g.y+g.h/2,g.w/2,g.h/2,0,0,Math.PI*2);
    return p;
  }
  if(l.kind==='arc'){
    var cx=g.x+g.w/2, cy=g.y+g.h/2, rrx=g.w/2, rry=g.h/2;
    var cubs=arcToCubics(cx,cy,rrx,rry,l.g.start,l.g.extent);
    if(!cubs.length) return null;
    if(l.g.arcType==='PIE'){ p.moveTo(cx,cy); p.lineTo(cubs[0].p0.x,cubs[0].p0.y); }
    else p.moveTo(cubs[0].p0.x,cubs[0].p0.y);
    cubs.forEach(function(s){ p.bezierCurveTo(s.c1.x,s.c1.y,s.c2.x,s.c2.y,s.p1.x,s.p1.y); });
    if(l.g.arcType!=='OPEN') p.closePath();
    return p;
  }
  return null;
}

function textMetrics(l){
  ctx.save();
  ctx.font=fontCSS(l);
  var lines=String(l.text.s||'').split('\n'), w=0;
  lines.forEach(function(s){ w=Math.max(w,ctx.measureText(s).width); });
  ctx.restore();
  return {w:w,h:l.text.size*lines.length};
}
var LOGICAL_FONTS={SansSerif:'sans-serif',Serif:'serif',Monospaced:'monospace',Dialog:'sans-serif'};
function fontCSS(l){
  var f=l.text.family;
  // a family picked from the system list is a real face name, not a logical one
  var fam=LOGICAL_FONTS[f]||('"'+String(f).replace(/["\\]/g,'')+'", sans-serif');
  return (l.text.italic?'italic ':'')+(l.text.bold?'bold ':'')+l.text.size+'px '+fam;
}

function layerBounds(l){
  if(l.kind==='path'){
    if(!l.pts.length) return null;
    var b={x0:1e9,y0:1e9,x1:-1e9,y1:-1e9};
    function acc(x,y){ b.x0=Math.min(b.x0,x);b.y0=Math.min(b.y0,y);b.x1=Math.max(b.x1,x);b.y1=Math.max(b.y1,y); }
    l.pts.forEach(function(p){ acc(p.x,p.y);
      if(p.cmd==='quad') acc(p.cx,p.cy);
      if(p.cmd==='cubic'){ acc(p.c1x,p.c1y); acc(p.c2x,p.c2y); } });
    return b;
  }
  if(l.kind==='text'){
    var m=textMetrics(l);
    var lines=String(l.text.s||'').split('\n').length;
    return {x0:l.text.x,y0:l.text.y-l.text.size,
            x1:l.text.x+m.w,y1:l.text.y+l.text.size*(1.2*(lines-1))+l.text.size*0.25};
  }
  var g=norm(l.g);
  return {x0:g.x,y0:g.y,x1:g.x+g.w,y1:g.y+g.h};
}
function centreOf(l){
  var b=layerBounds(l);
  if(!b) return {x:S.W/2,y:S.H/2};
  return {x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2};
}
function selBounds(){
  var b=null;
  S.selLayers.forEach(function(i){
    var lb=S.layers[i]&&layerBounds(S.layers[i]); if(!lb) return;
    if(!b) b={x0:lb.x0,y0:lb.y0,x1:lb.x1,y1:lb.y1};
    else { b.x0=Math.min(b.x0,lb.x0); b.y0=Math.min(b.y0,lb.y0);
           b.x1=Math.max(b.x1,lb.x1); b.y1=Math.max(b.y1,lb.y1); }
  });
  return b;
}
function hasTf(l){
  var t=l.tf; return t.rot!==0||t.sx!==1||t.sy!==1||t.shx!==0||t.shy!==0;
}
function applyTf(c,l){
  if(!hasTf(l)) return false;
  var ctr=centreOf(l), t=l.tf;
  c.translate(ctr.x,ctr.y);
  if(t.rot) c.rotate(t.rot*Math.PI/180);
  if(t.sx!==1||t.sy!==1) c.scale(t.sx,t.sy);
  if(t.shx||t.shy) c.transform(1,t.shy,t.shx,1,0,0);
  c.translate(-ctr.x,-ctr.y);
  return true;
}
function tfMatrix(l){
  if(!window.DOMMatrix||!hasTf(l)) return null;
  try{
    var c=centreOf(l),t=l.tf,m=new DOMMatrix();
    m=m.translate(c.x,c.y);
    if(t.rot) m=m.rotate(t.rot);
    if(t.sx!==1||t.sy!==1) m=m.scale(t.sx,t.sy);
    if(t.shx||t.shy) m=m.multiply(new DOMMatrix([1,t.shy,t.shx,1,0,0]));
    m=m.translate(-c.x,-c.y);
    return m;
  }catch(err){ return null; }
}
// maps stored geometry to the on-sheet position you actually see
function tfMapper(l){
  var m=tfMatrix(l);
  if(!m) return function(x,y){ return {x:x,y:y}; };
  return function(x,y){
    try{ var p=m.transformPoint(new DOMPoint(x,y)); return {x:p.x,y:p.y}; }
    catch(e){ return {x:x,y:y}; }
  };
}
// undo the layer transform so a test runs against the stored geometry
function unTf(l,x,y){
  var m=tfMatrix(l);
  if(!m) return {x:x,y:y};
  try{
    var inv=m.inverse(), p=inv.transformPoint(new DOMPoint(x,y));
    return {x:p.x,y:p.y};
  }catch(err){ return {x:x,y:y}; }
}

/* ================= paint & stroke ================= */

function gradEnds(l){
  var b=layerBounds(l);
  if(!b) return {x1:0,y1:0,x2:100,y2:0,cx:50,cy:0,r:50};
  var cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2;
  var w=b.x1-b.x0, h=b.y1-b.y0;
  var a=(l.gradAngle||0)*Math.PI/180;
  var dx=Math.cos(a), dy=Math.sin(a);
  var half=(Math.abs(dx)*w+Math.abs(dy)*h)/2 || 1;
  return {x1:Math.round(cx-dx*half),y1:Math.round(cy-dy*half),
          x2:Math.round(cx+dx*half),y2:Math.round(cy+dy*half),
          cx:Math.round(cx),cy:Math.round(cy),
          r:Math.max(1,Math.round(Math.max(w,h)/2))};
}
function paintFor(c,l){
  if(l.paint==='linear'){
    var e=gradEnds(l);
    var G=c.createLinearGradient(e.x1,e.y1,e.x2,e.y2);
    G.addColorStop(0,l.fillColor); G.addColorStop(1,l.fillColor2); return G;
  }
  if(l.paint==='radial'){
    var q=gradEnds(l);
    var R=c.createRadialGradient(q.cx,q.cy,0,q.cx,q.cy,q.r);
    R.addColorStop(0,l.fillColor); R.addColorStop(1,l.fillColor2); return R;
  }
  if(l.paint==='texture'){
    var el=l.tex&&l.tex.src?getImg(l.tex.src):null;
    if(!el) return l.fillColor;
    var pat=c.createPattern(el,'repeat');
    if(!pat) return l.fillColor;
    try{
      var nw=el.naturalWidth||1, nh=el.naturalHeight||1;
      var m=new DOMMatrix();
      m=m.translate(l.tex.x||0,l.tex.y||0).scale((l.tex.w||nw)/nw,(l.tex.h||nh)/nh);
      pat.setTransform(m);
    }catch(e){}
    return pat;
  }
  return l.fillColor;
}
function dashArray(l){
  if(!l.dash) return null;
  var a=String(l.dash).split(/[\s,]+/)
        .map(function(s){ return parseFloat(s); })
        .filter(function(n){ return !isNaN(n)&&n>=0; });
  if(!a.length) return null;
  var sum=0; a.forEach(function(n){ sum+=n; });
  if(sum<=0) return null;
  return a;
}
var CAP_CSS={butt:'butt',round:'round',square:'square'};
function applyStroke(c,l,z){
  c.strokeStyle=l.strokeColor;
  c.lineWidth=l.strokeW/z;
  c.lineCap=CAP_CSS[l.cap]||'square';
  c.lineJoin=l.join||'miter';
  c.miterLimit=Math.max(1,l.miter||10);
  var d=dashArray(l);
  if(d){ c.setLineDash(d.map(function(n){ return n/z; })); c.lineDashOffset=(l.dashPhase||0)/z; }
  else { c.setLineDash([]); c.lineDashOffset=0; }
}
function isStrokeDefault(l){
  return l.cap==='square'&&l.join==='miter'&&Math.abs((l.miter||10)-10)<1e-9&&!dashArray(l);
}

/* ---- convert a primitive into editable path points ---- */

function toPathPoints(l){
  var g=norm(l.g), pts=[];
  var R=Math.round;
  function cub(c1,c2,p){ pts.push({cmd:'cubic',c1x:R(c1.x),c1y:R(c1.y),c2x:R(c2.x),c2y:R(c2.y),x:R(p.x),y:R(p.y)}); }
  if(l.kind==='rect'||l.kind==='image'){
    var rx=(l.kind==='image')?0:Math.min(l.g.rx||0,g.w/2);
    var ry=(l.kind==='image')?0:Math.min(l.g.ry||0,g.h/2);
    if(rx>0&&ry>0){
      pts.push({cmd:'move',x:R(g.x+rx),y:R(g.y)});
      pts.push({cmd:'line',x:R(g.x+g.w-rx),y:R(g.y)});
      cub({x:g.x+g.w-rx+rx*K,y:g.y},{x:g.x+g.w,y:g.y+ry-ry*K},{x:g.x+g.w,y:g.y+ry});
      pts.push({cmd:'line',x:R(g.x+g.w),y:R(g.y+g.h-ry)});
      cub({x:g.x+g.w,y:g.y+g.h-ry+ry*K},{x:g.x+g.w-rx+rx*K,y:g.y+g.h},{x:g.x+g.w-rx,y:g.y+g.h});
      pts.push({cmd:'line',x:R(g.x+rx),y:R(g.y+g.h)});
      cub({x:g.x+rx-rx*K,y:g.y+g.h},{x:g.x,y:g.y+g.h-ry+ry*K},{x:g.x,y:g.y+g.h-ry});
      pts.push({cmd:'line',x:R(g.x),y:R(g.y+ry)});
      cub({x:g.x,y:g.y+ry-ry*K},{x:g.x+rx-rx*K,y:g.y},{x:g.x+rx,y:g.y});
    } else {
      pts.push({cmd:'move',x:R(g.x),y:R(g.y)});
      pts.push({cmd:'line',x:R(g.x+g.w),y:R(g.y)});
      pts.push({cmd:'line',x:R(g.x+g.w),y:R(g.y+g.h)});
      pts.push({cmd:'line',x:R(g.x),y:R(g.y+g.h)});
    }
    return pts;
  }
  if(l.kind==='ellipse'){
    var cx=g.x+g.w/2, cy=g.y+g.h/2, ax=g.w/2, ay=g.h/2;
    pts.push({cmd:'move',x:R(cx+ax),y:R(cy)});
    cub({x:cx+ax,y:cy+ay*K},{x:cx+ax*K,y:cy+ay},{x:cx,y:cy+ay});
    cub({x:cx-ax*K,y:cy+ay},{x:cx-ax,y:cy+ay*K},{x:cx-ax,y:cy});
    cub({x:cx-ax,y:cy-ay*K},{x:cx-ax*K,y:cy-ay},{x:cx,y:cy-ay});
    cub({x:cx+ax*K,y:cy-ay},{x:cx+ax,y:cy-ay*K},{x:cx+ax,y:cy});
    return pts;
  }
  if(l.kind==='arc'){
    var ccx=g.x+g.w/2, ccy=g.y+g.h/2;
    var cubs=arcToCubics(ccx,ccy,g.w/2,g.h/2,l.g.start,l.g.extent);
    if(!cubs.length) return pts;
    if(l.g.arcType==='PIE'){
      pts.push({cmd:'move',x:R(ccx),y:R(ccy)});
      pts.push({cmd:'line',x:R(cubs[0].p0.x),y:R(cubs[0].p0.y)});
    } else pts.push({cmd:'move',x:R(cubs[0].p0.x),y:R(cubs[0].p0.y)});
    cubs.forEach(function(s){ cub(s.c1,s.c2,s.p1); });
    return pts;
  }
  return pts;
}

/* ================= flattening & boolean geometry =================
   Java's Area works on real paths, so the on-screen Area preview has to as
   well: raster compositing can fill a combined shape but can never draw its
   outline. Everything below turns a group into honest polygon rings, which
   fill AND stroke the same way g2.fill(area) / g2.draw(area) do. */

var BSTEP=16;

function ringsFromPts(pts){
  var rings=[],cur=null;
  function close(){
    if(cur&&cur.length>=3){
      var a=cur[0], b=cur[cur.length-1];
      if(Math.abs(a.x-b.x)<1e-9&&Math.abs(a.y-b.y)<1e-9) cur.pop();
      if(cur.length>=3) rings.push(cur);
    }
    cur=null;
  }
  for(var i=0;i<pts.length;i++){
    var p=pts[i];
    if(p.cmd==='move'){ close(); cur=[{x:p.x,y:p.y}]; continue; }
    if(!cur) cur=[{x:p.x,y:p.y}];
    var p0=cur[cur.length-1], k, t, u;
    if(p.cmd==='line') cur.push({x:p.x,y:p.y});
    else if(p.cmd==='quad'){
      for(k=1;k<=BSTEP;k++){ t=k/BSTEP; u=1-t;
        cur.push({x:u*u*p0.x+2*u*t*p.cx+t*t*p.x, y:u*u*p0.y+2*u*t*p.cy+t*t*p.y}); }
    } else if(p.cmd==='cubic'){
      for(k=1;k<=BSTEP;k++){ t=k/BSTEP; u=1-t;
        cur.push({x:u*u*u*p0.x+3*u*u*t*p.c1x+3*u*t*t*p.c2x+t*t*t*p.x,
                  y:u*u*u*p0.y+3*u*u*t*p.c1y+3*u*t*t*p.c2y+t*t*t*p.y}); }
    }
  }
  close();
  return rings;
}

function flattenLayer(l){
  if(l.kind==='text') return textRings(l);
  if(l.kind==='image') return null;
  var pts=(l.kind==='path')?l.pts:toPathPoints(l);
  if(!pts||!pts.length) return null;
  var r=ringsFromPts(pts);   // new Area(shape) closes open paths, so we always do
  return r.length?r:null;
}

/* ---- marching squares: the only way to get glyph outlines out of canvas ---- */

var MS=[[],[[3,2]],[[2,1]],[[3,1]],[[0,1]],[[3,2],[0,1]],[[0,2]],[[3,0]],
        [[3,0]],[[0,2]],[[3,0],[2,1]],[[0,1]],[[3,1]],[[2,1]],[[3,2]],[]];
var MSE=[[0.5,0],[1,0.5],[0.5,1],[0,0.5]];
var TEXTCACHE={k:null,v:null};

function textRings(l){
  var key=[l.text.s,l.text.family,l.text.size,l.text.bold,l.text.italic,l.text.x,l.text.y].join('');
  if(TEXTCACHE.k===key) return TEXTCACHE.v;
  var b=layerBounds(l);
  if(!b||!String(l.text.s||'').length) return null;
  var pad=3, sc=2;
  var bx=b.x0-pad, by=b.y0-pad;
  var bw=(b.x1-b.x0)+pad*2, bh=(b.y1-b.y0)+pad*2;
  if(bw<=0||bh<=0) return null;
  if(bw*sc>2600||bh*sc>2600) sc=1;
  var W=Math.max(2,Math.ceil(bw*sc)), H=Math.max(2,Math.ceil(bh*sc));
  var cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  var c=cv.getContext('2d');
  c.setTransform(sc,0,0,sc,0,0);
  c.translate(-bx,-by);
  c.font=fontCSS(l); c.textBaseline='alphabetic'; c.fillStyle='#fff';
  String(l.text.s||'').split('\n').forEach(function(line,i){
    c.fillText(line,l.text.x,l.text.y+i*l.text.size*1.2);
  });
  var data;
  try{ data=c.getImageData(0,0,W,H).data; }catch(e){ return null; }
  function inside(x,y){
    if(x<0||y<0||x>=W||y>=H) return 0;
    return data[(y*W+x)*4+3]>127?1:0;
  }
  var segs=[];
  for(var y=-1;y<H;y++){
    for(var x=-1;x<W;x++){
      var ci=inside(x,y)*8+inside(x+1,y)*4+inside(x+1,y+1)*2+inside(x,y+1);
      var pairs=MS[ci];
      if(!pairs.length) continue;
      for(var q=0;q<pairs.length;q++){
        var e0=MSE[pairs[q][0]], e1=MSE[pairs[q][1]];
        segs.push({a:{x:x+e0[0],y:y+e0[1]},b:{x:x+e1[0],y:y+e1[1]}});
      }
    }
  }
  if(!segs.length){ TEXTCACHE={k:key,v:null}; return null; }
  var rings=chainSegments(segs)
    .map(function(r){ return simplifyRing(r,0.85); })
    .filter(function(r){ return r.length>=3; })
    .map(function(r){ return r.map(function(p){ return {x:bx+p.x/sc, y:by+p.y/sc}; }); });
  var out=rings.length?rings:null;
  TEXTCACHE={k:key,v:out};
  return out;
}

function simplifyRing(ring,eps){
  if(ring.length<8) return ring;
  var open=ring.slice(); open.push(ring[0]);
  var keep=new Array(open.length); keep[0]=true; keep[open.length-1]=true;
  var stack=[[0,open.length-1]];
  while(stack.length){
    var seg=stack.pop(), a=seg[0], b=seg[1];
    if(b-a<2) continue;
    var pa=open[a], pb=open[b];
    var dx=pb.x-pa.x, dy=pb.y-pa.y, len=Math.hypot(dx,dy);
    var best=-1, bd=eps;
    for(var i=a+1;i<b;i++){
      var p=open[i], d;
      if(len<1e-9) d=Math.hypot(p.x-pa.x,p.y-pa.y);
      else d=Math.abs(dy*p.x-dx*p.y+pb.x*pa.y-pb.y*pa.x)/len;
      if(d>bd){ bd=d; best=i; }
    }
    if(best>=0){ keep[best]=true; stack.push([a,best]); stack.push([best,b]); }
  }
  var out=[];
  for(var j=0;j<open.length-1;j++) if(keep[j]) out.push(open[j]);
  return out.length>=3?out:ring;
}

/* ---- chain unordered segments into closed rings ---- */

function chainSegments(segs){
  var QT=1e4;
  function key(p){ return Math.round(p.x*QT)+','+Math.round(p.y*QT); }
  var map=Object.create(null), used=new Array(segs.length), i;
  for(i=0;i<segs.length;i++){
    var ka=key(segs[i].a), kb=key(segs[i].b);
    (map[ka]||(map[ka]=[])).push(i);
    (map[kb]||(map[kb]=[])).push(i);
  }
  var rings=[];
  for(var s=0;s<segs.length;s++){
    if(used[s]) continue;
    var ring=[], cur=s, at=segs[s].a, startKey=key(segs[s].a), guard=0;
    while(cur>=0&&!used[cur]&&guard++<=segs.length+2){
      used[cur]=1;
      var sg=segs[cur];
      var here=(key(sg.a)===key(at))?sg.a:sg.b;
      var there=(here===sg.a)?sg.b:sg.a;
      ring.push(here);
      var k=key(there);
      if(k===startKey) break;
      var cands=map[k]||[], nxt=-1;
      for(var j=0;j<cands.length;j++){ if(!used[cands[j]]){ nxt=cands[j]; break; } }
      if(nxt<0){ ring.push(there); break; }
      cur=nxt; at=there;
    }
    if(ring.length>=3) rings.push(ring);
  }
  return rings;
}

/* ---- split every segment at its crossings, then keep the boundary ---- */

function segInt(s1,s2){
  var p1=s1.a,p2=s1.b,p3=s2.a,p4=s2.b;
  var d=(p2.x-p1.x)*(p4.y-p3.y)-(p2.y-p1.y)*(p4.x-p3.x);
  if(Math.abs(d)<1e-12) return null;
  var t=((p3.x-p1.x)*(p4.y-p3.y)-(p3.y-p1.y)*(p4.x-p3.x))/d;
  var u=((p3.x-p1.x)*(p2.y-p1.y)-(p3.y-p1.y)*(p2.x-p1.x))/d;
  if(t<-1e-9||t>1+1e-9||u<-1e-9||u>1+1e-9) return null;
  return {t:t,u:u};
}
function splitAll(segs){
  var n=segs.length, splits=new Array(n), i;
  for(i=0;i<n;i++) splits[i]=[];
  var minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for(i=0;i<n;i++){
    var s=segs[i];
    minx=Math.min(minx,s.a.x,s.b.x); maxx=Math.max(maxx,s.a.x,s.b.x);
    miny=Math.min(miny,s.a.y,s.b.y); maxy=Math.max(maxy,s.a.y,s.b.y);
  }
  var side=Math.max(8,Math.min(96,Math.round(Math.sqrt(n/2))));
  var cw=Math.max(1e-6,(maxx-minx)/side), ch=Math.max(1e-6,(maxy-miny)/side);
  var grid=Object.create(null);
  for(i=0;i<n;i++){
    var q=segs[i];
    var c0=Math.floor((Math.min(q.a.x,q.b.x)-minx)/cw), c1=Math.floor((Math.max(q.a.x,q.b.x)-minx)/cw);
    var r0=Math.floor((Math.min(q.a.y,q.b.y)-miny)/ch), r1=Math.floor((Math.max(q.a.y,q.b.y)-miny)/ch);
    for(var cx=c0;cx<=c1;cx++) for(var cy=r0;cy<=r1;cy++){
      var kk=cx+':'+cy; (grid[kk]||(grid[kk]=[])).push(i);
    }
  }
  Object.keys(grid).forEach(function(kk){
    var list=grid[kk];
    for(var a=0;a<list.length;a++) for(var b=a+1;b<list.length;b++){
      var ia=list[a], ib=list[b];
      var pr=segInt(segs[ia],segs[ib]);
      if(!pr) continue;
      if(pr.t>1e-9&&pr.t<1-1e-9) splits[ia].push(pr.t);
      if(pr.u>1e-9&&pr.u<1-1e-9) splits[ib].push(pr.u);
    }
  });
  function snap(p){ return {x:Math.round(p.x*1e4)/1e4, y:Math.round(p.y*1e4)/1e4}; }
  var out=[];
  for(i=0;i<n;i++){
    var sg=segs[i], ts=splits[i];
    if(!ts.length){ out.push({a:snap(sg.a),b:snap(sg.b)}); continue; }
    ts.sort(function(p,r){ return p-r; });
    var prev=0, pa=snap(sg.a);
    for(var j=0;j<ts.length;j++){
      if(ts[j]-prev<1e-9) continue;
      var pb=snap({x:sg.a.x+(sg.b.x-sg.a.x)*ts[j], y:sg.a.y+(sg.b.y-sg.a.y)*ts[j]});
      out.push({a:pa,b:pb}); pa=pb; prev=ts[j];
    }
    out.push({a:pa,b:snap(sg.b)});
  }
  return out.filter(function(s){ return Math.abs(s.a.x-s.b.x)>1e-9||Math.abs(s.a.y-s.b.y)>1e-9; });
}

function ringsToPath(rings){
  var p=new Path2D();
  rings.forEach(function(r){
    if(r.length<3) return;
    p.moveTo(r[0].x,r[0].y);
    for(var i=1;i<r.length;i++) p.lineTo(r[i].x,r[i].y);
    p.closePath();
  });
  return p;
}
function pointInMember(m,x,y){
  try{ return hitCtx.isPointInPath(m.path,x,y,m.wind); }catch(e){ return false; }
}
function inResult(members,x,y){
  var r=pointInMember(members[0],x,y);
  for(var i=1;i<members.length;i++){
    var b=pointInMember(members[i],x,y), op=members[i].op;
    if(op==='subtract') r=r&&!b;
    else if(op==='intersect') r=r&&b;
    else if(op==='exclusiveOr') r=(r!==b);
    else r=r||b;
  }
  return r;
}

// rings for one member, expressed in the base layer's transform space
function memberRings(l,baseInv){
  var rings=flattenLayer(l);
  if(!rings||!rings.length) return null;
  var comb=relMatrix(l,baseInv);
  if(isIdentity(comb)) return rings;
  try{
    return rings.map(function(r){
      return r.map(function(p){
        var q=comb.transformPoint(new DOMPoint(p.x,p.y));
        return {x:q.x,y:q.y};
      });
    });
  }catch(e){ return rings; }
}
function relMatrix(l,baseInv){
  var m=tfMatrix(l);
  try{
    if(baseInv&&m) return baseInv.multiply(m);
    if(baseInv) return baseInv;
    return m;
  }catch(e){ return null; }
}
function isIdentity(m){
  if(!m) return true;
  return Math.abs(m.a-1)<1e-9&&Math.abs(m.b)<1e-9&&Math.abs(m.c)<1e-9&&
         Math.abs(m.d-1)<1e-9&&Math.abs(m.e)<1e-9&&Math.abs(m.f)<1e-9;
}

var BOOLCACHE=Object.create(null), BOOLKEYS=[];
function groupKey(grp){
  return grp.map(function(l){
    return l.kind+'|'+l.combine+'|'+l.wind+'|'+JSON.stringify(l.tf)+'|'
      +(l.kind==='path'?JSON.stringify(l.pts):JSON.stringify(l.g))
      +(l.kind==='text'?JSON.stringify(l.text):'');
  }).join('');
}
function areaRings(grp){
  var key=groupKey(grp);
  if(key in BOOLCACHE) return BOOLCACHE[key];
  var res;
  try{ res=computeArea(grp); }catch(e){ res=null; }
  BOOLCACHE[key]=res; BOOLKEYS.push(key);
  if(BOOLKEYS.length>40) delete BOOLCACHE[BOOLKEYS.shift()];
  return res;
}
function computeArea(grp){
  var base=grp[0];
  var bm=tfMatrix(base), baseInv=null;
  if(bm){ try{ baseInv=bm.inverse(); }catch(e){ baseInv=null; } }
  var members=[],i;
  for(i=0;i<grp.length;i++){
    var rings=memberRings(grp[i],baseInv)||[];   // blank text, a stub path: empty, not fatal
    members.push({rings:rings, op:grp[i].combine,
      wind:(grp[i].kind==='text'||grp[i].wind==='evenodd')?'evenodd':'nonzero',
      path:ringsToPath(rings)});
  }
  if(members.length<2) return null;
  var segs=[];
  members.forEach(function(m){
    m.rings.forEach(function(r){
      for(var j=0;j<r.length;j++){
        var a=r[j], b=r[(j+1)%r.length];
        if(Math.abs(a.x-b.x)<1e-9&&Math.abs(a.y-b.y)<1e-9) continue;
        segs.push({a:a,b:b});
      }
    });
  });
  if(!segs.length||segs.length>7000) return null;
  var pieces=splitAll(segs);
  if(pieces.length>14000) return null;
  var kept=[];
  for(i=0;i<pieces.length;i++){
    var s=pieces[i];
    var mx=(s.a.x+s.b.x)/2, my=(s.a.y+s.b.y)/2;
    var dx=s.b.x-s.a.x, dy=s.b.y-s.a.y, len=Math.hypot(dx,dy);
    if(len<1e-7) continue;
    var eps=Math.min(0.05,len*0.4);
    var nx=-dy/len*eps, ny=dx/len*eps;
    if(inResult(members,mx+nx,my+ny)!==inResult(members,mx-nx,my-ny))
      kept.push({a:s.a,b:s.b});
  }
  if(!kept.length) return [];
  return chainSegments(kept);
}

/* ---- point handles & insertion ---- */

function handles(l){
  var out=[];
  if(l.kind==='path'){
    l.pts.forEach(function(p,i){
      out.push({i:i,key:'a',x:p.x,y:p.y});
      if(p.cmd==='quad') out.push({i:i,key:'c',x:p.cx,y:p.cy});
      if(p.cmd==='cubic'){
        out.push({i:i,key:'c1',x:p.c1x,y:p.c1y});
        out.push({i:i,key:'c2',x:p.c2x,y:p.c2y});
      }
    });
    return out;
  }
  if(l.kind==='text'){ return [{i:0,key:'t',x:l.text.x,y:l.text.y}]; }
  var g=norm(l.g);
  out=[{key:'nw',x:g.x,y:g.y},{key:'ne',x:g.x+g.w,y:g.y},
       {key:'se',x:g.x+g.w,y:g.y+g.h},{key:'sw',x:g.x,y:g.y+g.h}];
  // the two arc edges are draggable, so an arc can be shaped on the sheet
  if(l.kind==='arc'&&g.w>0&&g.h>0){
    var cx=g.x+g.w/2, cy=g.y+g.h/2, rx=g.w/2, ry=g.h/2;
    var ps=arcPoint(cx,cy,rx,ry,l.g.start);
    var pe=arcPoint(cx,cy,rx,ry,l.g.start+l.g.extent);
    out.push({key:'as',x:ps.x,y:ps.y});
    out.push({key:'ae',x:pe.x,y:pe.y});
  }
  return out;
}

/* ---- rotation handle ---- */

// one layer's axis-aligned box in sheet space, as it is actually drawn
function layerBox(l){
  var lb=l&&layerBounds(l); if(!lb) return null;
  var T=tfMapper(l), b=null;
  [[lb.x0,lb.y0],[lb.x1,lb.y0],[lb.x1,lb.y1],[lb.x0,lb.y1]].forEach(function(p){
    var q=T(p[0],p[1]);
    if(!b) b={x0:q.x,y0:q.y,x1:q.x,y1:q.y};
    else { b.x0=Math.min(b.x0,q.x); b.y0=Math.min(b.y0,q.y);
           b.x1=Math.max(b.x1,q.x); b.y1=Math.max(b.y1,q.y); }
  });
  return b;
}
function selScreenBox(){
  var b=null;
  S.selLayers.forEach(function(i){
    var lb=layerBox(S.layers[i]); if(!lb) return;
    if(!b) b={x0:lb.x0,y0:lb.y0,x1:lb.x1,y1:lb.y1};
    else { b.x0=Math.min(b.x0,lb.x0); b.y0=Math.min(b.y0,lb.y0);
           b.x1=Math.max(b.x1,lb.x1); b.y1=Math.max(b.y1,lb.y1); }
  });
  return b;
}

/* ---- align & distribute ---- */

function alignSel(edge){
  var items=[];
  S.selLayers.forEach(function(i){
    var b=layerBox(S.layers[i]);
    if(b) items.push({l:S.layers[i],b:b});
  });
  if(!items.length) return;
  // a lone shape has nothing to line up with, so it aligns to the sheet
  var box=items.length>1?selScreenBox():{x0:0,y0:0,x1:S.W,y1:S.H};
  push();
  items.forEach(function(o){
    var dx=0,dy=0;
    if(edge==='l') dx=box.x0-o.b.x0;
    else if(edge==='r') dx=box.x1-o.b.x1;
    else if(edge==='c') dx=(box.x0+box.x1)/2-(o.b.x0+o.b.x1)/2;
    else if(edge==='t') dy=box.y0-o.b.y0;
    else if(edge==='b') dy=box.y1-o.b.y1;
    else if(edge==='m') dy=(box.y0+box.y1)/2-(o.b.y0+o.b.y1)/2;
    shiftLayer(o.l,Math.round(dx),Math.round(dy));
  });
  sync();
}
function distributeSel(horiz){
  var items=[];
  S.selLayers.forEach(function(i){
    var b=layerBox(S.layers[i]);
    if(b) items.push({l:S.layers[i],b:b});
  });
  if(items.length<3){ toast('Select three or more shapes to spread them'); return; }
  function mid(o){ return horiz?(o.b.x0+o.b.x1)/2:(o.b.y0+o.b.y1)/2; }
  items.sort(function(a,b){ return mid(a)-mid(b); });
  var c0=mid(items[0]), c1=mid(items[items.length-1]);
  var step=(c1-c0)/(items.length-1);
  push();
  items.forEach(function(o,k){
    if(k===0||k===items.length-1) return;
    var d=Math.round(c0+step*k-mid(o));
    shiftLayer(o.l,horiz?d:0,horiz?0:d);
  });
  sync();
}
function rotHandle(){
  if(S.tool!=='select') return null;
  var b=selScreenBox(); if(!b) return null;
  var mx=(b.x0+b.x1)/2;
  return {x:mx, y:b.y0-26/S.view.z, top:b.y0,
          pivot:{x:mx, y:(b.y0+b.y1)/2}};
}
// circular arcs turn through start°, so the output stays a plain Arc2D.Double
function rotateLayer(l,d){
  if(isCircularArc(l)) l.g.start-=d; else l.tf.rot+=d;
}
function applyRotation(d,each){
  var h=rotHandle(); if(!h||!d) return;
  push();
  S.selLayers.forEach(function(i){
    var l=S.layers[i]; if(!l) return;
    var c=centreOf(l);
    rotateLayer(l,d);
    if(each) return;
    var r=d*Math.PI/180, cos=Math.cos(r), sin=Math.sin(r);
    var vx=c.x-h.pivot.x, vy=c.y-h.pivot.y;
    var nx=h.pivot.x+vx*cos-vy*sin, ny=h.pivot.y+vx*sin+vy*cos;
    shiftLayer(l,Math.round(nx-c.x),Math.round(ny-c.y));
  });
  sync();
}
/* ---- scale the whole selection ----
   Two ways to grow a shape, and the emitted Java tells them apart: geometry
   mode rewrites the coordinates so the output stays a bare shape, transform
   mode leaves them alone and rides tf, which comes out as g2.scale(). Either
   one can be driven by the corner grips or by typing a multiplier. */

// grips sit just outside the selection box so they never land on the active
// shape's own geometry handles
var SCALE_OUT=13, SCALE_GRIP=9;
function scaleHandles(){
  if(S.tool!=='select') return null;
  var b=selScreenBox(); if(!b) return null;
  if(b.x1-b.x0<0.5&&b.y1-b.y0<0.5) return null;
  var d=SCALE_OUT/S.view.z;
  // cx,cy is the box corner a grip stands for; px,py the corner it pivots on
  return {box:b,grips:[
    {key:'nw',x:b.x0-d,y:b.y0-d,cx:b.x0,cy:b.y0,px:b.x1,py:b.y1,ox:-d,oy:-d},
    {key:'ne',x:b.x1+d,y:b.y0-d,cx:b.x1,cy:b.y0,px:b.x0,py:b.y1,ox: d,oy:-d},
    {key:'se',x:b.x1+d,y:b.y1+d,cx:b.x1,cy:b.y1,px:b.x0,py:b.y0,ox: d,oy: d},
    {key:'sw',x:b.x0-d,y:b.y1+d,cx:b.x0,cy:b.y1,px:b.x1,py:b.y0,ox:-d,oy: d}]};
}
function hitScale(x,y){
  if(!scaleArmed()) return null;
  var sh=scaleHandles(); if(!sh) return null;
  var best=null, bd=SCALE_GRIP/S.view.z;
  sh.grips.forEach(function(g){
    var d=Math.hypot(g.x-x,g.y-y);
    if(d<bd){ bd=d; best=g; }
  });
  return best;
}
// flipping is its own command, so a factor never goes negative here
function scaleFactor(f){
  f=parseFloat(f);
  if(!isFinite(f)||f<=0) return 1;
  return Math.min(50,Math.max(0.02,f));
}
// only the numbers a scale touches, so a live drag can rewind and reapply
// from the same starting point instead of compounding rounding every move
function scaleBase(l){
  return {
    pts:(l.pts||[]).map(function(p){
      return {x:p.x,y:p.y,cx:p.cx,cy:p.cy,
              c1x:p.c1x,c1y:p.c1y,c2x:p.c2x,c2y:p.c2y};
    }),
    g:{x:l.g.x,y:l.g.y,w:l.g.w,h:l.g.h,rx:l.g.rx,ry:l.g.ry},
    text:{x:l.text.x,y:l.text.y,size:l.text.size},
    tf:{sx:l.tf.sx,sy:l.tf.sy}
  };
}
function scaleRestore(l,b){
  b.pts.forEach(function(q,i){
    var p=l.pts[i]; if(!p) return;
    p.x=q.x; p.y=q.y;
    if(p.cmd==='quad'){ p.cx=q.cx; p.cy=q.cy; }
    if(p.cmd==='cubic'){ p.c1x=q.c1x; p.c1y=q.c1y; p.c2x=q.c2x; p.c2y=q.c2y; }
  });
  l.g.x=b.g.x; l.g.y=b.g.y; l.g.w=b.g.w; l.g.h=b.g.h;
  l.g.rx=b.g.rx; l.g.ry=b.g.ry;
  l.text.x=b.text.x; l.text.y=b.text.y; l.text.size=b.text.size;
  l.tf.sx=b.tf.sx; l.tf.sy=b.tf.sy;
}
// A Font size is a whole number, so text can only take the uniform part of a
// scale into its geometry. The aspect goes to the transform; the rounding does
// not -- half a point of font size is not worth an AffineTransform in the output.
function scaleTextGeom(l,fx,fy,pv){
  var R=Math.round, u=Math.sqrt(Math.abs(fx*fy))||1;
  var ns=Math.max(4,R(l.text.size*u)), real=ns/(l.text.size||ns);
  l.text.size=ns;
  l.text.x=R(pv.x+(l.text.x-pv.x)*real);
  l.text.y=R(pv.y+(l.text.y-pv.y)*real);
  return {x:fx/u, y:fy/u};        // exactly 1 when the scale was uniform
}
function scaleLayer(l,fx,fy,pv,mode){
  var R=Math.round;
  function mx(v){ return pv.x+(v-pv.x)*fx; }
  function my(v){ return pv.y+(v-pv.y)*fy; }
  if(mode==='tf'){
    // the transform pivots on the shape's own centre, so the shape only lands
    // in the right place once that centre has been moved there
    var c=centreOf(l);
    l.tf.sx*=fx; l.tf.sy*=fy;
    shiftLayer(l,R(mx(c.x)-c.x),R(my(c.y)-c.y));
    return;
  }
  if(l.kind==='path'){
    l.pts.forEach(function(p){
      p.x=R(mx(p.x)); p.y=R(my(p.y));
      if(p.cmd==='quad'){ p.cx=R(mx(p.cx)); p.cy=R(my(p.cy)); }
      if(p.cmd==='cubic'){
        p.c1x=R(mx(p.c1x)); p.c1y=R(my(p.c1y));
        p.c2x=R(mx(p.c2x)); p.c2y=R(my(p.c2y));
      }
    });
    return;
  }
  if(l.kind==='text'){
    var a=scaleTextGeom(l,fx,fy,pv);
    l.tf.sx*=a.x; l.tf.sy*=a.y;
    return;
  }
  var g=norm(l.g);
  l.g.x=R(mx(g.x)); l.g.y=R(my(g.y));
  l.g.w=Math.max(1,R(g.w*fx)); l.g.h=Math.max(1,R(g.h*fy));
  if(l.kind==='rect'){
    l.g.rx=Math.max(0,R((l.g.rx||0)*fx));
    l.g.ry=Math.max(0,R((l.g.ry||0)*fy));
  }
}
// pivot defaults to the selection's centre; 'each' pins every shape to its own
function scaleSelection(fx,fy,opts){
  opts=opts||{};
  var mode=opts.mode||S.scaleMode;
  var each=(opts.each===undefined)?S.scaleEach:opts.each;
  var pv=opts.pivot;
  if(!pv){
    var b=selScreenBox(); if(!b) return false;
    pv={x:(b.x0+b.x1)/2, y:(b.y0+b.y1)/2};
  }
  S.selLayers.forEach(function(i){
    var l=S.layers[i]; if(!l) return;
    scaleLayer(l,fx,fy,each?centreOf(l):pv,mode);
  });
  return true;
}
function applyScale(fx,fy){
  fx=scaleFactor(fx); fy=scaleFactor(fy);
  if(Math.abs(fx-1)<1e-6&&Math.abs(fy-1)<1e-6) return;
  if(!selScreenBox()){ toast('Nothing to scale yet'); return; }
  push();
  scaleSelection(fx,fy,{});
  sync();
}

// Choosing geometry mode is a promise that the output carries no g2.scale(),
// so a scale already sitting on the transform has to be folded into the
// numbers. Rotation and shear stay put: no primitive can express those.
function snapOne(v){ return Math.abs(v-1)<1e-6?1:v; }
function bakeTfScale(l){
  var sx=l.tf.sx, sy=l.tf.sy, R=Math.round;
  if(snapOne(sx)===1&&snapOne(sy)===1) return true;
  var c=centreOf(l), ax=Math.abs(sx)||1, ay=Math.abs(sy)||1;
  var fx,fy;                                   // what actually leaves tf
  function mx(v,f){ return R(c.x+(v-c.x)*f); }
  function my(v,f){ return R(c.y+(v-c.y)*f); }

  if(l.kind==='path'){
    fx=sx; fy=sy;
    l.pts.forEach(function(p){
      p.x=mx(p.x,fx); p.y=my(p.y,fy);
      if(p.cmd==='quad'){ p.cx=mx(p.cx,fx); p.cy=my(p.cy,fy); }
      if(p.cmd==='cubic'){
        p.c1x=mx(p.c1x,fx); p.c1y=my(p.c1y,fy);
        p.c2x=mx(p.c2x,fx); p.c2y=my(p.c2y,fy);
      }
    });
    l.tf.sx=1; l.tf.sy=1;
  } else if(l.kind==='text'){
    var a=scaleTextGeom(l,ax,ay,c);
    l.tf.sx=snapOne((sx<0?-1:1)*a.x);
    l.tf.sy=snapOne((sy<0?-1:1)*a.y);
    fx=fy=1;                      // a uniform part slides past a shear untouched
  } else {
    // a box mirrored about its own centre is the same box, so only an image,
    // whose pixels really do turn round, has to keep the sign
    var keepSign=(l.kind==='image');
    fx=keepSign?ax:sx; fy=keepSign?ay:sy;
    var g=norm(l.g);
    l.g.x=mx(g.x,ax); l.g.y=my(g.y,ay);
    l.g.w=Math.max(1,R(g.w*ax)); l.g.h=Math.max(1,R(g.h*ay));
    if(l.kind==='rect'){
      l.g.rx=Math.max(0,R((l.g.rx||0)*ax));
      l.g.ry=Math.max(0,R((l.g.ry||0)*ay));
    }
    if(l.kind==='arc'){                        // an arc mirrors through its angles
      if(sx<0){ l.g.start=180-l.g.start; l.g.extent=-l.g.extent; }
      if(sy<0){ l.g.start=-l.g.start; l.g.extent=-l.g.extent; }
    }
    l.tf.sx=(keepSign&&sx<0)?-1:1;
    l.tf.sy=(keepSign&&sy<0)?-1:1;
  }
  // the shear runs after the scale, so it has to be re-read in the frame the
  // scale leaves behind
  if(l.tf.shx) l.tf.shx=l.tf.shx*fx/fy;
  if(l.tf.shy) l.tf.shy=l.tf.shy*fy/fx;
  // g2.scale used to grow the pen with the shape; the coordinates cannot, so
  // the width comes across too and the drawing stays the one you had
  var pen=Math.sqrt(ax*ay)||1;
  if(Math.abs(pen-1)>1e-6) l.strokeW=Math.max(1,R(l.strokeW*pen));
  return l.tf.sx===1&&l.tf.sy===1;
}
// returns the line to show, or '' when there was nothing on the transform
function dropTfScale(){
  var hit=[];
  S.selLayers.forEach(function(i){
    var l=S.layers[i];
    if(l&&!(snapOne(l.tf.sx)===1&&snapOne(l.tf.sy)===1)) hit.push(l);
  });
  if(!hit.length) return '';
  push();
  var whole=true;
  hit.forEach(function(l){ if(!bakeTfScale(l)) whole=false; });
  sync();
  return whole
    ? 'Scale folded into the coordinates'
    : 'Scale folded in, but a stretch only a transform can express stayed behind';
}

// handles live where the transform puts them, not where the raw numbers are
function hitHandle(x,y){
  var l=L(); if(!l) return null;
  var T=tfMapper(l), hs=handles(l), best=null, bd=11/S.view.z;
  for(var k=hs.length-1;k>=0;k--){
    var q=T(hs[k].x,hs[k].y);
    var d=Math.hypot(q.x-x,q.y-y);
    if(d<bd){ bd=d; best=hs[k]; }
  }
  return best;
}
function lerp(a,b,t){ return a+(b-a)*t; }
function segPoint(prev,p,t){
  if(p.cmd==='line') return {x:lerp(prev.x,p.x,t),y:lerp(prev.y,p.y,t)};
  if(p.cmd==='quad'){ var u=1-t;
    return {x:u*u*prev.x+2*u*t*p.cx+t*t*p.x, y:u*u*prev.y+2*u*t*p.cy+t*t*p.y}; }
  var v=1-t;
  return {x:v*v*v*prev.x+3*v*v*t*p.c1x+3*v*t*t*p.c2x+t*t*t*p.x,
          y:v*v*v*prev.y+3*v*v*t*p.c1y+3*v*t*t*p.c2y+t*t*t*p.y};
}
function splitSeg(prev,p,t){
  var R=Math.round;
  if(p.cmd==='line'){ var m=segPoint(prev,p,t);
    return [{cmd:'line',x:R(m.x),y:R(m.y)},{cmd:'line',x:p.x,y:p.y}]; }
  if(p.cmd==='quad'){
    var ax=lerp(prev.x,p.cx,t),ay=lerp(prev.y,p.cy,t);
    var bx=lerp(p.cx,p.x,t),by=lerp(p.cy,p.y,t);
    var mx=lerp(ax,bx,t),my=lerp(ay,by,t);
    return [{cmd:'quad',cx:R(ax),cy:R(ay),x:R(mx),y:R(my)},
            {cmd:'quad',cx:R(bx),cy:R(by),x:p.x,y:p.y}];
  }
  var Ax=lerp(prev.x,p.c1x,t),Ay=lerp(prev.y,p.c1y,t);
  var Bx=lerp(p.c1x,p.c2x,t),By=lerp(p.c1y,p.c2y,t);
  var Cx=lerp(p.c2x,p.x,t),Cy=lerp(p.c2y,p.y,t);
  var Dx=lerp(Ax,Bx,t),Dy=lerp(Ay,By,t);
  var Ex=lerp(Bx,Cx,t),Ey=lerp(By,Cy,t);
  var Mx=lerp(Dx,Ex,t),My=lerp(Dy,Ey,t);
  return [{cmd:'cubic',c1x:R(Ax),c1y:R(Ay),c2x:R(Dx),c2y:R(Dy),x:R(Mx),y:R(My)},
          {cmd:'cubic',c1x:R(Ex),c1y:R(Ey),c2x:R(Cx),c2y:R(Cy),x:p.x,y:p.y}];
}
function insertAt(sx,sy){
  var l=L(); if(l.kind!=='path') return false;
  var q=unTf(l,sx,sy);
  var best=null;
  for(var i=1;i<l.pts.length;i++){
    var p=l.pts[i]; if(p.cmd==='move') continue;
    var prev=l.pts[i-1];
    for(var k=1;k<40;k++){
      var t=k/40,pt=segPoint(prev,p,t);
      var d=Math.hypot(pt.x-q.x,pt.y-q.y);
      if(!best||d<best.d) best={d:d,i:i,t:t};
    }
  }
  if(!best||best.d>14/S.view.z) return false;
  push();
  var parts=splitSeg(l.pts[best.i-1],l.pts[best.i],best.t);
  l.pts.splice(best.i,1,parts[0],parts[1]);
  S.sel={i:best.i,key:'a'};
  sync(); return true;
}
function insideLayer(l,x,y){
  var q=unTf(l,x,y);
  if(l.kind==='text'||l.kind==='image'){
    var b=layerBounds(l);
    return !!b&&q.x>=b.x0&&q.x<=b.x1&&q.y>=b.y0&&q.y<=b.y1;
  }
  var p=shapePath(l);
  if(!p) return false;
  var hit=false;
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);   // identity: path units == sheet units
  ctx.lineWidth=Math.max(8,l.strokeW);
  try{ hit=ctx.isPointInPath(p,q.x,q.y)||ctx.isPointInStroke(p,q.x,q.y); }catch(err){}
  ctx.restore();
  return hit;
}

/* ================= view ================= */

function toSheet(ev){
  var r=board.getBoundingClientRect();
  return {x:(ev.clientX-r.left-GUT-S.view.x)/S.view.z,
          y:(ev.clientY-r.top-GUT-S.view.y)/S.view.z};
}
function zoomAt(sx,sy,next){
  var v=S.view,old=v.z;
  next=Math.min(8,Math.max(.1,next));
  if(next===old) return;
  var cx=sx-GUT,cy=sy-GUT;
  v.x=cx-(cx-v.x)*(next/old); v.y=cy-(cy-v.y)*(next/old); v.z=next;
  showZoom(); draw();
}
function zoomCentre(n){ var r=board.getBoundingClientRect(); zoomAt(r.width/2,r.height/2,n); }
var needFit=false;
function fitView(){
  var vw=VW-GUT-24,vh=VH-GUT-24;
  // a hidden tab or an unlaid-out pane leaves VW/VH at 0; fitting then bakes a
  // junk view (z pinned to the floor, the sheet thousands of units off-screen)
  if(vw<40||vh<40){ needFit=true; return; }
  needFit=false;
  var z=Math.min(4,Math.max(.1,Math.min(vw/S.W,vh/S.H)));
  S.view.z=z; S.view.x=(vw-S.W*z)/2+12; S.view.y=(vh-S.H*z)/2+12;
  showZoom(); draw();
}
function showZoom(){ document.getElementById('zoomVal').textContent=Math.round(S.view.z*100)+'%'; }
function resize(){
  var r=stage.getBoundingClientRect();
  VW=r.width; VH=r.height;
  var dpr=window.devicePixelRatio||1;
  board.width=Math.round(VW*dpr); board.height=Math.round(VH*dpr);
  board.style.width=VW+'px'; board.style.height=VH+'px';
  if(needFit) fitView(); else draw();   // retry a fit that had nothing to measure
}

/* ================= painting ================= */

// ---- clip scopes ----
// A clip region owns the run of `clipped` layers that follows it. A clipped clip
// nests inside the one above (its region intersects); an unclipped layer closes
// every open scope. Returns, per layer, the stack of clip indices enclosing it.
function clipScopes(){
  var out=new Array(S.layers.length), stack=[];
  S.layers.forEach(function(l,i){
    if(!l.clipped) stack=[];          // an unclipped layer ends every open scope
    out[i]=stack.slice();             // the scopes this layer is painted inside
    if(l.isClip) stack=stack.concat([i]);
  });
  return out;
}
// which rows a collapsed base is hiding. A clip region folds away everything in
// its scope (nested regions included); a boolean base folds the run merged into it
function collapsedRows(){
  var sc=clipScopes(), merged=mergedLayers(), skip={};
  S.layers.forEach(function(l,i){
    if(!l.collapsed) return;
    if(l.isClip) S.layers.forEach(function(o,j){ if((sc[j]||[]).indexOf(i)>=0) skip[j]=1; });
    for(var j=i+1;j<S.layers.length&&merged.indexOf(S.layers[j])>=0;j++) skip[j]=1;
  });
  // a hidden base takes its boolean run with it, or the members are left orphaned
  for(var k=0;k<S.layers.length;k++){
    if(!skip[k]) continue;
    for(var m=k+1;m<S.layers.length&&merged.indexOf(S.layers[m])>=0;m++) skip[m]=1;
  }
  return skip;
}
// how many rows this base would fold away, for the count on a collapsed row
function foldCount(i){
  var sc=clipScopes(), merged=mergedLayers(), l=S.layers[i], hit={}, j, k, m;
  if(l.isClip) S.layers.forEach(function(o,q){ if((sc[q]||[]).indexOf(i)>=0) hit[q]=1; });
  for(j=i+1;j<S.layers.length&&merged.indexOf(S.layers[j])>=0;j++) hit[j]=1;
  for(k=0;k<S.layers.length;k++){          // a hidden base takes its run with it
    if(!hit[k]) continue;
    for(m=k+1;m<S.layers.length&&merged.indexOf(S.layers[m])>=0;m++) hit[m]=1;
  }
  return Object.keys(hit).length;
}
function clipDepth(i){ var sc=clipScopes(); return sc[i]?sc[i].length:0; }
// a clip region with nothing under it silently does nothing; worth saying so
function clipOwns(i){
  var n=0;
  for(var j=i+1;j<S.layers.length;j++){ if(!S.layers[j].clipped) break; n++; }
  return n;
}
function groups(){
  var gs=[];
  S.layers.forEach(function(l){
    if(!l.visible) return;
    var last=gs.length?gs[gs.length-1]:null;
    if(!last||l.combine==='none'||l.isClip||l.kind==='image'
       ||last[0].isClip||last[0].kind==='image') gs.push([l]);
    else gs[gs.length-1].push(l);
  });
  return gs;
}
var COMPOSITE={add:'source-over',subtract:'destination-out',
               intersect:'destination-in',exclusiveOr:'xor'};

function paintSingle(c,l,isActive,z){
  var p=(l.kind==='text'||l.kind==='image')?null:shapePath(l);
  if(l.kind!=='text'&&l.kind!=='image'&&!p) return;
  c.save();
  c.globalAlpha=(l.alpha!==undefined?l.alpha:1)*(isActive?1:.45);
  applyTf(c,l);
  if(l.kind==='image'){
    var g=norm(l.g), el=l.img&&l.img.src?getImg(l.img.src):null;
    if(el&&g.w>0&&g.h>0){
      try{ c.drawImage(el,g.x,g.y,g.w,g.h); }catch(e){}
    } else if(g.w>0&&g.h>0){
      c.fillStyle='rgba(23,36,43,.06)'; c.fillRect(g.x,g.y,g.w,g.h);
      c.strokeStyle=rgba('#5c6b73',.5); c.lineWidth=1/z;
      c.setLineDash([5/z,4/z]); c.strokeRect(g.x,g.y,g.w,g.h); c.setLineDash([]);
    }
    c.restore(); return;
  }
  if(l.kind==='text'){
    c.font=fontCSS(l);
    c.textBaseline='alphabetic';
    var lines=String(l.text.s||'').split('\n');
    lines.forEach(function(line,i){
      var yy=l.text.y+i*l.text.size*1.2;
      if(l.render==='fill'||l.render==='both'){ c.fillStyle=paintFor(c,l); c.fillText(line,l.text.x,yy); }
      if(l.render==='draw'||l.render==='both'){
        applyStroke(c,l,z); c.strokeText(line,l.text.x,yy); c.setLineDash([]);
      }
    });
    c.restore(); return;
  }
  if(l.render==='fill'||l.render==='both'){ c.fillStyle=paintFor(c,l); c.fill(p,l.wind); }
  if(l.render==='draw'||l.render==='both'){
    applyStroke(c,l,z); c.stroke(p); c.setLineDash([]);
  }
  c.restore();
}

// last resort when a group cannot be reduced to rings: fills only, as before
function rasterGroup(c,grp){
  var base=grp[0], dpr=window.devicePixelRatio||1;
  var w=Math.max(1,Math.round(S.W*dpr)), h=Math.max(1,Math.round(S.H*dpr));
  if(off.width!==w||off.height!==h){ off.width=w; off.height=h; }
  offc.setTransform(1,0,0,1,0,0);
  offc.clearRect(0,0,off.width,off.height);
  offc.save(); offc.scale(dpr,dpr);
  offc.globalCompositeOperation='source-over';
  var bp=shapePath(base);
  if(bp){ offc.fillStyle=paintFor(offc,base); offc.fill(bp,base.wind); }
  for(var i=1;i<grp.length;i++){
    var l=grp[i], lp=shapePath(l);
    if(!lp) continue;
    offc.globalCompositeOperation=COMPOSITE[l.combine]||'source-over';
    offc.fillStyle=l.fillColor;
    offc.fill(lp,l.wind);
  }
  offc.restore();
  c.drawImage(off,0,0,S.W,S.H);
}

function paintGroup(c,grp,z,actives,solid){
  if(grp.length===1){ paintSingle(c,grp[0],solid||actives.indexOf(grp[0])>=0,z); return; }
  var base=grp[0];
  var live=grp.some(function(l){ return actives.indexOf(l)>=0; });
  var rings=areaRings(grp);
  c.save();
  c.globalAlpha=(solid?1:(live?1:.45))*(base.alpha!==undefined?base.alpha:1);
  applyTf(c,base);
  if(rings){
    if(rings.length){
      var p=ringsToPath(rings);
      if(base.render==='fill'||base.render==='both'){ c.fillStyle=paintFor(c,base); c.fill(p,'evenodd'); }
      if(base.render==='draw'||base.render==='both'){ applyStroke(c,base,z); c.stroke(p); c.setLineDash([]); }
    }
  } else rasterGroup(c,grp);
  c.restore();
}

function paintAll(c,z,actives,solid){
  var sc=clipScopes(), open=0;         // how many canvas clips are currently pushed
  function reopen(want){               // unwind to the depth this layer belongs at
    while(open>want){ c.restore(); open--; }
  }
  groups().forEach(function(g){
    var base=g[0], idx=S.layers.indexOf(base);
    var depth=(idx>=0&&sc[idx])?sc[idx].length:0;
    reopen(depth);
    if(base.isClip&&g.length===1){
      var cp=shapePath(base);
      if(cp&&clipOwns(idx)){       // a region with nothing under it clips nothing
        if(!solid){                  // the dashed guide is for the sheet only
          c.save();
          c.setLineDash([6/z,4/z]); c.lineWidth=1/z; c.strokeStyle=rgba('#b02f4c',.7);
          c.stroke(cp); c.setLineDash([]);
          c.restore();
        }
        c.save(); open++;            // nested clips intersect, they do not replace
        c.clip(cp);
      } else if(cp&&!solid){       // still show the region so it can be found
        c.save();
        c.setLineDash([6/z,4/z]); c.lineWidth=1/z; c.strokeStyle=rgba('#b02f4c',.35);
        c.stroke(cp); c.setLineDash([]);
        c.restore();
      }
      return;
    }
    paintGroup(c,g,z,actives,solid);
  });
  reopen(0);
}

function draw(){
  var dpr=window.devicePixelRatio||1, z=S.view.z;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,VW,VH);
  ctx.fillStyle='#e3e8de'; ctx.fillRect(0,0,VW,VH);
  ctx.imageSmoothingEnabled=S.aa;

  ctx.save();
  ctx.beginPath();
  ctx.rect(GUT,GUT,Math.max(0,VW-GUT),Math.max(0,VH-GUT));
  ctx.clip();
  ctx.translate(GUT+S.view.x,GUT+S.view.y);
  ctx.scale(z,z);

  ctx.fillStyle=sheetBg(); ctx.fillRect(0,0,S.W,S.H);
  if(S.img&&!S.imgTop) drawImg();
  if(S.showGrid) drawGrid();
  if(S.img&&S.imgTop) drawImg();

  // solidView paints every shape at its real alpha, the way the panel will look;
  // otherwise anything outside the selection drops to 45% so the selection reads
  paintAll(ctx,z,selObjs(),S.solidView);
  drawSelOutlines();
  if(L()&&L().visible) drawHandles();
  drawRotHandle();
  drawScaleHandles();
  drawSelSize();
  if(S.marquee) drawMarquee();
  drawMeasures();

  ctx.lineWidth=1/z; ctx.strokeStyle='#b9c6bd';
  ctx.strokeRect(0,0,S.W,S.H);
  ctx.restore();

  drawGuides(); drawRulers();
  pvSchedule();
  if(textEdit) placeTextEditor();
}

function drawImg(){
  var im=S.img;
  ctx.save();
  ctx.beginPath(); ctx.rect(0,0,S.W,S.H); ctx.clip();
  ctx.globalAlpha=im.alpha;
  ctx.drawImage(im.el,im.x,im.y,im.natW*im.scale,im.natH*im.scale);
  ctx.globalAlpha=1;
  if(S.tool==='image'&&!S.imgLock){
    ctx.strokeStyle=rgba('#b02f4c',.8);
    ctx.setLineDash([5/S.view.z,4/S.view.z]); ctx.lineWidth=1/S.view.z;
    ctx.strokeRect(im.x,im.y,im.natW*im.scale,im.natH*im.scale);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/* Swing has no "unset" background: JPanel is opaque, so super.paintComponent
   fills with getBackground(). With nothing emitted that is the look-and-feel's
   control colour, never white -- which is what the sheet used to imply. */
var LAF_BG='#eeeeee';                  // Metal's default; the platform varies
function sheetBg(){ return S.bgSet?S.bg:LAF_BG; }

var GRID_DEFAULTS={gridColor:'#c3cdc1',gridOpacity:1,gridWidth:1,gridMajor:4,gridStyle:'lines'};
var MINOR_FADE=0.35;   // keeps the default look close to the old fixed palette

function drawGrid(){
  var g=S.grid, z=S.view.z;
  if(g*z<4) return;
  var N=Math.max(2,Math.round(S.gridMajor)||4);
  var showMinor=g*z>=9;
  var majA=S.gridOpacity, minA=S.gridOpacity*MINOR_FADE;
  function isMaj(v){ return Math.round(v/g)%N===0; }
  if(S.gridStyle==='dots'||S.gridStyle==='cross'){ drawGridMarks(g,N,showMinor,majA,minA,isMaj); return; }
  ctx.lineWidth=S.gridWidth/z;
  var x,y;
  for(x=0;x<=S.W;x+=g){
    var maj=isMaj(x); if(!maj&&!showMinor) continue;
    ctx.strokeStyle=rgba(S.gridColor,maj?majA:minA);
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,S.H); ctx.stroke();
  }
  for(y=0;y<=S.H;y+=g){
    var mj=isMaj(y); if(!mj&&!showMinor) continue;
    ctx.strokeStyle=rgba(S.gridColor,mj?majA:minA);
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(S.W,y); ctx.stroke();
  }
}

// dots and crosses mark the intersections without laying lines over the artwork
function drawGridMarks(g,N,showMinor,majA,minA,isMaj){
  var z=S.view.z;
  var cells=(S.W/g+1)*(S.H/g+1);
  if(cells>40000){ showMinor=false; if(cells/(N*N)>40000) return; }
  var r=Math.max(0.6,S.gridWidth)/z;
  var arm=r*2.2;
  ctx.lineWidth=Math.max(0.6,S.gridWidth)/z;
  ctx.lineCap='butt';
  for(var x=0;x<=S.W;x+=g){
    var mx=isMaj(x);
    for(var y=0;y<=S.H;y+=g){
      var maj=mx&&isMaj(y);
      if(!maj&&!showMinor) continue;
      var col=rgba(S.gridColor,maj?majA:minA);
      if(S.gridStyle==='dots'){
        ctx.fillStyle=col;
        ctx.beginPath(); ctx.arc(x,y,maj?r*1.7:r,0,Math.PI*2); ctx.fill();
      } else {
        var a=maj?arm*1.6:arm;
        ctx.strokeStyle=col;
        ctx.beginPath();
        ctx.moveTo(x-a,y); ctx.lineTo(x+a,y);
        ctx.moveTo(x,y-a); ctx.lineTo(x,y+a);
        ctx.stroke();
      }
    }
  }
}

// every other selected shape gets a quiet outline so multi-select is visible
function drawSelOutlines(){
  if(S.selLayers.length<2) return;
  var z=S.view.z;
  ctx.save();
  ctx.setLineDash([5/z,4/z]); ctx.lineWidth=1/z; ctx.strokeStyle=rgba('#2f6f8f',.75);
  S.selLayers.forEach(function(i){
    var l=S.layers[i];
    if(!l||i===S.active||!l.visible) return;
    var b=layerBounds(l); if(!b) return;
    var T=tfMapper(l);
    var c0=T(b.x0,b.y0),c1=T(b.x1,b.y0),c2=T(b.x1,b.y1),c3=T(b.x0,b.y1);
    ctx.beginPath();
    ctx.moveTo(c0.x,c0.y); ctx.lineTo(c1.x,c1.y);
    ctx.lineTo(c2.x,c2.y); ctx.lineTo(c3.x,c3.y);
    ctx.closePath(); ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.restore();
}

function drawHandles(){
  var l=L(),z=S.view.z, px=function(n){ return n/z; };
  if(!l) return;
  var T=tfMapper(l);
  if(l.kind!=='path'){
    var b=layerBounds(l); if(!b) return;
    var c0=T(b.x0,b.y0),c1=T(b.x1,b.y0),c2=T(b.x1,b.y1),c3=T(b.x0,b.y1);
    ctx.save();
    ctx.setLineDash([4/z,3/z]); ctx.lineWidth=1/z; ctx.strokeStyle=rgba('#b02f4c',.6);
    ctx.beginPath();
    ctx.moveTo(c0.x,c0.y); ctx.lineTo(c1.x,c1.y);
    ctx.lineTo(c2.x,c2.y); ctx.lineTo(c3.x,c3.y);
    ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    var g=norm(l.g), ctr=T(g.x+g.w/2,g.y+g.h/2);
    handles(l).forEach(function(h){
      var q=T(h.x,h.y);
      if(h.key==='as'||h.key==='ae'){
        // arc edges: a guide out from the centre, and a round grab point
        ctx.save();
        ctx.strokeStyle=rgba('#2f6f8f',.5); ctx.lineWidth=px(1);
        ctx.setLineDash([px(3),px(3)]);
        ctx.beginPath(); ctx.moveTo(ctr.x,ctr.y); ctx.lineTo(q.x,q.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(q.x,q.y,px(5.5),0,Math.PI*2);
        ctx.fillStyle=(h.key==='as')?'#2f6f8f':'#fff';
        ctx.fill();
        ctx.strokeStyle='#2f6f8f'; ctx.lineWidth=px(2); ctx.stroke();
        ctx.restore();
        return;
      }
      var s=px(4.5);
      ctx.fillStyle='#fff'; ctx.strokeStyle='#b02f4c'; ctx.lineWidth=px(1.6);
      ctx.fillRect(q.x-s,q.y-s,s*2,s*2); ctx.strokeRect(q.x-s,q.y-s,s*2,s*2);
    });
    return;
  }
  if(!l.pts.length) return;

  ctx.lineWidth=px(1); ctx.setLineDash([px(3),px(3)]);
  ctx.strokeStyle=rgba('#b02f4c',.55);
  l.pts.forEach(function(p,i){
    var prev=i>0?l.pts[i-1]:null; if(!prev) return;
    var pp=T(prev.x,prev.y), pe=T(p.x,p.y);
    if(p.cmd==='quad'){
      var pc=T(p.cx,p.cy);
      ctx.beginPath(); ctx.moveTo(pp.x,pp.y); ctx.lineTo(pc.x,pc.y); ctx.lineTo(pe.x,pe.y); ctx.stroke();
    }
    if(p.cmd==='cubic'){
      var q1=T(p.c1x,p.c1y), q2=T(p.c2x,p.c2y);
      ctx.beginPath(); ctx.moveTo(pp.x,pp.y); ctx.lineTo(q1.x,q1.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pe.x,pe.y); ctx.lineTo(q2.x,q2.y); ctx.stroke();
    }
  });
  ctx.setLineDash([]);

  var drawing=(S.tool==='line'||S.tool==='quad'||S.tool==='cubic');
  if(S.hover&&drawing&&!S.drag&&!S.nextIsMove){
    var la=l.pts[l.pts.length-1], lp=T(la.x,la.y), hv=T(S.hover.x,S.hover.y);
    ctx.setLineDash([px(4),px(4)]); ctx.strokeStyle='rgba(92,107,115,.5)';
    ctx.beginPath(); ctx.moveTo(lp.x,lp.y); ctx.lineTo(hv.x,hv.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  handles(l).forEach(function(h){
    if(h.key==='a') return;
    var q=T(h.x,h.y);
    var s=px(4), isSel=S.sel&&S.sel.i===h.i&&S.sel.key===h.key;
    ctx.fillStyle=isSel?'#b02f4c':'#fff';
    ctx.strokeStyle='#b02f4c'; ctx.lineWidth=px(1.5);
    ctx.fillRect(q.x-s,q.y-s,s*2,s*2); ctx.strokeRect(q.x-s,q.y-s,s*2,s*2);
  });
  var showLabels=S.labels&&z>=.55;
  if(showLabels) ctx.font='600 '+px(10)+'px "IBM Plex Mono",monospace';
  l.pts.forEach(function(p,i){
    var q=T(p.x,p.y);
    var last=(i===l.pts.length-1);
    var isSel=S.sel&&S.sel.i===i&&S.sel.key==='a';
    ctx.beginPath(); ctx.arc(q.x,q.y,px(5),0,Math.PI*2);
    ctx.fillStyle=isSel?'#b02f4c':'#fff'; ctx.fill();
    ctx.lineWidth=px(2);
    ctx.strokeStyle=isSel?'#7d1f36':(last?'#b02f4c':l.strokeColor);
    ctx.stroke();
    if(!showLabels) return;
    var label=(i+1)+' ('+p.x+','+p.y+')';
    var tw=ctx.measureText(label).width;
    var lx=Math.min(q.x+px(9),S.W-tw-px(3)), ly=Math.max(q.y-px(8),px(11));
    ctx.fillStyle='rgba(255,255,255,.82)';
    ctx.fillRect(lx-px(2),ly-px(9),tw+px(4),px(12));
    ctx.fillStyle=last?'#b02f4c':'#17242b';
    ctx.fillText(label,lx,ly);
  });
}

function drawRotHandle(){
  var h=rotHandle(); if(!h) return;
  var z=S.view.z, px=function(n){ return n/z; };
  ctx.save();
  ctx.strokeStyle=rgba('#2f6f8f',.65); ctx.lineWidth=px(1.4);
  ctx.beginPath(); ctx.moveTo(h.x,h.top); ctx.lineTo(h.x,h.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(h.x,h.y,px(6),0,Math.PI*2);
  ctx.fillStyle=S.rotDrag?'#2f6f8f':'#fff'; ctx.fill();
  ctx.strokeStyle='#2f6f8f'; ctx.lineWidth=px(2); ctx.stroke();
  // a small tick so it reads as "turn me" rather than another corner
  ctx.beginPath(); ctx.arc(h.x,h.y,px(2.2),-0.6,Math.PI*1.25);
  ctx.strokeStyle=S.rotDrag?'#fff':'#2f6f8f'; ctx.lineWidth=px(1.2); ctx.stroke();
  if(S.rotDrag){
    ctx.setLineDash([px(4),px(4)]); ctx.lineWidth=px(1);
    ctx.strokeStyle=rgba('#2f6f8f',.5);
    ctx.beginPath(); ctx.arc(h.pivot.x,h.pivot.y,Math.hypot(h.x-h.pivot.x,h.y-h.pivot.y),0,Math.PI*2);
    ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}
function scaleArmed(){ return S.scaleMod||!!S.scaleDrag; }
function drawScaleHandles(){
  if(!scaleArmed()) return;
  var sh=scaleHandles(); if(!sh) return;
  var z=S.view.z, px=function(n){ return n/z; }, live=!!S.scaleDrag;
  var a=sh.grips[0], c=sh.grips[2];
  ctx.save();
  ctx.setLineDash([px(3),px(3)]); ctx.lineWidth=px(1);
  ctx.strokeStyle=rgba('#2f6f8f',live?.85:.4);
  ctx.strokeRect(a.x,a.y,c.x-a.x,c.y-a.y);
  ctx.setLineDash([]);
  // square and blue, so they read apart from the shape's own red grips
  var s=px(4.5);
  ctx.lineWidth=px(1.8); ctx.strokeStyle='#2f6f8f';
  sh.grips.forEach(function(g){
    ctx.fillStyle=live?'#2f6f8f':'#fff';
    ctx.fillRect(g.x-s,g.y-s,s*2,s*2);
    ctx.strokeRect(g.x-s,g.y-s,s*2,s*2);
  });
  ctx.restore();
}
/* A size readout on the selection: the figure you are about to type into the
   Java, sitting where you are already looking. A single shape reports its own
   geometry -- what Rectangle2D.Double actually receives -- rather than the
   axis-aligned box a rotation would inflate it to, so the number matches the
   output. A multi-selection has no geometry of its own, so it reports the
   combined extent, which is what its box is drawn around anyway. */
function selSize(){
  if(S.selLayers.length===1){
    var l=S.layers[S.selLayers[0]];
    if(!l||!l.visible) return null;
    var b=layerBounds(l), box=layerBox(l);
    return (b&&box)?{w:b.x1-b.x0,h:b.y1-b.y0,box:box}:null;
  }
  var sb=selScreenBox();
  return sb?{w:sb.x1-sb.x0,h:sb.y1-sb.y0,box:sb}:null;
}
function drawSelSize(){
  // shown while sizing something: a selection, a fresh drag-out, a scale
  if(S.tool!=='select'&&!S.newDrag&&!S.scaleDrag) return;
  var d=selSize();
  if(!d||(d.w<0.5&&d.h<0.5)) return;
  var z=S.view.z;
  ctx.save();
  measPill(ctx,(d.box.x0+d.box.x1)/2,d.box.y1+15/z,
           mnum(d.w)+' \u00d7 '+mnum(d.h),z,'#2f6f8f');
  ctx.restore();
}
function drawMarquee(){
  var m=S.marquee, z=S.view.z;
  var x=Math.min(m.x0,m.x1), y=Math.min(m.y0,m.y1);
  var w=Math.abs(m.x1-m.x0), h=Math.abs(m.y1-m.y0);
  ctx.save();
  ctx.fillStyle='rgba(47,111,143,.11)';
  ctx.fillRect(x,y,w,h);
  ctx.setLineDash([4/z,3/z]); ctx.lineWidth=1/z; ctx.strokeStyle=rgba('#2f6f8f',.9);
  ctx.strokeRect(x,y,w,h);
  ctx.setLineDash([]);
  ctx.restore();
}
function hitRot(x,y){
  var h=rotHandle(); if(!h) return null;
  return Math.hypot(h.x-x,h.y-y)<12/S.view.z?h:null;
}

function drawGuides(){
  if(!S.hover||S.drag||S.tool==='pan'||S.tool==='image') return;
  var z=S.view.z;
  var sx=GUT+S.view.x+S.hover.x*z, sy=GUT+S.view.y+S.hover.y*z;
  ctx.save();
  ctx.beginPath(); ctx.rect(GUT,GUT,VW-GUT,VH-GUT); ctx.clip();
  ctx.strokeStyle=rgba('#b02f4c',.5); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(Math.round(sx)+.5,GUT); ctx.lineTo(Math.round(sx)+.5,VH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(GUT,Math.round(sy)+.5); ctx.lineTo(VW,Math.round(sy)+.5); ctx.stroke();
  ctx.restore();
}

var TICKS=[1,2,5,10,20,25,50,100,200,250,500,1000];
function tickStep(z){ for(var i=0;i<TICKS.length;i++) if(TICKS[i]*z>=62) return TICKS[i];
  return TICKS[TICKS.length-1]; }
function drawRulers(){
  var z=S.view.z, step=tickStep(z), minor=step/(step%2===0?2:5);
  ctx.fillStyle='#eef1ea';
  ctx.fillRect(0,0,VW,GUT); ctx.fillRect(0,0,GUT,VH);
  ctx.strokeStyle='#b9c6bd'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,GUT-.5); ctx.lineTo(VW,GUT-.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(GUT-.5,0); ctx.lineTo(GUT-.5,VH); ctx.stroke();
  ctx.font='500 11.5px "IBM Plex Mono",monospace';
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  var x0=Math.floor((-S.view.x/z)/minor)*minor, x1=(VW-GUT-S.view.x)/z;
  for(var x=x0;x<=x1;x+=minor){
    var sx=GUT+S.view.x+x*z; if(sx<GUT-1) continue;
    var maj=Math.abs(x%step)<1e-6;
    ctx.strokeStyle=maj?'#8d9d92':'#c8d1c6';
    ctx.beginPath(); ctx.moveTo(Math.round(sx)+.5,maj?GUT-9:GUT-5);
    ctx.lineTo(Math.round(sx)+.5,GUT-1); ctx.stroke();
    if(maj){ ctx.fillStyle='#5c6b73'; ctx.fillText(String(Math.round(x)),sx,GUT-13); }
  }
  ctx.textAlign='right';
  var y0=Math.floor((-S.view.y/z)/minor)*minor, y1=(VH-GUT-S.view.y)/z;
  for(var y=y0;y<=y1;y+=minor){
    var sy=GUT+S.view.y+y*z; if(sy<GUT-1) continue;
    var mj=Math.abs(y%step)<1e-6;
    ctx.strokeStyle=mj?'#8d9d92':'#c8d1c6';
    ctx.beginPath(); ctx.moveTo(mj?GUT-9:GUT-5,Math.round(sy)+.5);
    ctx.lineTo(GUT-1,Math.round(sy)+.5); ctx.stroke();
    if(mj){
      ctx.fillStyle='#5c6b73';
      var txt=String(Math.round(y));
      // right-aligned, but never let a long label run off the left edge
      ctx.fillText(txt,Math.max(ctx.measureText(txt).width+2,GUT-11),sy+4);
    }
  }
  if(S.hover){
    var hx=GUT+S.view.x+S.hover.x*z, hy=GUT+S.view.y+S.hover.y*z;
    ctx.fillStyle='#b02f4c';
    if(hx>=GUT){ ctx.beginPath(); ctx.moveTo(hx,GUT-2); ctx.lineTo(hx-4,GUT-9);
                 ctx.lineTo(hx+4,GUT-9); ctx.closePath(); ctx.fill(); }
    if(hy>=GUT){ ctx.beginPath(); ctx.moveTo(GUT-2,hy); ctx.lineTo(GUT-9,hy-4);
                 ctx.lineTo(GUT-9,hy+4); ctx.closePath(); ctx.fill(); }
  }
  ctx.textAlign='left';
}

function renderThumb(cv,l){
  var c=cv.getContext('2d'),w=cv.width,h=cv.height,dpr=window.devicePixelRatio||1;
  c.setTransform(1,0,0,1,0,0);
  c.clearRect(0,0,w,h);
  c.fillStyle=sheetBg(); c.fillRect(0,0,w,h);
  var pad=3*dpr, z=Math.min((w-pad*2)/S.W,(h-pad*2)/S.H);
  c.save(); c.translate((w-S.W*z)/2,(h-S.H*z)/2); c.scale(z,z);
  paintSingle(c,l,true,z);
  c.restore();
}

/* ================= code generation ================= */

var RESERVED={"abstract":1,"assert":1,"boolean":1,"break":1,"byte":1,"case":1,"catch":1,"char":1,
"class":1,"const":1,"continue":1,"default":1,"do":1,"double":1,"else":1,"enum":1,"extends":1,
"final":1,"finally":1,"float":1,"for":1,"goto":1,"if":1,"implements":1,"import":1,"instanceof":1,
"int":1,"interface":1,"long":1,"native":1,"new":1,"package":1,"private":1,"protected":1,"public":1,
"return":1,"short":1,"static":1,"strictfp":1,"super":1,"switch":1,"synchronized":1,"this":1,
"throw":1,"throws":1,"transient":1,"try":1,"void":1,"volatile":1,"while":1,"true":1,"false":1,"null":1};

function javaIdent(raw){
  var words=String(raw).replace(/[^A-Za-z0-9]+/g,' ').trim().split(/\s+/),id='';
  words.forEach(function(w,i){
    if(!w) return;
    id += i===0 ? w.charAt(0).toLowerCase()+w.slice(1) : w.charAt(0).toUpperCase()+w.slice(1);
  });
  return id;
}
// the Graphics2D variable the emitted code paints through. Everything that writes
// a paint statement goes through this, so one setting renames the whole output.
function g2n(){ return S.g2Name||'g2'; }
// the identifier a name wants, before anything is done about collisions. The
// prefix keeps generated fields clear of whatever the target class already has;
// the class name itself asks for the plain form.
function javaBase(raw,plain){
  var id=javaIdent(raw);
  var pfx=plain?'':(S.varPrefix||'');
  if(pfx) id=pfx+cap(id||'shape');
  if(!id||/^[0-9]/.test(id)) id='shape'+id;
  if(RESERVED[id]) id=id+'Shape';
  return id;
}
function javaName(raw,used,plain){
  var base=javaBase(raw,plain),id=base,n=2;
  while(used[id]){ id=base+'_'+n; n++; }
  used[id]=1; return id;
}
// two names can camel-case down to the same identifier, and the generator then
// quietly suffixes the loser; the shape list says so rather than let it surprise
function nameClashes(){
  var seen={},dup={};
  S.layers.forEach(function(l){
    var id=javaBase(l.name);
    if(seen[id]) dup[id]=1; else seen[id]=1;
  });
  return dup;
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
// Every coordinate in the output goes through here. toFixed is what kills the
// float residue: Math.round(n*100)/100 cannot, because dividing puts it back.
// Trailing zeros are stripped -- the output has always been terse.
function roundTo(n,dp){
  var v=parseFloat(n);
  if(!isFinite(v)) return '0';
  dp=Math.max(0,Math.min(6,dp|0));
  var s=v.toFixed(dp);
  if(dp>0) s=s.replace(/([.][0-9]*?)0+$/,'$1').replace(/[.]$/,'');
  return (s===''||s==='-0')?'0':s;
}
function num(n){ return roundTo(n,2); }
// every length or position the drawing is made of; the one the setting moves
function coord(n){ return roundTo(n,S.precision); }
function num6(n){ return (Math.round(n*1e6)/1e6).toString(); }
function colorExpr(hex){ var c=hex2rgb(hex); return 'new Color('+c[0]+', '+c[1]+', '+c[2]+')'; }
function jstr(s){
  return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')
    .replace(/\n/g,'\\n').replace(/\r/g,'').replace(/\t/g,'\\t')+'"';
}

var IMGVARS={}, USED_IMAGES=false, USED_FRC=false;
function collectImages(used){
  IMGVARS={};
  var out=[];
  function add(src,name){
    if(!src||IMGVARS[src]) return;
    var stem=String(name||'image').replace(/\.[A-Za-z0-9]+$/,'')||'image';
    var v=javaName('img '+stem,used);
    IMGVARS[src]=v;
    out.push({v:v,name:name||'image.png',src:src});
  }
  S.layers.forEach(function(l){
    if(!l.visible) return;
    if(l.kind==='image'&&l.img&&l.img.src) add(l.img.src,l.img.name);
    if(l.paint==='texture'&&l.tex&&l.tex.src) add(l.tex.src,l.tex.name);
  });
  return out;
}

function fontDecl(v,l){
  var style = l.text.bold&&l.text.italic ? 'Font.BOLD | Font.ITALIC'
            : l.text.bold ? 'Font.BOLD' : l.text.italic ? 'Font.ITALIC' : 'Font.PLAIN';
  return 'Font font'+cap(v)+' = new Font('+jstr(l.text.family)+', '+style+', '+l.text.size+');\n';
}
// text as a real Shape, so it can join an Area the same way a path can
// Shapes are declared either inline (everything inside paintComponent) or split
// into a field plus a build step, so they are constructed once instead of on
// every repaint. `asField` picks which; `frcVar` is needed because glyph outlines
// want a FontRenderContext, and g2 does not exist outside paint.
function textParts(v,l,asField,frcVar){
  var lines=String(l.text.s||'').split('\n');
  var type=(lines.length===1)?'Shape':'Area';
  function outline(i){
    return 'font'+cap(v)+'.createGlyphVector('+frcVar+', '+jstr(lines[i])+')\n'
         +'        .getOutline('+coord(l.text.x)+'f, '+coord(l.text.y+i*l.text.size*1.2)+'f)';
  }
  var body=fontDecl(v,l), i;
  if(asField){
    body+=v+' = '+(type==='Area'?('new Area('+outline(0)+')'):outline(0))+';\n';
    for(i=1;i<lines.length;i++) body+=v+'.add(new Area('+outline(i)+'));\n';
    return {field:'private '+type+' '+v+';\n', build:body};
  }
  body+=type+' '+v+' = '+(type==='Area'?('new Area('+outline(0)+')'):outline(0))+';\n';
  for(i=1;i<lines.length;i++) body+=v+'.add(new Area('+outline(i)+'));\n';
  return {field:body, build:''};
}

function primitiveExpr(l){
  var g=norm(l.g);
  if(l.kind==='rect'){
    var rx=Math.min(l.g.rx||0,g.w/2), ry=Math.min(l.g.ry||0,g.h/2);
    if(rx>0&&ry>0) return {type:'RoundRectangle2D',
      ctor:'new RoundRectangle2D.Double('+coord(g.x)+', '+coord(g.y)+', '+coord(g.w)+', '+coord(g.h)
          +', '+coord(rx*2)+', '+coord(ry*2)+')'};
    return {type:'Rectangle2D',
      ctor:'new Rectangle2D.Double('+coord(g.x)+', '+coord(g.y)+', '+coord(g.w)+', '+coord(g.h)+')'};
  }
  if(l.kind==='ellipse') return {type:'Ellipse2D',
    ctor:'new Ellipse2D.Double('+coord(g.x)+', '+coord(g.y)+', '+coord(g.w)+', '+coord(g.h)+')'};
  if(l.kind==='arc') return {type:'Arc2D',
    ctor:'new Arc2D.Double('+coord(g.x)+', '+coord(g.y)+', '+coord(g.w)+', '+coord(g.h)+', '
        +num(l.g.start)+', '+num(l.g.extent)+', Arc2D.'+l.g.arcType+')'};
  return null;
}

function declParts(v,l,asField,frcVar){
  if(l.kind==='image') return {field:'',build:''};
  if(l.kind==='text') return textParts(v,l,asField,frcVar||g2n()+'.getFontRenderContext()');
  if(l.kind==='path'){
    var cls=l.shapeClass||'GeneralPath';
    if(cls==='Polygon'&&polygonal(l)){
      var xs=[],ys=[];
      l.pts.forEach(function(p){ xs.push(Math.round(p.x)); ys.push(Math.round(p.y)); });
      var arrays='int[] '+v+'X = {'+xs.join(', ')+'};\n'
                +'int[] '+v+'Y = {'+ys.join(', ')+'};\n';
      var make='new Polygon('+v+'X, '+v+'Y, '+xs.length+')';
      if(asField) return {field:'private Polygon '+v+';\n', build:arrays+v+' = '+make+';\n'};
      return {field:arrays+'Polygon '+v+' = '+make+';\n', build:''};
    }
    if(cls==='Polygon') cls='GeneralPath';   // curves crept in since it was picked
    var wind=(l.wind==='evenodd')
      ? (cls==='GeneralPath'?'GeneralPath.WIND_EVEN_ODD':'Path2D.WIND_EVEN_ODD') : '';
    var ctor='new '+cls+'('+wind+')';
    var body='', open=false;
    l.pts.forEach(function(p){
      if(p.cmd==='move'){
        if(open&&l.closed) body+=v+'.closePath();\n';
        body+=v+'.moveTo('+coord(p.x)+', '+coord(p.y)+');\n'; open=true;
      }
      else if(p.cmd==='line')  body+=v+'.lineTo('+coord(p.x)+', '+coord(p.y)+');\n';
      else if(p.cmd==='quad')  body+=v+'.quadTo('+coord(p.cx)+', '+coord(p.cy)+', '+coord(p.x)+', '+coord(p.y)+');\n';
      else if(p.cmd==='cubic') body+=v+'.curveTo('+coord(p.c1x)+', '+coord(p.c1y)+', '+coord(p.c2x)+', '+coord(p.c2y)+', '+coord(p.x)+', '+coord(p.y)+');\n';
    });
    if(open&&l.closed) body+=v+'.closePath();\n';
    if(asField) return {field:'private final '+cls+' '+v+' = '+ctor+';\n', build:body};
    return {field:cls+' '+v+' = '+ctor+';\n', build:body};
  }
  var e=primitiveExpr(l);
  if(!e) return {field:'',build:''};
  if(asField) return {field:'private final '+e.type+' '+v+' = '+e.ctor+';\n', build:''};
  return {field:e.type+' '+v+' = '+e.ctor+';\n', build:''};
}

// a group member keeps its own transform by baking it into the shape
function tfBake(v,l,baseInv){
  var m=relMatrix(l,baseInv);
  if(isIdentity(m)) return {code:'',name:v};
  var tv='tx'+cap(v);
  return {code:'AffineTransform '+tv+' = new AffineTransform('
      +num6(m.a)+', '+num6(m.b)+', '+num6(m.c)+', '
      +num6(m.d)+', '+num6(m.e)+', '+num6(m.f)+');\n'
      +'Shape '+v+'T = '+tv+'.createTransformedShape('+v+');\n',
    name:v+'T'};
}

function paintStmt(l){
  if(l.paint==='linear'){
    var e=gradEnds(l);
    return g2n()+'.setPaint(new GradientPaint('+coord(e.x1)+'f, '+coord(e.y1)+'f, '+colorExpr(l.fillColor)
         +', '+coord(e.x2)+'f, '+coord(e.y2)+'f, '+colorExpr(l.fillColor2)+'));\n';
  }
  if(l.paint==='radial'){
    var q=gradEnds(l);
    return g2n()+'.setPaint(new RadialGradientPaint(new Point2D.Float('+coord(q.cx)+'f, '+coord(q.cy)+'f), '
         +coord(q.r)+'f,\n        new float[]{0f, 1f},\n        new Color[]{'
         +colorExpr(l.fillColor)+', '+colorExpr(l.fillColor2)+'}));\n';
  }
  if(l.paint==='texture'&&l.tex&&l.tex.src&&IMGVARS[l.tex.src]){
    return g2n()+'.setPaint(new TexturePaint('+IMGVARS[l.tex.src]+', new Rectangle2D.Double('
         +coord(l.tex.x)+', '+coord(l.tex.y)+', '+coord(l.tex.w)+', '+coord(l.tex.h)+')));\n';
  }
  return g2n()+'.setColor('+colorExpr(l.fillColor)+');\n';
}

function strokeStmt(l){
  var w=num(l.strokeW)+'f';
  var d=dashArray(l);
  if(isStrokeDefault(l)) return g2n()+'.setStroke(new BasicStroke('+w+'));\n';
  var capC='BasicStroke.CAP_'+String(l.cap).toUpperCase();
  var joinC='BasicStroke.JOIN_'+String(l.join).toUpperCase();
  var ml=num(Math.max(1,l.miter||10))+'f';
  if(!d) return g2n()+'.setStroke(new BasicStroke('+w+', '+capC+', '+joinC+', '+ml+'));\n';
  return g2n()+'.setStroke(new BasicStroke('+w+', '+capC+', '+joinC+', '+ml+',\n'
       +'        new float[]{'+d.map(function(n){ return num(n)+'f'; }).join(', ')+'}, '
       +num(l.dashPhase||0)+'f));\n';
}

function tfOpen(l,v){
  if(!hasTf(l)) return '';
  var c=centreOf(l), t=l.tf, s='';
  s+='AffineTransform tx'+cap(v)+' = '+g2n()+'.getTransform();\n';
  s+=g2n()+'.translate('+coord(c.x)+', '+coord(c.y)+');\n';
  if(t.rot) s+=g2n()+'.rotate(Math.toRadians('+num(t.rot)+'));\n';
  if(t.sx!==1||t.sy!==1) s+=g2n()+'.scale('+num(t.sx)+', '+num(t.sy)+');\n';
  if(t.shx||t.shy) s+=g2n()+'.shear('+num(t.shx)+', '+num(t.shy)+');\n';
  s+=g2n()+'.translate('+coord(-c.x)+', '+coord(-c.y)+');\n';
  return s;
}
function tfClose(l,v){ return hasTf(l)?(g2n()+'.setTransform(tx'+cap(v)+');\n'):''; }
function alphaOpen(l,v){
  if(l.alpha===undefined||l.alpha>=1) return '';
  return 'Composite comp'+cap(v)+' = '+g2n()+'.getComposite();\n'
       + g2n()+'.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, '+num(l.alpha)+'f));\n';
}
function alphaClose(l,v){
  return (l.alpha===undefined||l.alpha>=1)?'':(g2n()+'.setComposite(comp'+cap(v)+');\n');
}

function textBlock(l,v){
  var out=fontDecl(v,l);
  out+=g2n()+'.setFont(font'+cap(v)+');\n';
  var lines=String(l.text.s||'').split('\n');
  lines.forEach(function(line,i){
    var yy=Math.round(l.text.y+i*l.text.size*1.2);
    if(l.render==='fill'||l.render==='both'){
      out+=paintStmt(l);
      out+=g2n()+'.drawString('+jstr(line)+', '+coord(l.text.x)+', '+yy+');\n';
    }
    if(l.render==='draw'||l.render==='both'){
      out+='Shape outline'+cap(v)+(i?String(i+1):'')+' = font'+cap(v)
         +'.createGlyphVector('+g2n()+'.getFontRenderContext(), '+jstr(line)+')\n'
         +'        .getOutline('+coord(l.text.x)+'f, '+yy+'f);\n';
      out+=g2n()+'.setColor('+colorExpr(l.strokeColor)+');\n';
      out+=strokeStmt(l);
      out+=g2n()+'.draw(outline'+cap(v)+(i?String(i+1):'')+');\n';
    }
  });
  return out;
}

function drawableIn(l){
  if(l.kind==='text') return String(l.text.s||'').length>0;
  if(l.kind==='image') return !!(l.img&&l.img.src);
  if(l.kind==='path') return l.pts.length>0;
  var g=norm(l.g); return g.w>0&&g.h>0;
}

function buildOnceOn(){
  var el=document.getElementById('buildOnce');
  return !!(el&&el.checked);
}

// Produces three streams. In "build once" mode the shapes become fields built a
// single time; otherwise everything lands in the paint stream exactly as before.
function genParts(split){
  var used={}, F='', B='', P='', first=true;
  var SC=clipScopes(), clipStack=[];   // saved-clip names, innermost last
  var frc=split?'FRC':g2n()+'.getFontRenderContext()';
  var imgs=collectImages(used);
  USED_IMAGES=imgs.length>0;
  USED_FRC=false;

  if(imgs.length){
    if(split){
      imgs.forEach(function(im){ F+='private BufferedImage '+im.v+';\n'; });
      B+='// keep these files beside the class\n';
      B+='try {\n';
      imgs.forEach(function(im){ B+='    '+im.v+' = ImageIO.read(new File('+jstr(im.name)+'));\n'; });
      B+='} catch (IOException ex) {\n    ex.printStackTrace();\n}\n';
    } else {
      P+='// images: keep these files beside the class\n';
      imgs.forEach(function(im){ P+='BufferedImage '+im.v+' = null;\n'; });
      P+='try {\n';
      imgs.forEach(function(im){ P+='    '+im.v+' = ImageIO.read(new File('+jstr(im.name)+'));\n'; });
      P+='} catch (IOException ex) {\n    ex.printStackTrace();\n}\n';
      first=false;
    }
  }
  function put(parts){
    if(split){ F+=parts.field; B+=parts.build; }
    else { P+=parts.field+parts.build; }
  }
  function local(parts){   // group members are only used while building the Area
    if(split){ B+=parts.field+parts.build; }
    else { P+=parts.field+parts.build; }
  }

  groups().forEach(function(grp){
    var base=grp[0];
    var drawable=grp.filter(drawableIn);
    if(!drawable.length) return;
    // An empty member is dropped above because add, subtract and exclusiveOr all
    // leave the running Area alone -- but intersect does not, it empties it, and
    // quietly dropping the member would have the code draw a shape the sheet does
    // not. Java would arrive at nothing here, so the output says nothing too.
    var emptied=grp.some(function(l,i){
      return i>0&&!drawableIn(l)&&l.combine==='intersect';
    });
    if(emptied){
      if(!first) P+='\n';
      first=false;
      P+='// '+base.name+': an empty shape is intersected into this run, so the Area\n'
        +'// comes out empty and there is nothing to paint\n';
      return;
    }
    if(!first) P+='\n';
    first=false;

    // leaving a clip's run restores whatever clip was active before it
    var bi=S.layers.indexOf(base), bd=(bi>=0&&SC[bi])?SC[bi].length:0;
    var closed=0;
    while(clipStack.length>bd){ P+=g2n()+'.setClip('+clipStack.pop()+');\n'; closed++; }
    if(closed) P+='\n';           // let the restored scope breathe

    if(base.isClip&&grp.length===1){
      if(!clipOwns(bi)) return;    // nothing is nested under it, so emit nothing
      var cv=javaName(base.name,used);
      P+='// clip region: '+base.name+'\n';
      put(declParts(cv,base,split,frc));
      var sv='savedClip'+(clipStack.length?String(clipStack.length+1):'');
      P+='Shape '+sv+' = '+g2n()+'.getClip();\n';
      // clip() intersects with what is already active so nested regions compose;
      // setClip() would throw the outer region away
      P+=g2n()+'.clip('+cv+');\n';
      clipStack.push(sv);
      return;
    }

    if(drawable.length===1){
      var l=drawable[0], v=javaName(l.name,used);
      P+='// '+l.name+(l.group?'  [group]':'')+'\n';
      if(l.kind!=='text'&&l.kind!=='image') put(declParts(v,l,split,frc));
      P+=alphaOpen(l,v);
      P+=tfOpen(l,v);
      if(l.kind==='text') P+=textBlock(l,v);
      else if(l.kind==='image'){
        var gi=norm(l.g);
        P+=g2n()+'.drawImage('+IMGVARS[l.img.src]+', '+coord(gi.x)+', '+coord(gi.y)+', '
          +coord(gi.w)+', '+coord(gi.h)+', null);\n';
      } else {
        if(l.render==='fill'||l.render==='both'){ P+=paintStmt(l); P+=g2n()+'.fill('+v+');\n'; }
        if(l.render==='draw'||l.render==='both'){
          P+=g2n()+'.setColor('+colorExpr(l.strokeColor)+');\n';
          P+=strokeStmt(l);
          P+=g2n()+'.draw('+v+');\n';
        }
      }
      P+=tfClose(l,v);
      P+=alphaClose(l,v);
      return;
    }

    // Area group: members keep their own transforms, relative to the base
    P+='// '+drawable.map(function(x){ return x.name; }).join(' → ')+'\n';
    var bm=tfMatrix(base), baseInv=null;
    if(bm){ try{ baseInv=bm.inverse(); }catch(e){ baseInv=null; } }
    var names=drawable.map(function(x){ return javaName(x.name,used); });
    var parts=[];
    drawable.forEach(function(x,i){
      local(declParts(names[i],x,false,frc));
      if(x.kind==='text') USED_FRC=USED_FRC||split;
      var bake=tfBake(names[i],x,baseInv);
      if(split) B+=bake.code; else P+=bake.code;
      parts.push(bake.name);
    });
    var av=javaName(drawable[0].name+' area',used);
    var areaBuild='Area '+av+' = new Area('+parts[0]+');\n';
    for(var i=1;i<drawable.length;i++)
      areaBuild+=av+'.'+drawable[i].combine+'(new Area('+parts[i]+'));\n';
    if(split){
      F+='private Area '+av+';\n';
      B+=areaBuild.replace('Area '+av+' = ',av+' = ')+'\n';
    } else P+=areaBuild;

    P+=alphaOpen(base,av);
    P+=tfOpen(base,av);
    if(base.render==='fill'||base.render==='both'){ P+=paintStmt(base); P+=g2n()+'.fill('+av+');\n'; }
    if(base.render==='draw'||base.render==='both'){
      P+=g2n()+'.setColor('+colorExpr(base.strokeColor)+');\n';
      P+=strokeStmt(base);
      P+=g2n()+'.draw('+av+');\n';
    }
    P+=tfClose(base,av);
    P+=alphaClose(base,av);
  });

  if(clipStack.length) P+='\n';
  while(clipStack.length) P+=g2n()+'.setClip('+clipStack.pop()+');\n';
  if(split&&USED_FRC)
    F='private static final FontRenderContext FRC = new FontRenderContext(null, true, true);\n'+F;
  return {fields:F,build:B,paint:P};
}

function generate(){
  var split=buildOnceOn();
  var g=genParts(split);
  if(!g.paint.trim()) return '';
  var setup=bgSetup();
  var head=setup?'// ---- panel: call this in your constructor ----\n'+setup+'\n':'';
  if(!split) return head+g.paint;
  var out=head;
  if(g.fields.trim()) out+='// ---- fields: declare these in your class ----\n'+g.fields+'\n';
  if(g.build.trim()) out+='// ---- build once: call this from your constructor ----\n'+g.build+'\n';
  out+='// ---- paintComponent ----\n'+g.paint;
  return out;
}

function indent(t,p){ return t.split('\n').map(function(l){ return l.trim()===''?'':p+l; }).join('\n'); }

function classNameOf(){
  var id=javaName(document.getElementById('className').value||'ShapePanel',{},true);
  return cap(id);
}

function classImports(){
  var s='import java.awt.*;\nimport java.awt.geom.*;\nimport javax.swing.*;\n';
  if(USED_FRC) s+='import java.awt.font.FontRenderContext;\n';
  if(USED_IMAGES) s+='import java.awt.image.BufferedImage;\nimport javax.imageio.ImageIO;\n'
                    +'import java.io.File;\nimport java.io.IOException;\n';
  return s;
}
function bgSetup(){
  return S.bgSet?('setBackground('+colorExpr(S.bg)+');\n'):'';
}
function hintsBlock(){
  return S.aa?'        '+g2n()+'.setRenderingHint(RenderingHints.KEY_ANTIALIASING,\n'
             +'                            RenderingHints.VALUE_ANTIALIAS_ON);\n':'';
}
function mainBlock(cn){
  return '    public static void main(String[] args) {\n'
  +'        SwingUtilities.invokeLater(() -> {\n'
  +'            JFrame f = new JFrame("'+cn+'");\n'
  +'            f.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);\n'
  +'            f.add(new '+cn+'());\n'
  +'            f.pack();\n'
  +'            f.setLocationRelativeTo(null);\n'
  +'            f.setVisible(true);\n'
  +'        });\n'
  +'    }\n';
}

// shapes built once in the constructor; paintComponent only paints
function fullClassOnce(){
  var g=genParts(true);
  if(!g.paint.trim()) return '';
  var cn=classNameOf(), hasBuild=!!g.build.trim();
  return classImports()+'\n'
  +'public class '+cn+' extends JPanel {\n\n'
  +(g.fields.trim()?indent(g.fields.replace(/\n+$/,''),'    ')+'\n\n':'')
  +'    public '+cn+'() {\n'
  +'        setPreferredSize(new Dimension('+S.W+', '+S.H+'));\n'
  +(S.bgSet?'        '+bgSetup():'')
  +(hasBuild?'        buildShapes();\n':'')
  +'    }\n\n'
  +(hasBuild?('    private void buildShapes() {\n'
             +indent(g.build.replace(/\n+$/,''),'        ')+'\n'
             +'    }\n\n'):'')
  +'    @Override\n'
  +'    protected void paintComponent(Graphics g) {\n'
  +'        super.paintComponent(g);\n'
  +'        Graphics2D '+g2n()+' = (Graphics2D) g;\n'
  +hintsBlock()
  +'\n'+indent(g.paint.replace(/\n+$/,''),'        ')+'\n'
  +'    }\n\n'
  +mainBlock(cn)
  +'}\n';
}

function fullClass(){
  if(buildOnceOn()) return fullClassOnce();
  var body=generate();
  if(!body.trim()) return '';
  var cn=classNameOf();
  return classImports()+'\n'
  +'public class '+cn+' extends JPanel {\n\n'
  +(S.bgSet?('    public '+cn+'() {\n        '+bgSetup()+'    }\n\n'):'')
  +'    @Override\n'
  +'    protected void paintComponent(Graphics g) {\n'
  +'        super.paintComponent(g);\n'
  +'        Graphics2D '+g2n()+' = (Graphics2D) g;\n'
  +hintsBlock()
  +'\n'+indent(body.replace(/\n+$/,''),'        ')+'\n'
  +'    }\n\n'
  +'    @Override\n'
  +'    public Dimension getPreferredSize() {\n'
  +'        return new Dimension('+S.W+', '+S.H+');\n'
  +'    }\n\n'
  +mainBlock(cn)
  +'}\n';
}

function outputText(){ return S.out==='full' ? fullClass() : generate(); }

function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

function emitCode(){
  var el=document.getElementById('code'), txt=outputText();
  var blank=document.getElementById('blank'), empty=!txt.trim();
  // an empty sheet shows the title block instead of a lone comment line
  if(blank){ blank.hidden=!empty; if(empty) fillBlank(); }
  el.hidden=empty;
  if(empty){ el.innerHTML=''; return ''; }
  el.innerHTML=highlight(txt);
  return txt;
}

// keep the title block's fields honest — they mirror live state
function fillBlank(){
  var set=function(id,v){ var n=document.getElementById(id); if(n) n.textContent=v; };
  set('tbSize',S.W+' × '+S.H);
  set('tbGrid',S.snap?S.grid+' px, snapping':S.grid+' px');
  set('tbTool',(RAIL.filter(function(r){return r.id===S.tool;})[0]||{}).label||S.tool);
  set('tbOut',S.out==='full'?'full class':'fragment');
}

// strings and comments are lifted out first: "class" is itself a keyword, so a
// blind replace would rewrite the <span class="str"> markup it had just made
var KW=/\b(GeneralPath|Path2D|Polygon|Rectangle2D|RoundRectangle2D|Ellipse2D|Arc2D|Area|BasicStroke|AffineTransform|AlphaComposite|Composite|GradientPaint|RadialGradientPaint|TexturePaint|BufferedImage|ImageIO|IOException|File|Point2D|Font|Shape|Color|Dimension|Graphics2D|Graphics|JPanel|JFrame|SwingUtilities|RenderingHints|Math|new|public|protected|import|class|extends|return|void|static|try|catch|null|int|float)\b/g;
function plainCode(s){
  return esc(s).replace(KW,'<span class="kw">$1</span>')
               .replace(/(-?\d+\.?\d*)(?=[,)f])/g,'<span class="num">$1</span>');
}
function highlight(src){
  var out='', i=0, n=src.length;
  while(i<n){
    if(src.charAt(i)==='"'){
      var j=i+1;
      while(j<n){
        if(src.charAt(j)==='\\'){ j+=2; continue; }
        if(src.charAt(j)==='"'){ j++; break; }
        j++;
      }
      out+='<span class="str">'+esc(src.slice(i,j))+'</span>';
      i=j; continue;
    }
    if(src.charAt(i)==='/'&&src.charAt(i+1)==='/'){
      var k=src.indexOf('\n',i); if(k<0) k=n;
      out+='<span class="cm">'+esc(src.slice(i,k))+'</span>';
      i=k; continue;
    }
    var m=i;
    while(m<n&&src.charAt(m)!=='"'&&!(src.charAt(m)==='/'&&src.charAt(m+1)==='/')) m++;
    out+=plainCode(src.slice(i,m));
    i=m;
  }
  return out;
}

/* ================= tool rail ================= */

var ICON={
  select:'<path d="M4 3l7 17 2.5-7L20 10.5z"/>',
  line:'<path d="M4 20L20 4"/><circle cx="20" cy="4" r="2"/><circle cx="4" cy="20" r="2"/>',
  quad:'<path d="M4 19C4 9 20 9 20 19"/><circle cx="12" cy="6" r="1.8"/>',
  cubic:'<path d="M3 18c4-11 14 7 18-6"/><circle cx="8" cy="8" r="1.6"/><circle cx="16" cy="16" r="1.6"/>',
  rect:'<rect x="3.5" y="5.5" width="17" height="13" rx="2"/>',
  ellipse:'<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  arc:'<path d="M12 12L12 3.5A8.5 8.5 0 0120.5 12z"/><path d="M3.5 12a8.5 8.5 0 008.5 8.5"/>',
  text:'<path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6"/>',
  measure:'<path d="M4.5 19.5L19.5 4.5"/><path d="M2.5 17.5l4 4M17.5 2.5l4 4"/>'
         +'<path d="M8.5 12.5l2 2M12 9l2 2"/>',
  pan:'<path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1.5a1.5 1.5 0 013 0V13m0-2a1.5 1.5 0 013 0v5a5 5 0 01-5 5h-2.5a5 5 0 01-4-2L6 15.5a1.5 1.5 0 012.2-2L9.5 15"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-5-5-6 6"/>',
  zin:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 8v5M8 10.5h5"/>',
  zout:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M8 10.5h5"/>',
  fit:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  grid:'<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  snap:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3"/>',
  sub:'<path d="M12 5v14M5 12h14"/>',
  undo:'<path d="M3 8h11a5 5 0 010 10h-6"/><path d="M6 4L2.5 8 6 12"/>',
  redo:'<path d="M21 8H10a5 5 0 000 10h6"/><path d="M18 4l3.5 4L18 12"/>',
  del:'<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 115 0c0 1.7-2.5 1.8-2.5 4"/><circle cx="12" cy="17.5" r=".7" fill="currentColor"/>'
};
function icon(n){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
       +'stroke-linecap="round" stroke-linejoin="round">'+ICON[n]+'</svg>';
}
var RAIL=[
  {id:'select',type:'tool',icon:'select',label:'Select and edit',key:'V'},
  {id:'line',type:'tool',icon:'line',label:'Straight segment',key:'1'},
  {id:'quad',type:'tool',icon:'quad',label:'Quadratic curve',key:'2'},
  {id:'cubic',type:'tool',icon:'cubic',label:'Cubic curve',key:'3'},
  {sep:true},
  {id:'rect',type:'tool',icon:'rect',label:'Rectangle2D (drag out)',key:'R'},
  {id:'ellipse',type:'tool',icon:'ellipse',label:'Ellipse2D (drag out)',key:'E'},
  {id:'arc',type:'tool',icon:'arc',label:'Arc2D (drag out)',key:'A'},
  {id:'text',type:'tool',icon:'text',label:'drawString text',key:'T'},
  {sep:true},
  {id:'measure',type:'tool',icon:'measure',label:'Ruler: measure distances and angles',key:'L'},
  {id:'pan',type:'tool',icon:'pan',label:'Pan the canvas',key:'H'},
  {id:'image',type:'tool',icon:'image',label:'Trace image (click to load one)',key:'I'},
  {id:'zin',type:'act',icon:'zin',label:'Zoom in',key:'+'},
  {id:'zout',type:'act',icon:'zout',label:'Zoom out',key:'-'},
  {id:'fit',type:'act',icon:'fit',label:'Fit to window',key:'0'},
  {id:'grid',type:'toggle',icon:'grid',label:'Show grid',key:'G'},
  {id:'snap',type:'toggle',icon:'snap',label:'Snap to grid',key:'S'},
  {sep:true},
  {id:'sub',type:'act',icon:'sub',label:'Start new subpath',key:'M'},
  {id:'undo',type:'act',icon:'undo',label:'Undo',key:'Ctrl Z'},
  {id:'redo',type:'act',icon:'redo',label:'Redo',key:'Ctrl ⇧ Z'},
  {id:'del',type:'act',icon:'del',label:'Delete selected point',key:'Del'},
  {id:'help',type:'act',icon:'help',label:'Keyboard shortcuts',key:'?'}
];
var SHAPE_TOOLS={rect:1,ellipse:1,arc:1};
var HINTS={
  select:'Drag handles to reshape. Double-click a segment to insert a point. Ctrl+click to multi-select; hold Ctrl for the scale grips.',
  line:'Click to add a straight segment',
  quad:'Click to add a curve, then drag its control square',
  cubic:'Click to add a curve, then drag its two control squares',
  rect:'Drag out a rectangle; give it an arc width for RoundRectangle2D',
  ellipse:'Drag out an ellipse',
  arc:'Drag out an arc, then set start and extent angles',
  text:'Click where the text baseline should start',
  pan:'Drag to move the canvas',
  image:'Drag the photo to position it, scroll to resize',
  measure:'Click two points to measure. Ends land on endpoints, midpoints, centres and crossings'
};

/* the tool description lives bottom-left, and follows whatever you hover */
var statusEl=document.getElementById('statusbar');
var hintEl=document.getElementById('hint'), hintTag=document.getElementById('hintTag');
function setStatus(tag,text,lit){
  hintTag.textContent=tag;
  hintEl.textContent=text;
  statusEl.classList.toggle('lit',!!lit);
}
function toolStatus(){ setStatus(S.tool,HINTS[S.tool]||'',false); }

function buildRail(){
  var rail=document.getElementById('rail');
  RAIL.forEach(function(item){
    if(item.sep){ var s=document.createElement('div'); s.className='sep'; rail.appendChild(s); return; }
    var b=document.createElement('button');
    b.className='tool'; b.id='rail_'+item.id;
    b.innerHTML=icon(item.icon);
    b.setAttribute('aria-label',item.label);
    b.title=item.label+(item.key?'  ('+item.key+')':'');
    if(item.type!=='act') b.setAttribute('aria-pressed','false');
    b.onclick=function(){ railAction(item); };
    b.onmouseenter=b.onfocus=function(){
      setStatus(item.id,item.label+(item.key?'   ['+item.key+']':''),true);
    };
    b.onmouseleave=b.onblur=function(){ toolStatus(); };
    rail.appendChild(b);
  });
  var grow=document.createElement('div'); grow.className='grow';
  rail.insertBefore(grow,document.getElementById('rail_sub').previousSibling);
  syncRail();
}
function railAction(item){
  if(item.type==='tool'){
    if(item.id==='image'&&!S.img){ showTab('image'); document.getElementById('trace').click(); return; }
    setTool(item.id); return;
  }
  if(item.id==='zin') zoomCentre(S.view.z*1.25);
  else if(item.id==='zout') zoomCentre(S.view.z/1.25);
  else if(item.id==='fit') fitView();
  else if(item.id==='grid'){ S.showGrid=!S.showGrid; document.getElementById('gridChk').checked=S.showGrid; syncRail(); draw(); }
  else if(item.id==='snap'){ S.snap=!S.snap; document.getElementById('snapChk').checked=S.snap; syncRail(); toast(S.snap?'Snap on':'Snap off'); }
  else if(item.id==='sub'){ S.nextIsMove=true; if(S.tool==='select') setTool('line');
                            toast('Next click starts a new subpath'); }
  else if(item.id==='undo') undo();
  else if(item.id==='redo') redo();
  else if(item.id==='del') deleteSelected();
  else if(item.id==='help') document.getElementById('help').classList.add('on');
}
function setTool(t){
  if(t==='image'&&!S.img){ showTab('image'); document.getElementById('trace').click(); return; }
  S.tool=t;
  if(t!=='select') S.sel=null;
  syncRail();
  board.style.cursor = t==='pan'?'grab' : t==='image'?'move'
                     : t==='select'?'default' : 'crosshair';
  if(t==='measure'){ showTab('ruler'); syncMeasures(); measStatus(); }
  else { S.measDraft=null; S.measHover=null; S.measGapFrom=-1; toolStatus(); }
  draw();
}
function syncRail(){
  RAIL.forEach(function(item){
    if(item.sep) return;
    var b=document.getElementById('rail_'+item.id);
    if(item.type==='tool') b.setAttribute('aria-pressed',String(S.tool===item.id));
    else if(item.type==='toggle')
      b.setAttribute('aria-pressed',String(item.id==='grid'?S.showGrid:S.snap));
  });
  document.getElementById('rail_del').disabled=!S.sel;
  document.getElementById('rail_undo').disabled=!HIST.length;
  document.getElementById('rail_redo').disabled=!FUT.length;
  var isPath=L()&&L().kind==='path';
  document.getElementById('rail_sub').disabled=!isPath;
}

/* ================= tabs ================= */

function showTab(name){
  [].forEach.call(document.querySelectorAll('#tabs button'),function(b){
    b.setAttribute('aria-selected',String(b.dataset.p===name));
  });
  [].forEach.call(document.querySelectorAll('.pane'),function(p){
    p.classList.toggle('on',p.dataset.pane===name);
  });
}
document.getElementById('tabs').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(b) showTab(b.dataset.p);
});

/* ================= layer panel ================= */

var EYE_ON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
var EYE_OFF='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.9 17.9A10.8 10.8 0 0 1 12 20C5 20 1 12 1 12a19 19 0 0 1 5.2-6M9.9 4.2A10.9 10.9 0 0 1 12 4c7 0 11 8 11 8a19 19 0 0 1-2.2 3.2M1 1l22 22"/></svg>';
var OPLABEL={add:'∪ add',subtract:'− subtract',intersect:'∩ intersect',exclusiveOr:'⊕ xor'};
var OPGLYPH={add:'∪',subtract:'−',intersect:'∩',exclusiveOr:'⊕'};
var KINDLABEL={path:'GeneralPath',rect:'Rectangle2D',ellipse:'Ellipse2D',arc:'Arc2D',
               text:'drawString',image:'drawImage'};
// a path layer is labelled by whatever Java class it will actually emit
function kindLabel(l){
  if(!l) return '';
  if(l.kind==='path') return l.shapeClass||'GeneralPath';
  return KINDLABEL[l.kind]||l.kind;
}

function mergedLayers(){
  var set=[];
  groups().forEach(function(g){ for(var i=1;i<g.length;i++) set.push(g[i]); });
  return set;
}

// isolate one shape so it can be read whole without dimming the rest. Stateless
// on purpose: "this is the only visible one" is the entire toggle condition, so
// it survives undo, deletion and reordering without a saved snapshot to go stale
function soloLayer(i){
  var alone=S.layers.every(function(l,j){ return j===i ? l.visible : !l.visible; });
  S.layers.forEach(function(l,j){ l.visible = alone ? true : j===i; });
  toast(alone?'All shapes shown':'Isolated '+S.layers[i].name);
}
function renderLayers(){
  var box=document.getElementById('stack');
  var dl=document.getElementById('dropline');
  box.innerHTML='';
  if(dl) box.appendChild(dl);
  var dpr=window.devicePixelRatio||1;
  var merged=mergedLayers();
  var clash=nameClashes();
  var scopes=clipScopes();
  var folded=collapsedRows();
  for(var i=S.layers.length-1;i>=0;i--){
    if(folded[i]) continue;               // hidden inside a collapsed base
    (function(idx){
      var lyr=S.layers[idx];
      var isMerged=(merged.indexOf(lyr)>=0)||
        (!lyr.visible&&idx>0&&lyr.combine!=='none'&&!lyr.isClip&&lyr.kind!=='image');
      var dupName=!!clash[javaBase(lyr.name)];
      var row=document.createElement('div');
      var depth=(scopes[idx]||[]).length;
      // a boolean member is not itself flagged `clipped`, so its own scope reads 0.
      // It is painted as part of its base's Area, so it indents from the base's depth
      var runAt=idx;
      if(isMerged){ while(runAt>0&&merged.indexOf(S.layers[runAt])>=0) runAt--; }
      var runDepth=(scopes[runAt]||[]).length;
      var nest=depth>0||isMerged;                 // is this row a child of the one below
      // a base is what the markers above point down at: a clip region with shapes
      // under it, or the first shape of a boolean run
      var runBase=(lyr.isClip&&clipOwns(idx)>0)
               || (!isMerged&&idx+1<S.layers.length&&merged.indexOf(S.layers[idx+1])>=0);
      row.className='layer'
        +(idx===S.active?' on':(S.selLayers.indexOf(idx)>=0?' sel':''))
        +(lyr.visible?'':' hidden-l')
        +(lyr.group?' grouped':'')+(dupName?' clash':'')
        +(lyr.isClip&&clipOwns(idx)?' clipowner':'')
        +(nest?' nested':'')+(runBase?' runbase':'');
      // every row carries its level: the child's spine and the base's elbow are
      // positioned from it, so they land on the same vertical line
      row.style.setProperty('--nestlevel',runDepth+(isMerged?1:0));
      row.dataset.idx=idx;
      if(lyr.group) row.style.setProperty('--gband',groupColor(lyr.group));
      // one marker serves both relationships, told apart by glyph and colour:
      // a crimson arrow means "clipped by the region below", an operator glyph
      // means "merged into the shape below with this set operation"
      if(nest){
        var mk=document.createElement('span');
        mk.className='nestmark '+(depth?'nest-clip':'nest-bool');
        var glyph=document.createElement('i');   // sits on the spine, masking it
        if(depth){
          glyph.innerHTML='<svg viewBox="0 0 12 14" fill="none" stroke="currentColor" '
            +'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
            +'<path d="M7 2v7.5"/><path d="M4 6.5 7 10l3-3.5"/></svg>';
          mk.title='Clipped to '+S.layers[scopes[idx][depth-1]].name;
        } else {
          glyph.textContent=OPGLYPH[lyr.combine]||'∪';
          mk.title=(OPLABEL[lyr.combine]||'combined')+' with the shape below';
        }
        mk.appendChild(glyph);
        row.appendChild(mk);
      }
      if(runBase){
        var el=document.createElement('span');   // the elbow the spine lands on
        el.className='nestbase '+(lyr.isClip?'nest-clip':'nest-bool');
        row.appendChild(el);
        var tw=document.createElement('button');
        tw.className='twisty'+(lyr.collapsed?' shut':'');
        tw.innerHTML='<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" '
          +'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
          +'<path d="M3 4.5 6 8l3-3.5"/></svg>';
        tw.title=(lyr.collapsed?'Show':'Hide')+' the '+foldCount(idx)+' shape'
                 +(foldCount(idx)===1?'':'s')+' under this one';
        tw.onpointerdown=function(e){ e.stopPropagation(); };
        tw.onclick=function(e){ e.stopPropagation(); lyr.collapsed=!lyr.collapsed; renderLayers(); };
        row.appendChild(tw);
      }
      var cv=document.createElement('canvas');
      cv.className='thumb';
      cv.width=Math.round(46*dpr); cv.height=Math.round(36*dpr);
      cv.style.width='46px'; cv.style.height='36px';
      renderThumb(cv,lyr);
      var body=document.createElement('div'); body.className='lbody';
      var nm=document.createElement('input');
      nm.className='lname'; nm.value=lyr.name;
      nm.title=dupName
        ? 'Another shape makes the same Java name, so the output will suffix one of them. Rename to fix it.'
        : 'Rename: this becomes the Java variable '+javaBase(lyr.name);
      nm.onpointerdown=function(e){ e.stopPropagation(); };
      nm.onclick=function(e){ e.stopPropagation(); };
      nm.onchange=function(){ push(); lyr.name=nm.value.trim()||'shape'; sync(); };
      nm.onkeydown=function(e){ if(e.key==='Enter') nm.blur(); e.stopPropagation(); };
      var meta=document.createElement('span');
      meta.className='lmeta';
      var kind=kindLabel(lyr);
      var extra = lyr.isClip ? 'clip' : isMerged ? OPLABEL[lyr.combine] : lyr.render;
      meta.textContent=kind+' · '+extra+(lyr.group?' · grp':'');
      if(lyr.isClip){
        var owns=clipOwns(idx);
        meta.textContent+=owns?(' · masks '+owns+' above')
                              :' · not drawn, masks nothing';
      }
      else if(depth) meta.textContent+=' · clipped';
      if(lyr.isClip&&clipOwns(idx)){
        var tag=document.createElement('span');   // sits at the row edge, clear of the name
        tag.className='masktag'; tag.textContent='MASK';
        row.appendChild(tag);
      }
      // the base of a boolean run decides render mode, colour, stroke and alpha for
      // the whole merged Area; members contribute geometry only. Say how many it
      // speaks for, and speak up when its mode is quietly discarding theirs
      if(runBase&&!lyr.isClip){
        var mem=[];
        for(var mi=idx+1;mi<S.layers.length&&merged.indexOf(S.layers[mi])>=0;mi++) mem.push(S.layers[mi]);
        if(mem.length) meta.textContent+=' · '+mem.length+' merged';
        var swallowed=(lyr.render==='draw')&&mem.some(function(o){
          return o.render==='fill'||o.render==='both';
        });
        if(swallowed){
          // leads the meta line: in a narrow panel the tail is ellipsised away, and a
          // warning nobody can read is no warning
          var wsp=document.createElement('span');
          wsp.className='warn'; wsp.textContent='outline only · ';
          wsp.title='This run paints as an outline because the mode here is "draw", and the '
            +'base sets the mode for the whole merged shape. '
            +(mem.length===1?'1 shape below is filled, but its mode is ignored. '
                            :mem.length+' shapes below are filled, but their modes are ignored. ')
            +'Set this shape to fill to get a solid result.';
          meta.insertBefore(wsp,meta.firstChild);
        }
      }
      if(lyr.collapsed&&foldCount(idx)) meta.textContent+=' · '+foldCount(idx)+' folded';
      if(dupName) meta.textContent+=' · name clash';
      body.appendChild(nm); body.appendChild(meta);
      var eye=document.createElement('button');
      eye.className='eye'; eye.innerHTML=lyr.visible?EYE_ON:EYE_OFF;
      eye.title=(lyr.visible?'Hide':'Show')+' · Alt-click to isolate';
      eye.setAttribute('aria-label',eye.title);
      eye.onpointerdown=function(e){ e.stopPropagation(); };
      eye.onclick=function(e){
        e.stopPropagation(); push();
        if(e.altKey) soloLayer(idx); else lyr.visible=!lyr.visible;
        sync();
      };
      row.appendChild(cv); row.appendChild(body); row.appendChild(eye);
      row.addEventListener('pointerdown',function(e){ rowDown(e,idx,row); });
      box.appendChild(row);
    })(i);
  }
  document.getElementById('delLayer').disabled=S.selLayers.length>=S.layers.length;
  document.getElementById('groupLayer').disabled=S.selLayers.length<2;
  var anyGrouped=S.selLayers.some(function(i){ return S.layers[i]&&S.layers[i].group; });
  document.getElementById('ungroupLayer').disabled=!anyGrouped;
}

/* ---- drag a row to reorder; a plain press still just selects ---- */

var rowDrag=null;
function rowDown(e,idx,row){
  if(e.button!==0) return;
  rowDrag={idx:idx,row:row,x:e.clientX,y:e.clientY,moved:false,slot:null,
           ctrl:e.ctrlKey||e.metaKey,shift:e.shiftKey};
  document.addEventListener('pointermove',rowMove);
  document.addEventListener('pointerup',rowUp);
}
function dropSlot(clientY){
  var box=document.getElementById('stack');
  var rows=[].slice.call(box.querySelectorAll('.layer'));
  for(var i=0;i<rows.length;i++){
    var r=rows[i].getBoundingClientRect();
    if(clientY<r.top+r.height/2) return {p:i,rows:rows};
  }
  return {p:rows.length,rows:rows};
}
function rowMove(e){
  if(!rowDrag) return;
  if(!rowDrag.moved){
    if(Math.abs(e.clientX-rowDrag.x)+Math.abs(e.clientY-rowDrag.y)<5) return;
    rowDrag.moved=true;
    rowDrag.row.classList.add('dragging');
    document.body.classList.add('dragrow');   // stop the drag smearing a text selection
  }
  var box=document.getElementById('stack'), dl=document.getElementById('dropline');
  var d=dropSlot(e.clientY);
  rowDrag.slot=d.p;
  if(!d.rows.length){ dl.classList.remove('on'); return; }
  var br=box.getBoundingClientRect();
  var y=(d.p<d.rows.length)
      ? d.rows[d.p].getBoundingClientRect().top-br.top+box.scrollTop
      : d.rows[d.rows.length-1].getBoundingClientRect().bottom-br.top+box.scrollTop;
  dl.style.top=(y-1)+'px';
  dl.classList.add('on');
}
function rowUp(){
  document.removeEventListener('pointermove',rowMove);
  document.removeEventListener('pointerup',rowUp);
  if(!rowDrag) return;
  var rd=rowDrag; rowDrag=null;
  document.body.classList.remove('dragrow');
  document.getElementById('dropline').classList.remove('on');
  rd.row.classList.remove('dragging');
  if(!rd.moved){
    if(rd.ctrl) toggleSel(rd.idx);
    else if(rd.shift){
      var a=Math.min(S.active,rd.idx), b=Math.max(S.active,rd.idx), r=[];
      for(var i=a;i<=b;i++) r.push(i);
      setSel(r,rd.idx);
    } else setSel([rd.idx],rd.idx);
    S.sel=null; sync(); return;
  }
  if(rd.slot===null) return;
  var idxs=(S.selLayers.indexOf(rd.idx)>=0)?S.selLayers.slice():expandSel([rd.idx]);
  // read the insertion point off the rows themselves. Folding means the list can
  // show fewer rows than there are layers, so length arithmetic no longer maps
  var drows=[].slice.call(document.getElementById('stack').querySelectorAll('.layer'));
  var target;
  if(!drows.length) target=S.layers.length;
  else if(rd.slot<drows.length) target=(+drows[rd.slot].dataset.idx)+1;  // in front of that row
  else target=+drows[drows.length-1].dataset.idx;                        // behind the last one
  push(); moveLayers(idxs,target); S.sel=null; sync();
}

/* ================= property panel ================= */

function show(id,on){ document.getElementById(id).style.display=on?'':'none'; }

function syncProps(){
  var l=L(); if(!l) return;
  var boxy=(l.kind==='rect'||l.kind==='ellipse'||l.kind==='arc'||l.kind==='image');
  document.getElementById('kindTag').textContent=kindLabel(l);
  show('geoPath',l.kind==='path');
  show('geoRect',boxy);
  show('cornerRow',l.kind==='rect');
  show('geoArc',l.kind==='arc');
  show('geoText',l.kind==='text');
  show('geoImage',l.kind==='image');
  show('convertRow',l.kind==='rect'||l.kind==='ellipse'||l.kind==='arc');
  document.getElementById('rectNote').textContent =
    l.kind==='rect' ? (l.g.rx>0&&l.g.ry>0
      ? 'Arc width and height above 0 make this a RoundRectangle2D.'
      : 'Set both arc values above 0 for a RoundRectangle2D.') : '';

  if(boxy){
    var g=norm(l.g);
    document.getElementById('gx').value=Math.round(g.x);
    document.getElementById('gy').value=Math.round(g.y);
    document.getElementById('gw').value=Math.round(g.w);
    document.getElementById('gh').value=Math.round(g.h);
    document.getElementById('grx').value=Math.round(l.g.rx||0);
    document.getElementById('gry').value=Math.round(l.g.ry||0);
  }
  if(l.kind==='arc'){
    document.getElementById('astart').value=l.g.start;
    document.getElementById('aext').value=l.g.extent;
    document.getElementById('atype').value=l.g.arcType;
  }
  if(l.kind==='text'){
    document.getElementById('tstr').value=l.text.s;
    document.getElementById('tx').value=l.text.x;
    document.getElementById('ty').value=l.text.y;
    ensureFontOption(l.text.family);   // a project may name a font we have not listed yet
    document.getElementById('tfam').value=l.text.family;
    document.getElementById('tsize').value=l.text.size;
    document.getElementById('tbold').checked=l.text.bold;
    document.getElementById('titalic').checked=l.text.italic;
  }
  if(l.kind==='image'){
    var sw=document.getElementById('imgLayerSwatch');
    sw.style.backgroundImage=l.img.src?'url("'+l.img.src+'")':'';
    sw.classList.toggle('empty',!l.img.src);
    document.getElementById('imgLayerNote').textContent =
      l.img.src ? ('Emitted as ' + (l.img.name||'image.png'))
      : l.img.name ? ('"'+l.img.name+'" was too large to keep in this browser. Choose it again to draw it.')
      : 'No image chosen yet.';
  }
  var sc=document.getElementById('shapeClass');
  sc.value=l.shapeClass||'GeneralPath';
  var poly=polygonal(l), isPoly=(l.shapeClass==='Polygon');
  [].forEach.call(sc.options,function(o){ if(o.value==='Polygon') o.disabled=!poly; });
  document.getElementById('shapeClassNote').textContent = isPoly
    ? 'Polygon takes int arrays, always closes, and has no winding rule of its own.'
    : poly ? 'Every segment here is straight, so Polygon is available.'
    : 'Polygon needs one unbroken run of straight segments; curves or extra subpaths rule it out.';
  // the selected point gets real number fields, since this tool is about exact coords
  var ptRow=document.getElementById('ptRow');
  if(l.kind==='path'&&S.sel&&l.pts[S.sel.i]){
    var p=l.pts[S.sel.i], k=S.sel.key;
    var px=(k==='a')?p.x:(k==='c')?p.cx:(k==='c1')?p.c1x:p.c2x;
    var py=(k==='a')?p.y:(k==='c')?p.cy:(k==='c1')?p.c1y:p.c2y;
    if(px!==undefined&&py!==undefined){
      ptRow.style.display='';
      document.getElementById('ptx').value=Math.round(px);
      document.getElementById('pty').value=Math.round(py);
      document.getElementById('ptLabel').textContent=
        'point '+(S.sel.i+1)+' · '+({a:'anchor',c:'control',c1:'control 1',c2:'control 2'}[k]||k);
    } else ptRow.style.display='none';
  } else ptRow.style.display='none';

  var nsel=S.selLayers.length;
  document.getElementById('alignNote').textContent = nsel>1
    ? 'Aligning '+nsel+' shapes to their combined bounds.'
    : 'With one shape selected, align works against the sheet.';
  syncScaleUI();

  document.getElementById('close').checked=l.closed;
  document.getElementById('close').disabled=isPoly;
  document.getElementById('wind').disabled=isPoly;
  document.getElementById('wind').value=l.wind;
  // a round arc turns through start°, so it never needs an AffineTransform
  var roundArc=isCircularArc(l);
  document.getElementById('trot').disabled=roundArc;
  document.getElementById('tfNote').innerHTML = roundArc
    ? 'This arc is circular, so rotating it only moves <code>start°</code>, so the output stays a plain '
      +'<code>Arc2D.Double</code> with no transform. Drag the round handles on the sheet to reshape it.'
    : 'Applied about the shape&rsquo;s centre, then undone with <code>'+g2n()+'.setTransform</code>. '
      +'Selection handles follow the transform.';
  document.getElementById('trot').value=l.tf.rot;
  document.getElementById('tsx').value=l.tf.sx;
  document.getElementById('tsy').value=l.tf.sy;
  document.getElementById('tshx').value=l.tf.shx;
  document.getElementById('tshy').value=l.tf.shy;

  [].forEach.call(document.querySelectorAll('#renderMode button'),function(b){
    b.setAttribute('aria-pressed',String(b.dataset.r===l.render));
  });
  [].forEach.call(document.querySelectorAll('#paintMode button'),function(b){
    b.setAttribute('aria-pressed',String(b.dataset.pt===l.paint));
  });
  document.getElementById('fillCol').value=l.fillColor;
  document.getElementById('fillCol2').value=l.fillColor2;
  document.getElementById('gradAng').value=l.gradAngle;
  document.getElementById('strokeCol').value=l.strokeColor;
  document.getElementById('strokeW').value=l.strokeW;
  document.getElementById('capMode').value=l.cap;
  document.getElementById('joinMode').value=l.join;
  document.getElementById('miterLim').value=l.miter;
  document.getElementById('dashPat').value=l.dash;
  document.getElementById('dashPhase').value=l.dashPhase;
  document.getElementById('strokeNote').textContent =
    isStrokeDefault(l) ? 'Java defaults, emitted as new BasicStroke('+l.strokeW+'f).'
    : dashArray(l) ? 'Dash lengths are in shape units, like the float[] Java takes.'
    : 'Miter limit only bites on JOIN_MITER.';
  document.getElementById('alpha').value=Math.round(l.alpha*100);
  document.getElementById('alphaVal').textContent=Math.round(l.alpha*100)+'%';

  var grad=(l.paint==='linear'||l.paint==='radial');
  var tex=(l.paint==='texture');
  document.getElementById('fill2Field').style.display=grad?'':'none';
  document.getElementById('gradAngField').style.display=(l.paint==='linear')?'':'none';
  document.getElementById('fillRow').style.display=tex?'none':'';
  document.getElementById('texFields').style.display=tex?'':'none';
  if(tex){
    var ts=document.getElementById('texSwatch');
    ts.style.backgroundImage=l.tex.src?'url("'+l.tex.src+'")':'';
    ts.classList.toggle('empty',!l.tex.src);
    document.getElementById('texNote').textContent =
      l.tex.src ? ('Tile: '+(l.tex.name||'texture.png')) : 'No tile chosen; falls back to the fill colour.';
    document.getElementById('texX').value=l.tex.x;
    document.getElementById('texY').value=l.tex.y;
    document.getElementById('texW').value=l.tex.w;
    document.getElementById('texH').value=l.tex.h;
  }

  var cb=document.getElementById('combine');
  cb.value=l.combine;
  cb.disabled=(S.active===0||l.isClip||l.kind==='image');
  document.getElementById('isClip').checked=l.isClip;
  var ci=S.layers.indexOf(l), above=false;
  for(var ck=ci-1;ck>=0;ck--){ if(S.layers[ck].isClip){ above=true; break; } if(!S.layers[ck].clipped) break; }
  var cbox=document.getElementById('clippedChk');
  cbox.checked=!!l.clipped; cbox.disabled=!above;
  document.getElementById('clipNote').textContent = l.isClip
    ? ('A clip shape is not drawn itself. It confines the shapes nested under it — tick "Clip to region above" on those. It currently clips '+clipOwns(ci)+'.')
    : above ? 'Nest this under the clip region above it. Nested clips intersect rather than replace.'
            : 'No clip region above this shape, so there is nothing to nest it under.';
  document.getElementById('isClip').disabled=(l.kind==='text'||l.kind==='image');
}

function sync(){ normSel(); renderLayers(); syncProps(); syncRail(); syncMeasures(); emitCode(); draw(); scheduleSave(); }

/* ================= editing ================= */

// += on a fractional coordinate grows float residue every time it runs
// (254.46 + 25 lands on 279.46000000000004), and a nudged shape gets nudged
// again. Six places is far past anything the sheet can express, so trimming
// back to it after every move loses nothing real and keeps the drift out.
function trim6(v){ return Math.round(v*1e6)/1e6; }
function shiftLayer(l,dx,dy){
  if(!dx&&!dy) return;
  if(l.kind==='path'){
    l.pts.forEach(function(p){
      p.x=trim6(p.x+dx); p.y=trim6(p.y+dy);
      if(p.cmd==='quad'){ p.cx=trim6(p.cx+dx); p.cy=trim6(p.cy+dy); }
      if(p.cmd==='cubic'){ p.c1x=trim6(p.c1x+dx); p.c1y=trim6(p.c1y+dy);
                           p.c2x=trim6(p.c2x+dx); p.c2y=trim6(p.c2y+dy); }
    });
  } else if(l.kind==='text'){ l.text.x=trim6(l.text.x+dx); l.text.y=trim6(l.text.y+dy); }
  else { l.g.x=trim6(l.g.x+dx); l.g.y=trim6(l.g.y+dy); }
}
function shiftSelection(dx,dy){
  S.selLayers.forEach(function(i){ if(S.layers[i]) shiftLayer(S.layers[i],dx,dy); });
}

function addPoint(x,y){
  push();
  var l=L();
  if(l.kind!=='path'){ toast('This layer is a '+KINDLABEL[l.kind]+'. Add a new path layer or convert it.'); return; }
  if(!l.pts.length||S.nextIsMove){
    l.pts.push({cmd:'move',x:x,y:y}); S.nextIsMove=false;
  } else {
    var prev=l.pts[l.pts.length-1];
    if(S.tool==='quad') l.pts.push({cmd:'quad',x:x,y:y,
      cx:Math.round((prev.x+x)/2),cy:Math.round((prev.y+y)/2)-60});
    else if(S.tool==='cubic') l.pts.push({cmd:'cubic',x:x,y:y,
      c1x:Math.round(prev.x+(x-prev.x)/3),c1y:Math.round(prev.y+(y-prev.y)/3)-50,
      c2x:Math.round(prev.x+2*(x-prev.x)/3),c2y:Math.round(prev.y+2*(y-prev.y)/3)+50});
    else l.pts.push({cmd:'line',x:x,y:y});
  }
  sync();
}
function deleteSelected(){
  if(!S.sel) return;
  var l=L();
  if(l.kind!=='path'||S.sel.key!=='a'){ toast('Only path points can be deleted'); return; }
  push();
  var i=S.sel.i,was=l.pts[i];
  l.pts.splice(i,1);
  if(was.cmd==='move'&&l.pts[i]&&l.pts[i].cmd!=='move')
    l.pts[i]={cmd:'move',x:l.pts[i].x,y:l.pts[i].y};
  if(l.pts.length&&l.pts[0].cmd!=='move')
    l.pts[0]={cmd:'move',x:l.pts[0].x,y:l.pts[0].y};
  S.sel=null; sync();
}
function deleteLayers(){
  var idxs=S.selLayers.slice().sort(function(a,b){ return b-a; });
  if(idxs.length>=S.layers.length){ toast('Keep at least one shape'); return; }
  push();
  idxs.forEach(function(i){ S.layers.splice(i,1); });
  S.active=Math.max(0,Math.min(S.active,S.layers.length-1));
  S.selLayers=[S.active]; S.sel=null; sync();
}
/* ---- clipboard ---- */

var CLIP=null, PASTES=0, CLIP_TAG='path-plotter/layers@1';

// fresh copies with new group ids, so a pasted group stays its own group
function cloneLayers(list,offset){
  var gmap={};
  return list.map(function(src){
    var c=normalize(JSON.parse(JSON.stringify(src)));
    if(c.group){
      if(!gmap[c.group]) gmap[c.group]='g'+(++GID);
      c.group=gmap[c.group];
    }
    if(offset) shiftLayer(c,offset,offset);
    return c;
  });
}
function copySelection(cut){
  var idxs=S.selLayers.slice().sort(function(a,b){ return a-b; });
  if(!idxs.length) return;
  CLIP=idxs.map(function(i){ return JSON.parse(JSON.stringify(S.layers[i])); });
  PASTES=0;
  // also put it on the system clipboard so it travels between tabs and projects
  if(navigator.clipboard&&navigator.clipboard.writeText)
    navigator.clipboard.writeText(JSON.stringify({tag:CLIP_TAG,layers:CLIP})).catch(function(){});
  if(cut) deleteLayers();
  else toast(CLIP.length+' shape'+(CLIP.length===1?'':'s')+' copied');
}
function pasteLayers(list){
  if(!list||!list.length) return;
  push();
  PASTES++;
  var copies=cloneLayers(list,(S.snap?S.grid:10)*PASTES);
  Array.prototype.splice.apply(S.layers,[S.layers.length,0].concat(copies));
  S.selLayers=copies.map(function(c){ return S.layers.indexOf(c); });
  S.active=S.selLayers[S.selLayers.length-1]; S.sel=null;
  sync();
  toast(copies.length+' shape'+(copies.length===1?'':'s')+' pasted');
}
function pasteClipboard(){ if(CLIP&&CLIP.length) pasteLayers(CLIP); else toast('Nothing copied yet'); }

function doGroup(){
  if(S.selLayers.length<2){ toast('Select two or more shapes to group'); return; }
  push();
  var gid='g'+(++GID);
  var idxs=S.selLayers.slice().sort(function(a,b){ return a-b; });
  idxs.forEach(function(i){ S.layers[i].group=gid; });
  moveLayers(idxs,idxs[0]);
  sync(); toast('Grouped '+idxs.length+' shapes');
}
function doUngroup(){
  var any=false;
  S.selLayers.forEach(function(i){ if(S.layers[i]&&S.layers[i].group) any=true; });
  if(!any){ toast('Nothing grouped in the selection'); return; }
  push();
  S.selLayers.forEach(function(i){ if(S.layers[i]) S.layers[i].group=null; });
  sync(); toast('Ungrouped');
}

/* ================= pointer ================= */

// if a pointerup was missed (released off-canvas, cancelled, alt-tabbed) the old
// drag state would silently drag shapes on the next move, so drop it instead
// capture keeps a drag alive off-canvas, but must never abort the handler
function capture(e){
  try{ board.setPointerCapture(e.pointerId); }catch(err){}
}
function clearDrags(){
  S.drag=null; S.moveDrag=null; S.panDrag=null; S.imgDrag=null;
  S.newDrag=null; S.rotDrag=null; S.marquee=null; S.scaleDrag=null;
}
board.addEventListener('pointercancel',function(){ clearDrags(); draw(); });

board.addEventListener('pointermove',function(e){
  var s=toSheet(e);
  document.getElementById('coords').textContent='x '+Math.round(s.x)+'  y '+Math.round(s.y);

  S.fine=fineOn(e);
  S.constrain=!!e.shiftKey;
  setScaleMod(e.ctrlKey||e.metaKey);
  if(e.buttons===0&&(S.drag||S.moveDrag||S.panDrag||S.imgDrag||S.newDrag||S.rotDrag
     ||S.scaleDrag||S.marquee)) clearDrags();

  if(S.tool==='measure'){ measMove(s); return; }
  if(S.marquee){ S.marquee.x1=s.x; S.marquee.y1=s.y; draw(); return; }

  if(S.rotDrag){
    var rd=S.rotDrag, pv=rd.pivot;
    var ang=Math.atan2(s.y-pv.y,s.x-pv.x)*180/Math.PI;
    var d=ang-rd.a0;
    d=S.fine?Math.round(d):(S.snap?Math.round(d/15)*15:Math.round(d));
    rd.base.forEach(function(b){
      var l=S.layers[b.i]; if(!l) return;
      if(isCircularArc(l)) l.g.start=b.start-d; else l.tf.rot=b.rot+d;
      if(rd.each) return;
      var r=d*Math.PI/180, cos=Math.cos(r), sin=Math.sin(r);
      var vx=b.c.x-pv.x, vy=b.c.y-pv.y;
      var tx=Math.round(pv.x+vx*cos-vy*sin-b.c.x);
      var ty=Math.round(pv.y+vx*sin+vy*cos-b.c.y);
      shiftLayer(l,tx-b.off.x,ty-b.off.y);
      b.off.x=tx; b.off.y=ty;
    });
    document.getElementById('coords').textContent=(d>0?'+':'')+d+'°';
    syncProps(); emitCode(); draw(); renderLayers();
    return;
  }
  if(S.scaleDrag){
    var sd=S.scaleDrag, sp=sd.pivot, gp=sd.grip;
    // the grip rides outside the box, so pull it back to the corner it stands for
    var tx=snapV(s.x-gp.ox), ty=snapV(s.y-gp.oy);
    var rx=sd.span.x?(tx-sp.x)/sd.span.x:null;
    var ry=sd.span.y?(ty-sp.y)/sd.span.y:null;
    var fx,fy;
    if(S.constrain?!sd.lock:sd.lock){
      // uniform: the diagonal ratio, which is what a corner drag reads as
      fx=fy=(rx!==null&&ry!==null)
        ? Math.hypot(tx-sp.x,ty-sp.y)/Math.hypot(sd.span.x,sd.span.y)
        : (rx!==null?rx:(ry!==null?ry:1));
    } else { fx=(rx===null?1:rx); fy=(ry===null?1:ry); }
    fx=scaleFactor(fx); fy=scaleFactor(fy);
    sd.base.forEach(function(o){
      var l=S.layers[o.i]; if(l) scaleRestore(l,o.b);
    });
    // every pivot has to be read back after the rewind, not mid-rewrite
    sd.base.forEach(function(o){
      var l=S.layers[o.i]; if(!l) return;
      scaleLayer(l,fx,fy,sd.each?centreOf(l):sp,sd.mode);
    });
    document.getElementById('coords').textContent=
      '× '+fx.toFixed(2)+(Math.abs(fx-fy)<1e-6?'':'  × '+fy.toFixed(2));
    syncProps(); emitCode(); draw(); renderLayers();
    return;
  }
  if(S.panDrag){ S.view.x=e.clientX-S.panDrag.x; S.view.y=e.clientY-S.panDrag.y; draw(); return; }
  if(S.imgDrag&&S.img){
    S.img.x=Math.round(s.x-S.imgDrag.dx); S.img.y=Math.round(s.y-S.imgDrag.dy);
    document.getElementById('ix').value=S.img.x;
    document.getElementById('iy').value=S.img.y;
    draw(); return;
  }
  if(S.newDrag){
    var l=S.layers[S.newDrag.idx], a=S.newDrag.a;
    var w=snapV(s.x)-a.x, h=snapV(s.y)-a.y;
    if(S.constrain){                     // shift gives an exact square or circle
      var m=Math.max(Math.abs(w),Math.abs(h));
      w=(w<0?-m:m); h=(h<0?-m:m);
    }
    l.g.x=Math.min(a.x,a.x+w); l.g.y=Math.min(a.y,a.y+h);
    l.g.w=Math.abs(w); l.g.h=Math.abs(h);
    document.getElementById('coords').textContent=
      'w '+Math.round(l.g.w)+'  ×  h '+Math.round(l.g.h);
    emitCode(); draw(); return;
  }
  if(S.moveDrag){
    var md=S.moveDrag;
    var tx=snapV(s.x)-md.ox, ty=snapV(s.y)-md.oy;
    if(S.constrain){                     // shift locks the move to one axis
      if(Math.abs(tx)>=Math.abs(ty)) ty=0; else tx=0;
    }
    if(tx!==md.dx||ty!==md.dy){
      shiftSelection(tx-md.dx,ty-md.dy);
      md.dx=tx; md.dy=ty;
      document.getElementById('coords').textContent=
        'Δ '+(tx>0?'+':'')+tx+', '+(ty>0?'+':'')+ty;
      syncProps(); emitCode(); draw(); renderLayers();
    }
    return;
  }
  if(S.drag){
    // the pointer is in sheet space; the handle lives in the layer's own space
    var cur=L(), q=unTf(cur,s.x,s.y);
    if(cur.kind==='arc'&&(S.drag.key==='as'||S.drag.key==='ae')){
      var a=snapAngle(arcAngleAt(cur,q.x,q.y));
      if(S.drag.key==='as'){
        var end=cur.g.start+cur.g.extent;
        a=nearest(a,cur.g.start);
        cur.g.start=a; cur.g.extent=end-a;
      } else {
        a=nearest(a,cur.g.start+cur.g.extent);
        cur.g.extent=a-cur.g.start;
      }
      if(cur.g.extent>360) cur.g.extent=360;
      if(cur.g.extent<-360) cur.g.extent=-360;
      syncProps(); emitCode(); draw(); renderLayers(); return;
    }
    var nx=snapV(q.x), ny=snapV(q.y);
    if(cur.kind==='path'){
      var p=cur.pts[S.drag.i];
      if(S.drag.key==='a'){p.x=nx;p.y=ny;}
      else if(S.drag.key==='c'){p.cx=nx;p.cy=ny;}
      else if(S.drag.key==='c1'){p.c1x=nx;p.c1y=ny;}
      else if(S.drag.key==='c2'){p.c2x=nx;p.c2y=ny;}
    } else if(cur.kind==='text'){
      cur.text.x=nx; cur.text.y=ny;
    } else {
      var g=norm(cur.g), x0=g.x,y0=g.y,x1=g.x+g.w,y1=g.y+g.h;
      if(S.drag.key==='nw'){x0=nx;y0=ny;}
      else if(S.drag.key==='ne'){x1=nx;y0=ny;}
      else if(S.drag.key==='se'){x1=nx;y1=ny;}
      else if(S.drag.key==='sw'){x0=nx;y1=ny;}
      cur.g.x=Math.min(x0,x1); cur.g.y=Math.min(y0,y1);
      cur.g.w=Math.abs(x1-x0); cur.g.h=Math.abs(y1-y0);
    }
    syncProps(); emitCode(); draw(); return;
  }
  S.hover={x:snapV(s.x),y:snapV(s.y)};
  if(S.tool!=='pan'&&S.tool!=='image'){
    var rot=hitRot(s.x,s.y);
    var sg=rot?null:hitScale(s.x,s.y);
    board.style.cursor = sg
      ? ((sg.key==='nw'||sg.key==='se')?'nwse-resize':'nesw-resize')
      : (rot||hitHandle(s.x,s.y))?'grab'
      : (S.tool==='select'?'default':'crosshair');
  }
  draw();
});

board.addEventListener('pointerdown',function(e){
  if(e.button===1){
    e.preventDefault();
    S.panDrag={x:e.clientX-S.view.x,y:e.clientY-S.view.y};
    capture(e); board.style.cursor='grabbing'; return;
  }
  if(e.button!==0) return;
  hideCtx();
  S.fine=fineOn(e);
  // the key may have gone down before the window had focus, so the press was
  // never seen; read it off the event rather than trust the tracked flag
  setScaleMod(e.ctrlKey||e.metaKey);
  var s=toSheet(e);
  capture(e);

  if(S.tool==='measure'){ measDown(s,e); return; }
  if(S.tool==='pan'){
    S.panDrag={x:e.clientX-S.view.x,y:e.clientY-S.view.y};
    board.style.cursor='grabbing'; return;
  }
  if(S.tool==='image'){
    if(S.img&&!S.imgLock){ S.imgDrag={dx:s.x-S.img.x,dy:s.y-S.img.y}; board.style.cursor='grabbing'; }
    return;
  }
  if(SHAPE_TOOLS[S.tool]){
    push();
    var nl=normalize(defaults(S.tool+' '+(S.layers.length+1),S.tool));
    nl.render='fill';
    nl.g.x=snapV(s.x); nl.g.y=snapV(s.y); nl.g.w=0; nl.g.h=0;
    if(S.tool==='arc'){ nl.g.start=0; nl.g.extent=270; nl.g.arcType='PIE'; }
    S.layers.push(nl); S.active=S.layers.length-1; S.selLayers=[S.active];
    S.newDrag={idx:S.active,a:{x:snapV(s.x),y:snapV(s.y)}};
    sync(); return;
  }
  if(S.tool==='text'){
    push();
    var tl=normalize(defaults('text '+(S.layers.length+1),'text'));
    tl.render='fill';
    tl.text.x=snapV(s.x); tl.text.y=snapV(s.y);
    S.layers.push(tl); S.active=S.layers.length-1; S.selLayers=[S.active];
    sync(); showTab('shape');
    setTimeout(function(){ document.getElementById('tstr').focus(); document.getElementById('tstr').select(); },0);
    return;
  }

  var rh=hitRot(s.x,s.y);
  if(rh){
    push();
    S.rotDrag={pivot:rh.pivot, each:S.rotEach,
      a0:Math.atan2(s.y-rh.pivot.y,s.x-rh.pivot.x)*180/Math.PI,
      base:S.selLayers.map(function(i){
        var l=S.layers[i];
        return {i:i,rot:l.tf.rot,start:l.g.start,c:centreOf(l),off:{x:0,y:0}};
      })};
    board.style.cursor='grabbing';
    return;
  }

  var sgrip=hitScale(s.x,s.y);
  if(sgrip){
    push();
    S.scaleDrag={grip:sgrip, each:S.scaleEach, mode:S.scaleMode, lock:S.scaleLock,
      pivot:{x:sgrip.px, y:sgrip.py},
      span:{x:sgrip.cx-sgrip.px, y:sgrip.cy-sgrip.py},
      base:S.selLayers.filter(function(i){ return !!S.layers[i]; })
                      .map(function(i){ return {i:i, b:scaleBase(S.layers[i])}; })};
    board.style.cursor='grabbing';
    return;
  }

  var h=hitHandle(s.x,s.y);
  if(h){ push(); S.drag=h; S.sel={i:h.i,key:h.key}; board.style.cursor='grabbing'; sync(); return; }

  if(S.tool==='select'){
    var add=e.ctrlKey||e.metaKey;
    var hitIdx=-1;
    for(var i=S.layers.length-1;i>=0;i--){
      if(S.layers[i].visible&&insideLayer(S.layers[i],s.x,s.y)){ hitIdx=i; break; }
    }
    if(hitIdx>=0){
      if(add){ toggleSel(hitIdx); S.sel=null; sync(); return; }
      if(S.selLayers.indexOf(hitIdx)<0){ setSel([hitIdx],hitIdx); S.sel=null; sync(); }
      else if(hitIdx!==S.active){ S.active=hitIdx; sync(); }
      push();
      S.moveDrag={ox:snapV(s.x),oy:snapV(s.y),dx:0,dy:0};
      board.style.cursor='grabbing';
      return;
    }
    // empty space: rubber-band a selection box
    S.sel=null;
    S.marquee={x0:s.x,y0:s.y,x1:s.x,y1:s.y,add:add};
    draw();
    return;
  }
  if(s.x<-40||s.y<-40||s.x>S.W+40||s.y>S.H+40) return;
  var nx=snapV(s.x), ny=snapV(s.y);
  if(S.constrain){                       // shift keeps the segment on a 45° step
    var lp=L();
    if(lp&&lp.kind==='path'&&lp.pts.length&&!S.nextIsMove){
      var pv=lp.pts[lp.pts.length-1];
      var vx=nx-pv.x, vy=ny-pv.y;
      var ang=Math.round(Math.atan2(vy,vx)/(Math.PI/4))*(Math.PI/4);
      var len=Math.hypot(vx,vy);
      nx=Math.round(pv.x+Math.cos(ang)*len);
      ny=Math.round(pv.y+Math.sin(ang)*len);
    }
  }
  addPoint(nx,ny);
});

function topHitAt(x,y){
  for(var i=S.layers.length-1;i>=0;i--)
    if(S.layers[i].visible&&insideLayer(S.layers[i],x,y)) return i;
  return -1;
}
board.addEventListener('dblclick',function(e){
  var s=toSheet(e);
  // a double-click on text always means "let me retype it"
  var hit=topHitAt(s.x,s.y);
  if(hit>=0&&S.layers[hit].kind==='text'){ openTextEditor(hit); return; }
  if(S.tool!=='select') return;
  if(!insertAt(s.x,s.y)) toast('Double-click closer to a path segment');
});

/* ---- type straight onto the sheet ---- */

var textEdit=null;
function placeTextEditor(){
  if(!textEdit) return;
  var l=S.layers[textEdit.idx];
  if(!l||l.kind!=='text'){ closeTextEditor(); return; }
  var z=S.view.z, T=tfMapper(l), ta=textEdit.el;
  var p=T(l.text.x,l.text.y-l.text.size);
  ta.style.left=(GUT+S.view.x+p.x*z)+'px';
  ta.style.top=(GUT+S.view.y+p.y*z)+'px';
  ta.style.font=fontCSS(l);
  ta.style.fontSize=(l.text.size*z)+'px';
  ta.style.lineHeight=(l.text.size*1.2*z)+'px';
  var lines=String(l.text.s||'').split('\n');
  var m=textMetrics(l);
  ta.style.width=Math.max(48,m.w*z+26)+'px';
  ta.style.height=Math.max(l.text.size*1.35*z,lines.length*l.text.size*1.2*z+10)+'px';
}
function openTextEditor(idx){
  closeTextEditor();
  var l=S.layers[idx];
  if(!l||l.kind!=='text') return;
  setSel([idx],idx); S.sel=null; sync(); showTab('shape');
  push();
  var ta=document.createElement('textarea');
  ta.id='canvasText'; ta.value=l.text.s; ta.spellcheck=false;
  stage.appendChild(ta);
  textEdit={el:ta,idx:idx};
  placeTextEditor();
  ta.focus(); ta.select();
  ta.addEventListener('input',function(){
    l.text.s=ta.value;
    document.getElementById('tstr').value=ta.value;
    emitCode(); draw(); renderLayers(); placeTextEditor();
  });
  ta.addEventListener('keydown',function(ev){
    ev.stopPropagation();
    if(ev.key==='Escape'||(ev.key==='Enter'&&(ev.ctrlKey||ev.metaKey))){
      ev.preventDefault(); closeTextEditor();
    }
  });
  ta.addEventListener('blur',closeTextEditor);
  setStatus('text','Typing on the sheet. Esc or click away when you are done',true);
}
function closeTextEditor(){
  if(!textEdit) return;
  var el=textEdit.el;
  textEdit=null;
  if(el&&el.parentNode) el.parentNode.removeChild(el);
  toolStatus(); sync();
}

/* ---- right-click menu ---- */

var ctxEl=document.getElementById('ctxmenu');
function hideCtx(){ ctxEl.classList.remove('on'); }
function ctxItem(label,fn,opts){
  opts=opts||{};
  var b=document.createElement('button');
  b.type='button';
  var tick=document.createElement('span');
  tick.className='tick';
  tick.textContent=opts.checked?'✓':'';
  b.appendChild(tick);
  b.appendChild(document.createTextNode(label));
  if(opts.disabled) b.disabled=true;
  b.onclick=function(){ hideCtx(); fn(); };
  ctxEl.appendChild(b);
}
function ctxSep(){ var d=document.createElement('div'); d.className='sep'; ctxEl.appendChild(d); }
function showCtx(clientX,clientY){
  var n=S.selLayers.length, l=L();
  ctxEl.innerHTML='';
  var head=document.createElement('div');
  head.className='head';
  head.textContent=n>1?(n+' shapes selected'):(l?l.name:'');
  ctxEl.appendChild(head);

  ctxItem('Duplicate',function(){ document.getElementById('dupLayer').click(); });
  ctxItem('Copy',function(){ copySelection(false); });
  ctxItem('Paste',pasteClipboard,{disabled:!(CLIP&&CLIP.length)});
  ctxSep();
  ctxItem('Rotate 90° right',function(){ applyRotation(90,S.rotEach); });
  ctxItem('Rotate 90° left',function(){ applyRotation(-90,S.rotEach); });
  ctxItem('Rotate each in place',function(){
    S.rotEach=!S.rotEach;
    toast(S.rotEach?'Rotation spins each shape where it stands':'Rotation turns the selection as one');
    draw();
  },{checked:S.rotEach,disabled:n<2});
  ctxSep();
  ctxItem('Scale 200%',function(){ applyScale(2,2); });
  ctxItem('Scale 50%',function(){ applyScale(.5,.5); });
  ctxItem('Scale through AffineTransform',function(){
    setScaleMode(S.scaleMode==='tf'?'geom':'tf');
  },{checked:S.scaleMode==='tf'});
  ctxItem('Scale each in place',function(){
    S.scaleEach=!S.scaleEach;
    syncScaleUI();
    toast(S.scaleEach?'Scaling grows each shape where it stands':'Scaling grows the selection as one');
    draw();
  },{checked:S.scaleEach,disabled:n<2});
  ctxSep();
  ctxItem('Flip horizontal',function(){ flip(true); });
  ctxItem('Flip vertical',function(){ flip(false); });
  ctxSep();
  ctxItem('Group',doGroup,{disabled:n<2});
  ctxItem('Ungroup',doUngroup,{disabled:!S.selLayers.some(function(i){ return S.layers[i]&&S.layers[i].group; })});
  ctxSep();
  if(l&&l.kind==='text') ctxItem('Edit text on canvas',function(){ openTextEditor(S.active); });
  ctxItem('Remove last point',function(){
    var p=L(); if(p.kind==='path'&&p.pts.length){ push(); p.pts.pop(); S.sel=null; sync(); }
  },{disabled:!(l&&l.kind==='path'&&l.pts.length)});
  ctxItem('Delete',deleteLayers,{disabled:n>=S.layers.length});

  ctxEl.classList.add('on');
  var r=ctxEl.getBoundingClientRect();
  var x=Math.min(clientX,window.innerWidth-r.width-8);
  var y=Math.min(clientY,window.innerHeight-r.height-8);
  ctxEl.style.left=Math.max(4,x)+'px';
  ctxEl.style.top=Math.max(4,y)+'px';
}
document.addEventListener('pointerdown',function(e){
  if(ctxEl.classList.contains('on')&&!ctxEl.contains(e.target)) hideCtx();
});

board.addEventListener('pointerup',function(e){
  if(S.tool==='measure'){ measUp(); try{ board.releasePointerCapture(e.pointerId); }catch(err){} return; }
  if(S.marquee){
    var m=S.marquee; S.marquee=null;
    var x0=Math.min(m.x0,m.x1), x1=Math.max(m.x0,m.x1);
    var y0=Math.min(m.y0,m.y1), y1=Math.max(m.y0,m.y1);
    var tiny=(x1-x0<3&&y1-y0<3);
    var hits=[];
    if(!tiny) S.layers.forEach(function(l,i){
      var b=l.visible&&layerBox(l);
      if(b&&b.x1>=x0&&b.x0<=x1&&b.y1>=y0&&b.y0<=y1) hits.push(i);
    });
    if(hits.length){
      if(m.add){
        hits.forEach(function(i){ if(S.selLayers.indexOf(i)<0) S.selLayers.push(i); });
        S.selLayers.sort(function(a,b){ return a-b; });
        S.active=hits[hits.length-1];
      } else setSel(hits,hits[hits.length-1]);
    } else if(!m.add) setSel([S.active],S.active);
    sync();
    try{ board.releasePointerCapture(e.pointerId); }catch(err){}
    return;
  }
  if(S.newDrag){
    var l=S.layers[S.newDrag.idx];
    if(norm(l.g).w<3||norm(l.g).h<3){
      l.g.w=Math.max(norm(l.g).w,120); l.g.h=Math.max(norm(l.g).h,90);
      toast('Tiny drag, so it got a default size');
    }
    S.newDrag=null; sync();
  }
  if(S.drag){ S.drag=null; sync(); }
  if(S.rotDrag){ S.rotDrag=null; document.getElementById('coords').textContent='·'; sync(); }
  if(S.scaleDrag){ S.scaleDrag=null; document.getElementById('coords').textContent='·'; sync(); }
  S.moveDrag=null; S.panDrag=null; S.imgDrag=null;
  board.style.cursor = S.tool==='pan'?'grab' : S.tool==='image'?'move'
                     : S.tool==='select'?'default':'crosshair';
  try{ board.releasePointerCapture(e.pointerId); }catch(err){}
});

board.addEventListener('pointerleave',function(){
  if(!S.drag&&!S.panDrag&&!S.imgDrag&&!S.newDrag&&!S.moveDrag&&!S.scaleDrag&&S.hover){
    S.hover=null; document.getElementById('coords').textContent='·'; draw();
  }
});
board.addEventListener('contextmenu',function(e){
  e.preventDefault();
  var drawing=(S.tool==='line'||S.tool==='quad'||S.tool==='cubic');
  // mid-draw, right-click stays the quick "take that point back" it always was
  if(drawing&&L()&&L().kind==='path'&&L().pts.length){
    push(); L().pts.pop(); S.sel=null; sync(); return;
  }
  var s=toSheet(e);
  var hit=topHitAt(s.x,s.y);
  if(hit>=0&&S.selLayers.indexOf(hit)<0){ setSel([hit],hit); S.sel=null; sync(); }
  showCtx(e.clientX,e.clientY);
});
board.addEventListener('wheel',function(e){
  var r=board.getBoundingClientRect();
  if(e.ctrlKey||e.metaKey){
    e.preventDefault();
    zoomAt(e.clientX-r.left,e.clientY-r.top,S.view.z*(e.deltaY<0?1.12:1/1.12));
    return;
  }
  if(S.tool==='image'&&S.img&&!S.imgLock){
    e.preventDefault();
    var s=toSheet(e),im=S.img,old=im.scale;
    var next=Math.min(4,Math.max(.05,old*(e.deltaY<0?1.08:1/1.08)));
    im.x=Math.round(s.x-(s.x-im.x)*(next/old));
    im.y=Math.round(s.y-(s.y-im.y)*(next/old));
    im.scale=next;
    document.getElementById('imgScale').value=Math.round(next*100);
    document.getElementById('scVal').textContent=Math.round(next*100)+'%';
    document.getElementById('ix').value=im.x; document.getElementById('iy').value=im.y;
    draw(); return;
  }
  e.preventDefault();
  S.view.x-=e.shiftKey?e.deltaY:e.deltaX;
  S.view.y-=e.shiftKey?0:e.deltaY;
  draw();
},{passive:false});

/* ================= panel wiring ================= */

function bindNum(id,fn){
  document.getElementById(id).addEventListener('input',function(){
    var v=parseFloat(this.value);
    if(!isNaN(v)){ fn(v,L()); emitCode(); draw(); renderLayers(); }
  });
}
bindNum('gx',function(v,l){ l.g.x=v; });
bindNum('gy',function(v,l){ l.g.y=v; });
bindNum('gw',function(v,l){ l.g.w=Math.max(1,v); });
bindNum('gh',function(v,l){ l.g.h=Math.max(1,v); });
bindNum('grx',function(v,l){ l.g.rx=Math.max(0,v); });
bindNum('gry',function(v,l){ l.g.ry=Math.max(0,v); });
bindNum('astart',function(v,l){ l.g.start=v; });
bindNum('aext',function(v,l){ l.g.extent=v; });
bindNum('tx',function(v,l){ l.text.x=v; });
bindNum('ty',function(v,l){ l.text.y=v; });
bindNum('tsize',function(v,l){ l.text.size=Math.max(4,v); });
bindNum('trot',function(v,l){ l.tf.rot=v; });
bindNum('tsx',function(v,l){ l.tf.sx=v||0.01; });
bindNum('tsy',function(v,l){ l.tf.sy=v||0.01; });
bindNum('tshx',function(v,l){ l.tf.shx=v; });
bindNum('tshy',function(v,l){ l.tf.shy=v; });
bindNum('gradAng',function(v,l){ l.gradAngle=v; });
bindNum('strokeW',function(v,l){ l.strokeW=Math.max(1,Math.round(v)); });
bindNum('miterLim',function(v,l){ l.miter=Math.max(1,v); });
bindNum('dashPhase',function(v,l){ l.dashPhase=v; });
bindNum('texX',function(v,l){ l.tex.x=v; });
bindNum('texY',function(v,l){ l.tex.y=v; });
bindNum('texW',function(v,l){ l.tex.w=Math.max(1,v); });
bindNum('texH',function(v,l){ l.tex.h=Math.max(1,v); });

document.getElementById('capMode').onchange=function(){ push(); L().cap=this.value; sync(); };
document.getElementById('joinMode').onchange=function(){ push(); L().join=this.value; sync(); };
document.getElementById('dashPat').addEventListener('input',function(){
  L().dash=this.value; emitCode(); draw(); renderLayers();
});
document.getElementById('atype').onchange=function(){ push(); L().g.arcType=this.value; sync(); };
document.getElementById('tstr').addEventListener('input',function(){ L().text.s=this.value; emitCode(); draw(); renderLayers(); });
document.getElementById('tfam').onchange=function(){ push(); L().text.family=this.value; sync(); };
document.getElementById('tbold').onchange=function(){ push(); L().text.bold=this.checked; sync(); };
document.getElementById('titalic').onchange=function(){ push(); L().text.italic=this.checked; sync(); };
document.getElementById('close').onchange=function(){ push(); L().closed=this.checked; sync(); };
document.getElementById('wind').onchange=function(){ push(); L().wind=this.value; sync(); };
document.getElementById('shapeClass').onchange=function(){
  var l=L();
  if(this.value==='Polygon'&&!polygonal(l)){
    toast('Polygon needs one run of straight segments');
    this.value=l.shapeClass; return;
  }
  push();
  l.shapeClass=this.value;
  if(this.value==='Polygon') l.closed=true;   // Polygon closes itself; keep preview honest
  sync();
};
document.getElementById('combine').onchange=function(){ push(); L().combine=this.value; sync(); };
// one control for the whole panel: fold everything, or unfold it if it already is
document.getElementById('foldAll').onclick=function(){
  var bases=[];
  S.layers.forEach(function(l,i){ if(foldCount(i)>0) bases.push(l); });
  if(!bases.length){ toast('Nothing to fold'); return; }
  var anyOpen=bases.some(function(l){ return !l.collapsed; });
  bases.forEach(function(l){ l.collapsed=anyOpen; });
  renderLayers();
  toast(anyOpen?'Folded '+bases.length+' run'+(bases.length===1?'':'s'):'Unfolded');
};
document.getElementById('clippedChk').onchange=function(){
  var l=L(); if(!l) return;
  push(); l.clipped=this.checked; sync();
};
document.getElementById('isClip').onchange=function(){
  push(); L().isClip=this.checked;
  if(this.checked) L().combine='none';
  sync();
};
document.getElementById('tfReset').onclick=function(){
  push(); L().tf={rot:0,sx:1,sy:1,shx:0,shy:0}; sync();
};
document.getElementById('toPath').onclick=function(){
  var l=L();
  if(l.kind==='path'||l.kind==='text'||l.kind==='image'){ toast('Only primitives convert to a path'); return; }
  push();
  var wasOpenArc=(l.kind==='arc'&&l.g.arcType==='OPEN');
  l.pts=toPathPoints(l);
  l.kind='path';
  l.closed=!wasOpenArc;
  sync();
  toast('Converted to an editable GeneralPath');
};
document.getElementById('resetGeo').onclick=function(){
  push(); var l=L(); l.g.w=160; l.g.h=120; sync();
};

document.getElementById('renderMode').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b) return;
  push(); L().render=b.dataset.r; sync();
});
document.getElementById('paintMode').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b) return;
  push(); L().paint=b.dataset.pt;
  if(L().render==='draw') L().render='fill';
  sync();
  if(b.dataset.pt==='texture'&&!L().tex.src) toast('Choose a tile image for the TexturePaint');
});
document.getElementById('fillCol').oninput=function(){ L().fillColor=this.value; sync(); };
document.getElementById('fillCol2').oninput=function(){ L().fillColor2=this.value; sync(); };
document.getElementById('strokeCol').oninput=function(){ L().strokeColor=this.value; sync(); };
document.getElementById('alpha').addEventListener('input',function(){
  L().alpha=this.value/100;
  document.getElementById('alphaVal').textContent=this.value+'%';
  emitCode(); draw(); renderLayers();
});

/* ---- arrange: acts on the whole selection ---- */

function flip(horiz){
  var b=selBounds(); if(!b){ toast('Nothing to flip yet'); return; }
  push();
  var mid=horiz?(b.x0+b.x1)/2:(b.y0+b.y1)/2;
  S.selLayers.forEach(function(i){
    var l=S.layers[i]; if(!l) return;
    if(l.kind==='path'){
      l.pts.forEach(function(p){
        function f(v){ return Math.round(2*mid-v); }
        if(horiz){ p.x=f(p.x); if(p.cmd==='quad')p.cx=f(p.cx);
                   if(p.cmd==='cubic'){p.c1x=f(p.c1x);p.c2x=f(p.c2x);} }
        else { p.y=f(p.y); if(p.cmd==='quad')p.cy=f(p.cy);
               if(p.cmd==='cubic'){p.c1y=f(p.c1y);p.c2y=f(p.c2y);} }
      });
      return;
    }
    var c=centreOf(l);
    if(l.kind==='arc'){
      if(horiz){ l.g.start=180-l.g.start; l.g.extent=-l.g.extent; }
      else { l.g.start=-l.g.start; l.g.extent=-l.g.extent; }
    } else {
      // text and images flip through the transform, exactly like the primitives
      if(horiz) l.tf.sx=-l.tf.sx; else l.tf.sy=-l.tf.sy;
    }
    var cur=horiz?c.x:c.y, d=Math.round(2*mid-cur-cur);
    shiftLayer(l,horiz?d:0,horiz?0:d);
  });
  sync();
}
function setPointCoord(axis,v){
  var l=L(); if(!l||l.kind!=='path'||!S.sel) return;
  var p=l.pts[S.sel.i]; if(!p) return;
  var k=S.sel.key;
  if(axis==='x'){ if(k==='a')p.x=v; else if(k==='c')p.cx=v; else if(k==='c1')p.c1x=v; else p.c2x=v; }
  else { if(k==='a')p.y=v; else if(k==='c')p.cy=v; else if(k==='c1')p.c1y=v; else p.c2y=v; }
  emitCode(); draw(); renderLayers();
}
document.getElementById('ptx').addEventListener('input',function(){
  var v=parseFloat(this.value); if(!isNaN(v)) setPointCoord('x',Math.round(v));
});
document.getElementById('pty').addEventListener('input',function(){
  var v=parseFloat(this.value); if(!isNaN(v)) setPointCoord('y',Math.round(v));
});

[['alignL','l'],['alignC','c'],['alignR','r'],
 ['alignT','t'],['alignM','m'],['alignB','b']].forEach(function(pair){
  document.getElementById(pair[0]).onclick=function(){ alignSel(pair[1]); };
});
document.getElementById('distH').onclick=function(){ distributeSel(true); };
document.getElementById('distV').onclick=function(){ distributeSel(false); };
document.getElementById('buildOnce').onchange=function(){ emitCode(); };

/* ---- scale selection: mode, multiplier, quick steps ---- */

function setScaleMode(m){
  S.scaleMode=(m==='tf')?'tf':'geom';
  var folded=(S.scaleMode==='geom')?dropTfScale():'';
  syncScaleUI();
  draw();
  toast(folded || (S.scaleMode==='tf'
    ? 'Scaling now rides the AffineTransform'
    : 'Scaling now rewrites the coordinates'));
}
function syncScaleUI(){
  [].forEach.call(document.querySelectorAll('#scaleMode button'),function(b){
    b.setAttribute('aria-pressed',String(b.dataset.sm===S.scaleMode));
  });
  document.getElementById('scLock').checked=S.scaleLock;
  document.getElementById('scEach').checked=S.scaleEach;
  document.getElementById('scEach').disabled=S.selLayers.length<2;
  document.getElementById('scaleNote').innerHTML =
    (S.scaleMode==='tf'
      ? 'Rides the layer transform, so the output wraps the shape in <code>'+g2n()+'.scale(&hellip;)</code> '
        +'about its own centre and the line width grows with it. The coordinates stay as they are.'
      : 'Rewrites the coordinates, so the emitted Java needs no <code>AffineTransform</code>. '
        +'Switching back to it folds any scale already on the transform into the numbers, '
        +'line width and all; text keeps the uniform part in its font size.')
    +' '+(S.scaleEach
      ? 'Each shape grows where it stands.'
      : 'The multiplier works about the selection&rsquo;s centre; the corner grips pivot on the opposite corner.');
}
document.getElementById('scaleMode').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b) return;
  setScaleMode(b.dataset.sm);
});
document.getElementById('scLock').onchange=function(){
  S.scaleLock=this.checked;
  if(S.scaleLock) document.getElementById('scFy').value=document.getElementById('scFx').value;
};
document.getElementById('scEach').onchange=function(){
  S.scaleEach=this.checked; syncScaleUI(); draw();
};
// with the aspect locked the two boxes are one number wearing two hats
function linkScaleFields(from,to){
  document.getElementById(from).addEventListener('input',function(){
    if(S.scaleLock) document.getElementById(to).value=this.value;
  });
}
linkScaleFields('scFx','scFy');
linkScaleFields('scFy','scFx');
document.getElementById('scApply').onclick=function(){
  applyScale(document.getElementById('scFx').value,
             document.getElementById('scFy').value);
};
document.getElementById('scHalf').onclick=function(){ applyScale(.5,.5); };
document.getElementById('scUp').onclick=function(){ applyScale(1.25,1.25); };
document.getElementById('scDouble').onclick=function(){ applyScale(2,2); };

document.getElementById('flipH').onclick=function(){ flip(true); };
document.getElementById('flipV').onclick=function(){ flip(false); };
document.getElementById('centreH').onclick=function(){
  var b=selBounds(); if(!b) return;
  push(); shiftSelection(Math.round((S.W-(b.x1-b.x0))/2-b.x0),0); sync();
};
document.getElementById('centreV').onclick=function(){
  var b=selBounds(); if(!b) return;
  push(); shiftSelection(0,Math.round((S.H-(b.y1-b.y0))/2-b.y0)); sync();
};

document.getElementById('addLayer').onclick=function(){
  push(); S.layers.push(normalize(defaults('path '+(S.layers.length+1),'path')));
  S.active=S.layers.length-1; S.selLayers=[S.active]; S.sel=null; sync();
};
document.getElementById('dupLayer').onclick=function(){
  var idxs=S.selLayers.slice().sort(function(a,b){ return a-b; });
  if(!idxs.length) return;
  push();
  var src=idxs.map(function(i){ return S.layers[i]; });
  var names=src.map(function(l){ return l.name+' copy'; });
  var copies=cloneLayers(src,S.snap?S.grid:10);   // nudged, or it hides under the original
  copies.forEach(function(c,k){ c.name=names[k]; });
  var at=idxs[idxs.length-1]+1;
  Array.prototype.splice.apply(S.layers,[at,0].concat(copies));
  S.selLayers=copies.map(function(c){ return S.layers.indexOf(c); });
  S.active=S.selLayers[S.selLayers.length-1]; S.sel=null; sync();
};
document.getElementById('delLayer').onclick=deleteLayers;
document.getElementById('groupLayer').onclick=doGroup;
document.getElementById('ungroupLayer').onclick=doUngroup;

['w','h'].forEach(function(id){
  document.getElementById(id).addEventListener('input',function(){
    var v=parseInt(this.value,10);
    if(!isNaN(v)&&v>0){ S[id==='w'?'W':'H']=v; sync(); }
  });
});
document.getElementById('gs').addEventListener('input',function(){
  var v=parseInt(this.value,10); if(!isNaN(v)&&v>0){ S.grid=v; draw(); }
});
function syncGridUI(){
  document.getElementById('gridCol').value=S.gridColor;
  document.getElementById('gridW').value=S.gridWidth;
  document.getElementById('gridMajor').value=S.gridMajor;
  document.getElementById('gridStyle').value=S.gridStyle;
  document.getElementById('gridOp').value=Math.round(S.gridOpacity*100);
  document.getElementById('gridOpVal').textContent=Math.round(S.gridOpacity*100)+'%';
  document.getElementById('gs').value=S.grid;
  document.getElementById('solidChk').checked=!!S.solidView;
}
/* ---- panel background & field prefix ---- */

function syncPrecisionUI(){
  document.getElementById('precision').value=S.precision;
  document.getElementById('precWhole').disabled=(S.precision===0);
  var sample=roundTo(404.46000000000004,S.precision);
  document.getElementById('precNote').innerHTML=
    'Every coordinate and size in the Java is rounded to this many places, so a point that '
    +'lands on <code>404.46000000000004</code> is written <code>'+sample+'</code>. '
    +(S.precision===0
        ? 'Whole pixels read cleanest, but a curve that was placed between them moves.'
        : 'Java draws in floating point either way &mdash; this only changes what the '
          +'source says. Shapes cut in the set lab are laid down at this precision too. '
          +'Alpha, dash lengths and scale factors keep their own precision, since rounding '
          +'those would change the drawing rather than tidy it.');
}
function syncSheetUI(){
  document.getElementById('bgCol').value=S.bg;
  document.getElementById('bgCol').disabled=!S.bgSet;
  document.getElementById('bgWhite').disabled=!S.bgSet;
  document.getElementById('bgSet').checked=S.bgSet;
  document.getElementById('varPrefix').value=S.varPrefix;
  document.getElementById('g2Name').value=S.g2Name||'g2';
  document.getElementById('bgNote').innerHTML = S.bgSet
    ? 'The sheet is painted with this colour and the class calls '
      +'<code>setBackground(&hellip;)</code>, so the output matches what you see.'
    : 'Nothing is emitted, so the panel keeps the look-and-feel&rsquo;s own colour. The sheet '
      +'shows Metal&rsquo;s <code>#EEEEEE</code>; the real shade depends on the platform. '
      +'A default <code>JPanel</code> is never white.';
}
document.getElementById('bgCol').oninput=function(){
  S.bg=this.value; emitCode(); draw(); renderLayers(); scheduleSave();
};
document.getElementById('bgWhite').onclick=function(){
  S.bg='#ffffff'; syncSheetUI(); emitCode(); draw(); renderLayers(); scheduleSave();
};
document.getElementById('bgSet').onchange=function(){
  S.bgSet=this.checked; syncSheetUI(); emitCode(); draw(); renderLayers(); scheduleSave();
};
// typing stays untouched; the field snaps to the identifier it will really become
document.getElementById('varPrefix').addEventListener('input',function(){
  S.varPrefix=javaIdent(this.value);
  emitCode(); renderLayers(); scheduleSave();
});
document.getElementById('varPrefix').addEventListener('change',function(){
  this.value=S.varPrefix;
});
// typing stays untouched; the field snaps to the identifier that will really be
// emitted. Blank falls back to g2 rather than producing nameless paint calls.
document.getElementById('g2Name').addEventListener('input',function(){
  var id=javaIdent(this.value);
  if(/^[0-9]/.test(id)) id='';
  if(RESERVED[id]) id=id+'Var';
  S.g2Name=id;
  emitCode(); scheduleSave();
});
document.getElementById('g2Name').addEventListener('change',function(){
  this.value=S.g2Name||'g2';
});

document.getElementById('gridCol').oninput=function(){ S.gridColor=this.value; draw(); };
document.getElementById('gridW').addEventListener('input',function(){
  var v=parseFloat(this.value);
  if(!isNaN(v)&&v>0){ S.gridWidth=Math.min(4,Math.max(0.5,v)); draw(); }
});
document.getElementById('gridMajor').addEventListener('input',function(){
  var v=parseInt(this.value,10);
  if(!isNaN(v)&&v>=2){ S.gridMajor=Math.min(20,v); draw(); }
});
document.getElementById('gridStyle').onchange=function(){ S.gridStyle=this.value; draw(); };
document.getElementById('gridOp').addEventListener('input',function(){
  S.gridOpacity=this.value/100;
  document.getElementById('gridOpVal').textContent=this.value+'%';
  draw();
});
document.getElementById('gridReset').onclick=function(){
  Object.keys(GRID_DEFAULTS).forEach(function(k){ S[k]=GRID_DEFAULTS[k]; });
  syncGridUI(); draw(); toast('Grid look reset');
};
document.getElementById('gridDark').onclick=function(){
  S.gridColor='#5c6b73'; S.gridOpacity=0.85; S.gridWidth=1;
  syncGridUI(); draw(); toast('High contrast grid');
};
document.getElementById('gridChk').onchange=function(){ S.showGrid=this.checked; syncRail(); draw(); };
document.getElementById('snapChk').onchange=function(){ S.snap=this.checked; syncRail(); };
document.getElementById('labelsChk').onchange=function(){ S.labels=this.checked; draw(); };
document.getElementById('aaChk').onchange=function(){ S.aa=this.checked; emitCode(); draw(); };
document.getElementById('solidChk').onchange=function(){ S.solidView=this.checked; draw(); scheduleSave(); };
document.getElementById('className').oninput=function(){ emitCode(); };
document.getElementById('outMode').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b) return;
  S.out=b.dataset.o;
  [].forEach.call(this.querySelectorAll('button'),function(x){
    x.setAttribute('aria-pressed',String(x.dataset.o===S.out));
  });
  document.getElementById('drawer').classList.remove('shut');
  emitCode();
});

/* ================= images: layers, textures, tracing ================= */

function readImageFile(f,cb){
  if(!f||!/^image\//.test(f.type)){ toast('That file is not an image'); return; }
  var rd=new FileReader();
  rd.onload=function(){ cb(rd.result,f.name); };
  rd.onerror=function(){ toast('Could not read that file'); };
  rd.readAsDataURL(f);
}
function addImageLayer(src,name){
  var img=new Image();
  img.onload=function(){
    IMGS[src]={el:img,ok:true};
    push();
    var l=normalize(defaults('image '+(S.layers.length+1),'image'));
    l.img={src:src,name:name||'image.png'};
    var sc=Math.min(1,S.W/img.naturalWidth,S.H/img.naturalHeight);
    l.g.w=Math.round(img.naturalWidth*sc); l.g.h=Math.round(img.naturalHeight*sc);
    l.g.x=Math.round((S.W-l.g.w)/2); l.g.y=Math.round((S.H-l.g.h)/2);
    S.layers.push(l); S.active=S.layers.length-1; S.selLayers=[S.active]; S.sel=null;
    sync(); showTab('shape'); setTool('select');
    toast('Image layer added. Drag the corners to size it');
  };
  img.onerror=function(){ toast('That image could not be decoded'); };
  img.src=src;
}
document.getElementById('addImgLayer').onclick=function(){ document.getElementById('imgNewFile').click(); };
document.getElementById('imgNewFile').addEventListener('change',function(e){
  var f=e.target.files[0]; e.target.value='';
  readImageFile(f,addImageLayer);
});
document.getElementById('traceToLayer').onclick=function(){
  if(!S.img){ toast('Load a trace photo first'); return; }
  push();
  var l=normalize(defaults('image '+(S.layers.length+1),'image'));
  l.img={src:S.img.src,name:'trace.png'};
  l.g.x=Math.round(S.img.x); l.g.y=Math.round(S.img.y);
  l.g.w=Math.round(S.img.natW*S.img.scale); l.g.h=Math.round(S.img.natH*S.img.scale);
  IMGS[S.img.src]={el:S.img.el,ok:true};
  S.layers.push(l); S.active=S.layers.length-1; S.selLayers=[S.active]; S.sel=null;
  sync(); showTab('shape');
  toast('Trace photo copied to a drawImage layer');
};
document.getElementById('imgReplace').onclick=function(){ document.getElementById('imgLayerFile').click(); };
document.getElementById('imgLayerFile').addEventListener('change',function(e){
  var f=e.target.files[0]; e.target.value='';
  readImageFile(f,function(src,name){
    push(); L().img={src:src,name:name}; sync();
  });
});
document.getElementById('imgNatural').onclick=function(){
  var l=L(); if(l.kind!=='image'||!l.img.src) return;
  var el=getImg(l.img.src); if(!el){ toast('Image still loading'); return; }
  push(); l.g.w=el.naturalWidth; l.g.h=el.naturalHeight; sync();
};
document.getElementById('texLoad').onclick=function(){ document.getElementById('texFile').click(); };
document.getElementById('texFile').addEventListener('change',function(e){
  var f=e.target.files[0]; e.target.value='';
  readImageFile(f,function(src,name){
    var img=new Image();
    img.onload=function(){
      IMGS[src]={el:img,ok:true};
      push();
      var l=L();
      l.tex={src:src,name:name,x:l.tex.x||0,y:l.tex.y||0,
             w:img.naturalWidth,h:img.naturalHeight};
      l.paint='texture';
      if(l.render==='draw') l.render='fill';
      sync();
    };
    img.onerror=function(){ toast('That image could not be decoded'); };
    img.src=src;
  });
});
document.getElementById('texFit').onclick=function(){
  var l=L(), b=layerBounds(l); if(!b) return;
  push();
  l.tex.x=Math.round(b.x0); l.tex.y=Math.round(b.y0);
  l.tex.w=Math.max(1,Math.round(b.x1-b.x0)); l.tex.h=Math.max(1,Math.round(b.y1-b.y0));
  sync();
};

/* ---- trace image ---- */

function loadImageFile(f){ readImageFile(f,function(src){ loadImageSrc(src); }); }
function loadImageSrc(src,keep){
  var img=new Image();
  img.onload=function(){
    var fit=Math.min(S.W/img.naturalWidth,S.H/img.naturalHeight,1);
    S.img={el:img,src:src,natW:img.naturalWidth,natH:img.naturalHeight,
           scale:keep?keep.scale:fit, alpha:keep?keep.alpha:.35,
           x:keep?keep.x:Math.round((S.W-img.naturalWidth*fit)/2),
           y:keep?keep.y:Math.round((S.H-img.naturalHeight*fit)/2)};
    document.getElementById('imgControls').style.display='';
    document.getElementById('imgEmptyNote').style.display='none';
    document.getElementById('removeImg').disabled=false;
    document.getElementById('imgScale').value=Math.round(S.img.scale*100);
    document.getElementById('scVal').textContent=Math.round(S.img.scale*100)+'%';
    document.getElementById('opacity').value=Math.round(S.img.alpha*100);
    document.getElementById('opVal').textContent=Math.round(S.img.alpha*100)+'%';
    document.getElementById('ix').value=S.img.x;
    document.getElementById('iy').value=S.img.y;
    if(!keep){ showTab('image'); setTool('image'); toast('Photo loaded. Drag to position, scroll to resize'); }
    sync();
  };
  img.onerror=function(){ toast('That image could not be decoded'); };
  img.src=src;
}
document.getElementById('traceBtn').onclick=function(){ document.getElementById('trace').click(); };
document.getElementById('trace').addEventListener('change',function(e){
  if(e.target.files[0]) loadImageFile(e.target.files[0]);
  e.target.value='';
});
document.getElementById('removeImg').onclick=function(){
  S.img=null;
  document.getElementById('imgControls').style.display='none';
  document.getElementById('imgEmptyNote').style.display='';
  this.disabled=true;
  if(S.tool==='image') setTool('line');
  sync();
};
document.getElementById('opacity').addEventListener('input',function(){
  document.getElementById('opVal').textContent=this.value+'%';
  if(S.img){ S.img.alpha=this.value/100; draw(); }
});
document.getElementById('imgScale').addEventListener('input',function(){
  document.getElementById('scVal').textContent=this.value+'%';
  if(S.img){ S.img.scale=this.value/100; draw(); }
});
['ix','iy'].forEach(function(id){
  document.getElementById(id).addEventListener('input',function(){
    var v=parseInt(this.value,10);
    if(!isNaN(v)&&S.img){ S.img[id==='ix'?'x':'y']=v; draw(); }
  });
});
document.getElementById('imgTop').onchange=function(){ S.imgTop=this.checked; draw(); };
document.getElementById('imgLock').onchange=function(){ S.imgLock=this.checked; draw(); };
document.getElementById('fitImg').onclick=function(){
  if(!S.img) return;
  var im=S.img;
  im.scale=Math.min(S.W/im.natW,S.H/im.natH);
  im.x=Math.round((S.W-im.natW*im.scale)/2);
  im.y=Math.round((S.H-im.natH*im.scale)/2);
  document.getElementById('imgScale').value=Math.round(im.scale*100);
  document.getElementById('scVal').textContent=Math.round(im.scale*100)+'%';
  document.getElementById('ix').value=im.x; document.getElementById('iy').value=im.y;
  draw();
};
document.getElementById('resetImg').onclick=function(){
  if(!S.img) return;
  S.img.x=0; S.img.y=0; S.img.scale=1;
  document.getElementById('imgScale').value=100;
  document.getElementById('scVal').textContent='100%';
  document.getElementById('ix').value=0; document.getElementById('iy').value=0;
  draw();
};
['dragenter','dragover'].forEach(function(t){
  stage.addEventListener(t,function(e){ e.preventDefault(); document.getElementById('dropzone').classList.add('on'); });
});
['dragleave','drop'].forEach(function(t){
  stage.addEventListener(t,function(e){ e.preventDefault(); document.getElementById('dropzone').classList.remove('on'); });
});
stage.addEventListener('drop',function(e){
  var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];
  if(f) loadImageFile(f);
});
document.addEventListener('paste',function(e){
  if(/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  var cd=e.clipboardData; if(!cd) return;
  // shapes copied from this app (possibly in another tab) arrive as tagged JSON
  var txt=cd.getData?cd.getData('text/plain'):'';
  if(txt){
    try{
      var d=JSON.parse(txt);
      if(d&&d.tag===CLIP_TAG&&d.layers&&d.layers.length){
        e.preventDefault(); pasteLayers(d.layers); return;
      }
    }catch(err){}
  }
  var items=cd.items||[];
  for(var i=0;i<items.length;i++){
    if(items[i].type.indexOf('image')===0){ loadImageFile(items[i].getAsFile()); e.preventDefault(); return; }
  }
  // clipboard write may have been blocked; fall back to the in-app copy
  if(!txt&&CLIP&&CLIP.length){ e.preventDefault(); pasteLayers(CLIP); }
});

/* ================= project ================= */

/* ================= session memory =================
   A refresh used to lose everything. The work is now mirrored into
   localStorage as you go and on the way out, unless you turn it off. */

var SKEY='pathPlotter/session@1', RKEY='pathPlotter/remember@1';
var saveT=null, sessionTrimmed=false;

function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }

function projectData(withImages){
  var layers=S.layers;
  if(!withImages){
    layers=JSON.parse(JSON.stringify(S.layers));
    layers.forEach(function(l){
      if(l.img) l.img.src='';
      if(l.tex) l.tex.src='';
    });
  }
  return {version:8,W:S.W,H:S.H,grid:S.grid,
    gridLook:{color:S.gridColor,opacity:S.gridOpacity,width:S.gridWidth,
              major:S.gridMajor,style:S.gridStyle},
    className:document.getElementById('className').value,
    bg:S.bg,bgSet:S.bgSet,varPrefix:S.varPrefix,g2Name:S.g2Name,solidView:S.solidView,
    precision:S.precision,
    rulers:{list:S.measures,mode:S.measMode,snaps:S.measSnaps,show:S.measShow},
    layers:layers,active:S.active,
    lab:{shapes:LAB.shapes,expr:LAB.expr},
    image:(withImages&&S.img)?{src:S.img.src,x:S.img.x,y:S.img.y,scale:S.img.scale,alpha:S.img.alpha}:null,
    trimmed:!withImages};
}
function isBlankSheet(){
  return S.layers.length===1&&S.layers[0].kind==='path'&&!(S.layers[0].pts||[]).length
    &&!S.img&&!LAB.shapes.length&&!S.measures.length;
}
function saveSession(){
  if(!S.remember) return;
  if(isBlankSheet()){ lsDel(SKEY); return; }
  if(lsSet(SKEY,JSON.stringify(projectData(true)))){ sessionTrimmed=false; return; }
  // photos are base64 and can blow the ~5MB quota; keep the shapes at least
  if(lsSet(SKEY,JSON.stringify(projectData(false)))&&!sessionTrimmed){
    sessionTrimmed=true;
    toast('Saved, but the images were too large to keep');
  }
}
function scheduleSave(){
  if(!S.remember) return;
  clearTimeout(saveT);
  saveT=setTimeout(saveSession,900);
}
function restoreSession(){
  var raw=lsGet(SKEY);
  if(!raw) return false;
  try{
    var d=JSON.parse(raw);
    if(!d||!d.layers||!d.layers.length) return false;
    applyProject(d);
    toast(d.trimmed?'Restored your work (images were not kept)':'Restored your last session');
    return true;
  }catch(e){ lsDel(SKEY); return false; }
}

function download(name,blob){
  var a=document.createElement('a'), url=URL.createObjectURL(blob);
  a.href=url; a.download=name; document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); },1000);
}
document.getElementById('saveProj').onclick=function(){
  download('path-plotter.json',
    new Blob([JSON.stringify(projectData(true))],{type:'application/json'}));
  toast('Project saved');
};
document.getElementById('openProj').onclick=function(){ document.getElementById('projFile').click(); };
// shared by "Open .json" and by restoring the last session after a refresh
function applyProject(d){
  if(!d||!d.layers||!d.layers.length) throw new Error('no shapes');
  S.W=d.W||600; S.H=d.H||450; S.grid=d.grid||25;
  var gl=d.gridLook||{};
  S.gridColor=gl.color||GRID_DEFAULTS.gridColor;
  S.gridOpacity=(typeof gl.opacity==='number')?gl.opacity:GRID_DEFAULTS.gridOpacity;
  S.gridWidth=gl.width||GRID_DEFAULTS.gridWidth;
  S.gridMajor=gl.major||GRID_DEFAULTS.gridMajor;
  S.gridStyle=gl.style||GRID_DEFAULTS.gridStyle;
  S.layers=d.layers.map(normalize);
  S.active=Math.min(d.active||0,S.layers.length-1);
  S.selLayers=[S.active];
  S.layers.forEach(function(l){
    if(l.kind==='image'&&l.img.src) getImg(l.img.src);
    if(l.paint==='texture'&&l.tex.src) getImg(l.tex.src);
  });
  document.getElementById('w').value=S.W;
  document.getElementById('h').value=S.H;
  S.bg=d.bg||'#ffffff';
  S.bgSet=(d.bgSet===undefined)?true:!!d.bgSet;
  S.varPrefix=d.varPrefix||'';
  S.g2Name=d.g2Name||'g2';
  S.precision=(typeof d.precision==='number')?d.precision:2;
  var ru=d.rulers||{};
  S.measures=Array.isArray(ru.list)?ru.list:[];
  S.measMode=MEASMODE[ru.mode]||'span';
  S.measSnaps=Array.isArray(ru.snaps)?ru.snaps.filter(function(k){ return SNAPKINDS.indexOf(k)>=0; })
                                     :SNAPKINDS.slice();
  S.measShow=(ru.show===undefined)?true:!!ru.show;
  S.measSel=S.measures.length?0:-1;
  S.measDraft=null; S.measGapFrom=-1;
  S.solidView=!!d.solidView;
  if(S.layers.some(function(l){ return l.isClip; })
     && !S.layers.some(function(l){ return l.clipped; })){
    var seen=false;
    S.layers.forEach(function(l){ if(seen&&!l.isClip) l.clipped=true; if(l.isClip) seen=true; });
  }
  syncGridUI(); syncSheetUI(); syncPrecisionUI(); syncMeasures();
  // the lab is scratch work, but losing it on a refresh would still sting
  LAB.shapes=(d.lab&&d.lab.shapes||[]).map(normalize)
    .filter(function(l){ return !!l.labTag; });
  LAB.expr=(d.lab&&d.lab.expr)||'A − B';
  LAB.sel=LAB.shapes.length?0:-1;
  LABCACHE={k:null,rings:null,err:''};
  LABHIST.length=0;
  if(LAB.on){ document.getElementById('slExpr').value=LAB.expr; labChanged(); }
  if(d.className) document.getElementById('className').value=d.className;
  if(d.image&&d.image.src) loadImageSrc(d.image.src,d.image);
  sync();
  // always fit: a stored pan/zoom is worth little and can strand the sheet off-screen
  fitView();
}
document.getElementById('projFile').addEventListener('change',function(e){
  var f=e.target.files[0]; if(!f) return;
  var rd=new FileReader();
  rd.onload=function(){
    try{
      push();
      applyProject(JSON.parse(rd.result));
      toast('Project opened');
    }catch(err){ toast('That file is not a Path Plotter project'); }
  };
  rd.readAsText(f);
  e.target.value='';
});
document.getElementById('exportPng').onclick=function(){
  var dpr=2, c=document.createElement('canvas');
  c.width=S.W*dpr; c.height=S.H*dpr;
  var cc=c.getContext('2d');
  cc.scale(dpr,dpr);
  cc.fillStyle=sheetBg(); cc.fillRect(0,0,S.W,S.H);
  paintAll(cc,1,[],true);
  c.toBlob(function(b){ download('path-plotter.png',b); toast('PNG exported'); });
};
document.getElementById('clearAll').onclick=function(){
  push();
  S.layers=[normalize(defaults('path 1','path'))]; S.active=0; S.selLayers=[0]; S.sel=null;
  sync(); toast('Cleared. Ctrl+Z brings it back');
};

/* ================= window preview =================
   The sheet is not a JPanel: it has a grid, rulers, handles and a zoom. This
   renders the drawing the way Swing will, at 1:1, inside mocked frame chrome,
   and puts the two sizes that actually differ side by side. */

// a decorated JFrame on Windows at 100% scaling; getInsets() is the only truth
// at runtime, which is why the emitted main() sizes the frame with pack()
var PV_INSET={top:31,side:8,bottom:8};
var pvOn=false, pvTick=null, pvPos=null;

// the readout sits beside the mock above 860px and below it under that, so the
// room left for the render changes axis with the layout
function pvScale(){
  var side=window.innerWidth>860;
  var w=window.innerWidth-(side?390:56);
  var h=window.innerHeight-(side?112:290);
  return Math.min(1,Math.max(.1,Math.min(w/S.W,h/S.H)));
}
// how many shapes hang off the panel: the sheet border hides this, Swing will not
function pvClipped(){
  var out=[];
  S.layers.forEach(function(l,i){
    if(!l.visible) return;
    var b=layerBox(l); if(!b) return;
    if(b.x0<-0.5||b.y0<-0.5||b.x1>S.W+0.5||b.y1>S.H+0.5) out.push(i);
  });
  return out;
}
// the warning names the offenders; clicking one selects it so it can be found
document.getElementById('pvWarn').addEventListener('click',function(e){
  var b=e.target.closest('.pvpick'); if(!b) return;
  var i=+b.dataset.i; if(!S.layers[i]) return;
  setSel([i],i); S.sel=null; sync();
});
function paintPreview(){
  if(!pvOn) return;
  var cv=document.getElementById('pvCanvas');
  var dpr=window.devicePixelRatio||1, sc=pvScale();
  var cw=Math.max(1,Math.round(S.W*sc)), ch=Math.max(1,Math.round(S.H*sc));
  cv.style.width=cw+'px'; cv.style.height=ch+'px';
  cv.width=Math.round(cw*dpr); cv.height=Math.round(ch*dpr);
  var c=cv.getContext('2d');
  c.setTransform(dpr*sc,0,0,dpr*sc,0,0);
  c.imageSmoothingEnabled=S.aa;
  c.fillStyle=sheetBg(); c.fillRect(0,0,S.W,S.H);
  paintAll(c,1,[],true);          // solid: no dimming, no editor furniture

  var cn=classNameOf();
  document.getElementById('pvTitle').textContent=cn;
  document.getElementById('pvPanel').textContent=S.W+' × '+S.H;
  document.getElementById('pvFrame').textContent=
    '≈ '+(S.W+PV_INSET.side*2)+' × '+(S.H+PV_INSET.top+PV_INSET.bottom);
  document.getElementById('pvZoom').textContent=Math.round(sc*100)+'%';

  var clip=pvClipped(), warn=document.getElementById('pvWarn');
  // the key carries names too, so renaming a clipped shape refreshes its button
  var key=clip.map(function(i){ return i+':'+S.layers[i].name; }).join(',');
  // paintPreview runs per frame: only touch the DOM when the offending set changes,
  // otherwise the buttons are replaced out from under the pointer mid-click
  if(warn.dataset.key!==key){
    warn.dataset.key=key;
    var names=clip.map(function(i){
      return '<button type="button" class="pvpick" data-i="'+i+'">'+esc(S.layers[i].name)+'</button>';
    }).join(', ');
    warn.innerHTML = !clip.length ? ''
      : clip.length===1 ? names+' reaches past the panel and Swing will clip it.'
      : clip.length+' shapes reach past the panel and Swing will clip them: '+names+'.';
  }
  document.getElementById('pvNote').innerHTML =
    'The panel is exactly the sheet. The frame is bigger by the window insets, which is '
    +'why <code>pack()</code> in the emitted <code>main</code> is the only reliable way to '
    +'get the panel you asked for &mdash; the frame figure above is an estimate for a '
    +'Windows title bar and borders.'
    +(sc<1?' Scaled down here to fit; the numbers are the real ones.':'');
}
// draw() runs per frame, so coalesce to one preview paint per frame
function pvSchedule(){
  if(!pvOn||pvTick) return;
  pvTick=requestAnimationFrame(function(){ pvTick=null; paintPreview(); });
}
function pvPlace(){
  var el=document.getElementById('preview');
  var r=el.getBoundingClientRect();
  if(!pvPos) pvPos={x:Math.max(8,(window.innerWidth-r.width)/2),
                    y:Math.max(8,(window.innerHeight-r.height)/2)};
  pvPos.x=Math.min(pvPos.x,Math.max(8,window.innerWidth-r.width-8));
  pvPos.y=Math.min(pvPos.y,Math.max(8,window.innerHeight-r.height-8));
  el.style.left=Math.max(8,pvPos.x)+'px';
  el.style.top=Math.max(8,pvPos.y)+'px';
}
function showPreview(on){
  pvOn=(on===undefined)?!pvOn:!!on;
  document.getElementById('preview').classList.toggle('on',pvOn);
  if(pvOn){ paintPreview(); pvPlace(); }
  else if(pvTick){ cancelAnimationFrame(pvTick); pvTick=null; }
}
document.getElementById('pvClose').onclick=function(){ showPreview(false); };
document.getElementById('openPreview').onclick=function(){ MENUCLOSE(); showPreview(true); };
window.addEventListener('resize',function(){ if(pvOn){ paintPreview(); pvPlace(); } });

document.getElementById('pvHead').addEventListener('pointerdown',function(e){
  if(e.button!==0||e.target.closest('button')) return;
  var head=this, el=document.getElementById('preview');
  var r=el.getBoundingClientRect();
  var off={x:e.clientX-r.left, y:e.clientY-r.top};
  head.classList.add('drag');
  try{ head.setPointerCapture(e.pointerId); }catch(err){}
  function move(ev){ pvPos={x:ev.clientX-off.x, y:ev.clientY-off.y}; pvPlace(); }
  function up(){
    head.classList.remove('drag');
    head.removeEventListener('pointermove',move);
    head.removeEventListener('pointerup',up);
    head.removeEventListener('pointercancel',up);
  }
  head.addEventListener('pointermove',move);
  head.addEventListener('pointerup',up);
  head.addEventListener('pointercancel',up);
});

/* ================= drawer, copy, toast ================= */

document.getElementById('drawerBar').onclick=function(e){
  // any control in the bar acts on its own; only the bare bar toggles the drawer.
  // listing controls by id missed 'build once' and would miss the next one added
  if(e.target.closest('button,input,label,select')) return;
  document.getElementById('drawer').classList.toggle('shut');
  requestAnimationFrame(resize);
};
document.getElementById('copy').onclick=function(e){
  e.stopPropagation();
  var txt=outputText();
  if(!txt.trim()){ toast('Nothing to copy yet'); return; }
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){toast('Code copied');},fb);
  } else fb();
  function fb(){
    var ta=document.createElement('textarea');
    ta.value=txt; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); toast('Code copied'); }
    catch(err){ toast('Select the code and copy manually'); }
    document.body.removeChild(ta);
  }
};
document.getElementById('zoomIn').onclick=function(){ zoomCentre(S.view.z*1.25); };
document.getElementById('zoomOut').onclick=function(){ zoomCentre(S.view.z/1.25); };
document.getElementById('zoomFit').onclick=fitView;
document.getElementById('helpClose').onclick=function(){ document.getElementById('help').classList.remove('on'); };
document.getElementById('help').onclick=function(e){ if(e.target===this) this.classList.remove('on'); };

var toastEl=document.getElementById('toast'),toastT;
function toast(msg){
  toastEl.textContent=msg; toastEl.classList.add('on');
  clearTimeout(toastT);
  toastT=setTimeout(function(){toastEl.classList.remove('on');},1900);
}

/* ================= resizable side panels ================= */

function dragBar(bar,vertical,apply){
  bar.addEventListener('pointerdown',function(e){
    if(e.button!==0) return;
    e.preventDefault();
    bar.classList.add('on');
    document.body.classList.add(vertical?'resizing-v':'resizing');
    var start=vertical?e.clientY:e.clientX;
    var base=apply.read();
    function mv(ev){ apply.set(base,(vertical?ev.clientY:ev.clientX)-start); resize(); }
    function up(){
      document.removeEventListener('pointermove',mv);
      document.removeEventListener('pointerup',up);
      bar.classList.remove('on');
      document.body.classList.remove('resizing','resizing-v');
      resize();
    }
    document.addEventListener('pointermove',mv);
    document.addEventListener('pointerup',up);
  });
}
function initResizers(){
  var side=document.getElementById('side');
  var wrap=document.getElementById('stackwrap');
  dragBar(document.getElementById('sideResize'),false,{
    read:function(){ return side.getBoundingClientRect().width; },
    set:function(base,d){
      side.style.width=Math.max(250,Math.min(760,base-d))+'px';
    }
  });
  dragBar(document.getElementById('stackResize'),true,{
    read:function(){ return wrap.getBoundingClientRect().height; },
    set:function(base,d){
      var lim=side.getBoundingClientRect().height-170;
      wrap.style.height=Math.max(120,Math.min(Math.max(140,lim),base-d))+'px';
    }
  });
}

/* ================= top-left menus ================= */

function initMenus(){
  var bar=document.getElementById('menubar');
  if(!bar) return;
  var menus=[].slice.call(bar.querySelectorAll('.menu'));
  var openT=null, closeT=null;
  function closeAll(){
    menus.forEach(function(m){
      m.classList.remove('open');
      m.querySelector('button').setAttribute('aria-expanded','false');
    });
  }
  function open(m){
    closeAll(); m.classList.add('open');
    m.querySelector('button').setAttribute('aria-expanded','true');
  }
  function anyOpen(){ return menus.some(function(m){ return m.classList.contains('open'); }); }
  menus.forEach(function(m){
    var btn=m.querySelector('button');
    btn.addEventListener('click',function(e){
      e.stopPropagation(); clearTimeout(openT);
      if(m.classList.contains('open')) closeAll(); else open(m);
    });
    // once one is open the others follow the pointer, the way a menu bar should
    m.addEventListener('mouseenter',function(){
      clearTimeout(closeT); clearTimeout(openT);
      if(anyOpen()) open(m);
      else openT=setTimeout(function(){ open(m); },240);
    });
    m.addEventListener('mouseleave',function(){ clearTimeout(openT); });
  });
  bar.addEventListener('mouseenter',function(){ clearTimeout(closeT); });
  bar.addEventListener('mouseleave',function(){
    clearTimeout(openT);
    closeT=setTimeout(closeAll,340);
  });
  document.addEventListener('pointerdown',function(e){
    if(!bar.contains(e.target)) closeAll();
  });
  MENUCLOSE=closeAll;
}
var MENUCLOSE=function(){};

/* ================= fine placement & fonts ================= */

document.getElementById('fineKey').onchange=function(){ S.fineKey=this.value; };
document.getElementById('fineStep').addEventListener('input',function(){
  var v=parseInt(this.value,10);
  if(!isNaN(v)&&v>0) S.fineStep=v;
});
// only redraw on the edge: a held key repeats, and the grips do not move
function setScaleMod(on){
  on=!!on;
  if(on===S.scaleMod) return;
  S.scaleMod=on;
  if(S.tool==='select') draw();
}
function fineStatus(on){
  if(textEdit) return;
  if(on) setStatus('fine','Fine placement: snapping off, '+S.fineStep+'px steps',true);
  else toolStatus();
}

var SYSFONTS=[];
function ensureFontOption(name){
  if(!name) return;
  var sel=document.getElementById('tfam');
  if([].some.call(sel.options,function(o){ return o.value===name; })) return;
  var og=document.getElementById('sysFontGroup');
  if(!og){
    og=document.createElement('optgroup');
    og.id='sysFontGroup'; og.label='Installed fonts';
    sel.appendChild(og);
  }
  var o=document.createElement('option');
  o.value=name; o.textContent=name; og.appendChild(o);
}
document.getElementById('sysFonts').onclick=function(){
  if(!window.queryLocalFonts){
    toast('This browser has no Local Font Access API');
    return;
  }
  // the browser prompts for permission; nothing is read until the user allows it
  window.queryLocalFonts().then(function(fonts){
    var fams=[];
    fonts.forEach(function(f){ if(fams.indexOf(f.family)<0) fams.push(f.family); });
    fams.sort(function(a,b){ return a.localeCompare(b); });
    if(!fams.length){
      // permission dismissed, or the browser exposed nothing
      toast('No system fonts were shared');
      document.getElementById('fontNote').textContent=
        'The browser returned no families; permission may have been dismissed. '
        +'The four logical names always work.';
      return;
    }
    SYSFONTS=fams;
    var sel=document.getElementById('tfam');
    var og=document.getElementById('sysFontGroup');
    if(og) og.parentNode.removeChild(og);
    og=document.createElement('optgroup');
    og.id='sysFontGroup'; og.label='Installed fonts';
    fams.forEach(function(f){
      var o=document.createElement('option');
      o.value=f; o.textContent=f; og.appendChild(o);
    });
    sel.appendChild(og);
    document.getElementById('fontNote').textContent=
      fams.length+' installed families available. Java resolves these by name, so the machine running '
      +'your class needs them too; the four logical names never fail.';
    syncProps();
    toast('Loaded '+fams.length+' system fonts');
  }).catch(function(err){
    toast(err&&err.name==='NotAllowedError'?'Font access was denied':'Could not read system fonts');
  });
};
document.getElementById('editOnCanvas').onclick=function(){
  if(L()&&L().kind==='text') openTextEditor(S.active);
};

/* ================= keyboard ================= */

// the fine key has to be live even when the pointer is still
document.addEventListener('keydown',function(e){
  if(fineOn(e)&&!S.fine){ S.fine=true; fineStatus(true); }
  setScaleMod(e.ctrlKey||e.metaKey);
});
document.addEventListener('keyup',function(e){
  if(S.fine&&!fineOn(e)){ S.fine=false; fineStatus(false); }
  setScaleMod(e.ctrlKey||e.metaKey);
});
window.addEventListener('blur',function(){
  if(S.fine){ S.fine=false; fineStatus(false); }
  setScaleMod(false);
});

document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    if(measCancel()){ e.preventDefault(); return; }
    MENUCLOSE(); hideCtx(); if(pvOn) showPreview(false); if(LAB.on) showSetLab(false);
  }
  // A checkbox or a slider has no undo of its own, so the app's has to reach it:
  // ticking "Use as clip region" and pressing Ctrl+Z used to do nothing at all.
  // Typing fields keep their own undo, and the bare letter keys stay out of both.
  var ae=document.activeElement, tag=ae.tagName;
  var typing=(tag==='TEXTAREA')||
    (tag==='INPUT'&&/^(text|number|search|email|url|tel|password)$/.test(ae.type||'text'));
  if(typing) return;
  var k=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&k==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if((e.ctrlKey||e.metaKey)&&k==='y'){ e.preventDefault(); redo(); return; }
  if((e.ctrlKey||e.metaKey)&&k==='s'){ e.preventDefault(); document.getElementById('saveProj').click(); return; }
  if((e.ctrlKey||e.metaKey)&&k==='g'){ e.preventDefault(); e.shiftKey?doUngroup():doGroup(); return; }
  if((e.ctrlKey||e.metaKey)&&k==='c'){ e.preventDefault(); copySelection(false); return; }
  if((e.ctrlKey||e.metaKey)&&k==='x'){ e.preventDefault(); copySelection(true); return; }
  if((e.ctrlKey||e.metaKey)&&k==='d'){ e.preventDefault(); document.getElementById('dupLayer').click(); return; }
  if((e.ctrlKey||e.metaKey)&&k==='a'){
    e.preventDefault();
    var all=[]; for(var n=0;n<S.layers.length;n++) all.push(n);
    setSel(all,S.active); S.sel=null; sync(); return;
  }
  if(e.ctrlKey||e.metaKey) return;
  if(/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;   // no tool switching from a control
  if(e.key==='?'){ document.getElementById('help').classList.toggle('on'); return; }
  if(k==='escape'){ document.getElementById('help').classList.remove('on'); return; }

  if(k==='v') setTool('select');
  else if(k==='1') setTool('line');
  else if(k==='2') setTool('quad');
  else if(k==='3') setTool('cubic');
  else if(k==='r') setTool('rect');
  else if(k==='e') setTool('ellipse');
  else if(k==='a') setTool('arc');
  else if(k==='t') setTool('text');
  else if(k==='h') setTool('pan');
  else if(k==='i') setTool('image');
  else if(k==='g'){ S.showGrid=!S.showGrid; document.getElementById('gridChk').checked=S.showGrid; syncRail(); draw(); }
  else if(k==='s'){ S.snap=!S.snap; document.getElementById('snapChk').checked=S.snap; syncRail(); toast(S.snap?'Snap on':'Snap off'); }
  else if(k==='d'){ S.solidView=!S.solidView; document.getElementById('solidChk').checked=S.solidView; draw(); scheduleSave(); toast(S.solidView?'True opacity: all shapes solid':'Dimming unselected shapes'); }
  else if(k==='m'){ S.nextIsMove=true; if(S.tool==='select') setTool('line'); toast('Next click starts a new subpath'); }
  else if(k==='l') setTool('measure');
  else if(k==='p') showPreview();
  else if(k==='b') showSetLab();
  else if(k==='n') document.getElementById('addLayer').click();
  else if(k==='u'){ var l0=L(); if(l0.kind==='path'&&l0.pts.length){ push(); l0.pts.pop(); S.sel=null; sync(); } }
  else if(k==='delete'||k==='backspace'){
    e.preventDefault();
    if(S.tool==='measure'&&S.measSel>=0) measDelete(S.measSel);
    else if(S.sel) deleteSelected(); else deleteLayers();
  }
  else if(k==='0') fitView();
  else if(k==='='||k==='+') zoomCentre(S.view.z*1.25);
  else if(k==='-'||k==='_') zoomCentre(S.view.z/1.25);
  else if(k==='[') { if(S.active>0){ setSel([S.active-1],S.active-1); S.sel=null; sync(); } }
  else if(k===']') { if(S.active<S.layers.length-1){ setSel([S.active+1],S.active+1); S.sel=null; sync(); } }
  else if(k.indexOf('arrow')===0){
    var l=L(); e.preventDefault();
    var step=S.fine?S.fineStep:(e.shiftKey?10:1);
    var dx=(k==='arrowleft'?-step:k==='arrowright'?step:0);
    var dy=(k==='arrowup'?-step:k==='arrowdown'?step:0);
    if(l.kind==='path'&&S.sel){
      var p=l.pts[S.sel.i]; if(!p) return;
      if(S.sel.key==='a'){ p.x+=dx; p.y+=dy; }
      else if(S.sel.key==='c'){ p.cx+=dx; p.cy+=dy; }
      else if(S.sel.key==='c1'){ p.c1x+=dx; p.c1y+=dy; }
      else if(S.sel.key==='c2'){ p.c2x+=dx; p.c2y+=dy; }
    } else shiftSelection(dx,dy);
    syncProps(); emitCode(); draw(); renderLayers();
  }
});

/* ================= session wiring ================= */

['input','change'].forEach(function(ev){
  document.getElementById('precision').addEventListener(ev,function(){
    var v=parseInt(this.value,10);
    if(!isFinite(v)) return;
    S.precision=Math.max(0,Math.min(6,v));
    syncPrecisionUI(); emitCode(); scheduleSave();
    if(LAB.on) labRenderOut();
  });
});
document.getElementById('precWhole').onclick=function(){
  S.precision=0;
  syncPrecisionUI(); emitCode(); scheduleSave();
  if(LAB.on) labRenderOut();
  toast('Coordinates written as whole pixels');
};

document.getElementById('remember').onchange=function(){
  S.remember=this.checked;
  lsSet(RKEY,S.remember?'1':'0');
  if(S.remember){ saveSession(); toast('Your work will be kept in this browser'); }
  else { lsDel(SKEY); toast('Autosave off, and the stored copy was cleared'); }
};
document.getElementById('forgetSession').onclick=function(){
  lsDel(SKEY); sessionTrimmed=false; toast('Stored work cleared');
};
// pagehide is the reliable one; visibilitychange covers phones and tab switches
window.addEventListener('pagehide',saveSession);
window.addEventListener('beforeunload',saveSession);
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden') saveSession();
});

/* ================= ruler =================
   A measuring tool, not a drawing one: nothing here ever reaches the Java or the
   window preview. What makes it worth having is where the ends land -- CAD's
   object snaps. Asking for "the midpoint" should give you the real midpoint of
   that segment, not the nearest grid intersection to where you happened to click,
   so every candidate below is derived from the geometry and named on screen
   before you commit to it. Measurements are records of what you measured: they
   keep the coordinates they were taken at rather than trailing a shape around. */

var SNAPKINDS=['endpoint','midpoint','centre','quadrant','intersection','grid'];
// a nearer candidate usually wins, but a corner a couple of pixels further off is
// still what you meant; the bonus is the tie-break, in screen pixels
var SNAPBONUS={endpoint:3,intersection:2.5,midpoint:2,quadrant:1.5,centre:1,grid:0};
var SNAPGLYPH={endpoint:'square',midpoint:'triangle',centre:'circle',
               quadrant:'diamond',intersection:'cross',grid:'plus'};

var MEASMODE={span:'span',angle:'angle',gap:'gap'};

/* ---- candidates ---- */

function measEnabled(k){ return S.measSnaps.indexOf(k)>=0; }

function boxPoints(b,out,name){
  out.push({x:b.x0,y:b.y0,kind:'endpoint',of:name},
           {x:b.x1,y:b.y0,kind:'endpoint',of:name},
           {x:b.x1,y:b.y1,kind:'endpoint',of:name},
           {x:b.x0,y:b.y1,kind:'endpoint',of:name});
  out.push({x:(b.x0+b.x1)/2,y:b.y0,kind:'midpoint',of:name},
           {x:b.x1,y:(b.y0+b.y1)/2,kind:'midpoint',of:name},
           {x:(b.x0+b.x1)/2,y:b.y1,kind:'midpoint',of:name},
           {x:b.x0,y:(b.y0+b.y1)/2,kind:'midpoint',of:name});
  out.push({x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2,kind:'centre',of:name});
}

// everything a single shape offers, in sheet space with its transform applied
function snapPointsFor(l){
  var out=[],g=norm(l.g),n=l.name,i;
  if(l.kind==='rect'||l.kind==='image'){
    boxPoints({x0:g.x,y0:g.y,x1:g.x+g.w,y1:g.y+g.h},out,n);
  } else if(l.kind==='ellipse'){
    var cx=g.x+g.w/2, cy=g.y+g.h/2, rx=g.w/2, ry=g.h/2;
    out.push({x:cx,y:cy,kind:'centre',of:n});
    // the four points where the curve is horizontal or vertical: CAD's quadrants,
    // and the only points on an ellipse a bounding box actually touches
    out.push({x:cx+rx,y:cy,kind:'quadrant',of:n},{x:cx,y:cy+ry,kind:'quadrant',of:n},
             {x:cx-rx,y:cy,kind:'quadrant',of:n},{x:cx,y:cy-ry,kind:'quadrant',of:n});
  } else if(l.kind==='arc'){
    var acx=g.x+g.w/2, acy=g.y+g.h/2, arx=g.w/2, ary=g.h/2;
    out.push({x:acx,y:acy,kind:'centre',of:n});
    out.push(Object.assign(arcPoint(acx,acy,arx,ary,l.g.start),{kind:'endpoint',of:n}));
    out.push(Object.assign(arcPoint(acx,acy,arx,ary,l.g.start+l.g.extent),
             {kind:'endpoint',of:n}));
    out.push(Object.assign(arcPoint(acx,acy,arx,ary,l.g.start+l.g.extent/2),
             {kind:'midpoint',of:n}));
  } else if(l.kind==='text'){
    var tb=layerBounds(l);
    if(tb) boxPoints(tb,out,n);
    out.push({x:l.text.x,y:l.text.y,kind:'endpoint',of:n});   // where the baseline starts
  } else if(l.kind==='path'){
    var pts=l.pts||[];
    for(i=0;i<pts.length;i++){
      out.push({x:pts[i].x,y:pts[i].y,kind:'endpoint',of:n});
      if(i>0&&pts[i].cmd!=='move')
        out.push(Object.assign(segPoint(pts[i-1],pts[i],0.5),{kind:'midpoint',of:n}));
    }
    var pb=layerBounds(l);
    if(pb) out.push({x:(pb.x0+pb.x1)/2,y:(pb.y0+pb.y1)/2,kind:'centre',of:n});
  }
  if(hasTf(l)){
    var T=tfMapper(l);
    out=out.map(function(p){ var q=T(p.x,p.y); return {x:q.x,y:q.y,kind:p.kind,of:p.of}; });
  }
  return out;
}

// crossings between two outlines. Only worth computing for shapes the pointer is
// already near, so the flattened rings never get walked in full on a quiet move
function crossingsNear(px,py,r){
  var near=[],out=[];
  S.layers.forEach(function(l,i){
    if(!l.visible||l.kind==='image') return;
    var b=layerBox(l);
    if(!b||px<b.x0-r||px>b.x1+r||py<b.y0-r||py>b.y1+r) return;
    var rings=memberRings(l,null);
    if(rings&&rings.length) near.push({l:l,rings:rings});
  });
  if(near.length<2) return out;
  function segsOf(m){
    var s=[];
    m.rings.forEach(function(ring){
      for(var j=0;j<ring.length;j++){
        var a=ring[j], b=ring[(j+1)%ring.length];
        // only the pieces running past the pointer can cross inside the radius
        if(Math.min(a.x,b.x)>px+r||Math.max(a.x,b.x)<px-r) continue;
        if(Math.min(a.y,b.y)>py+r||Math.max(a.y,b.y)<py-r) continue;
        s.push({a:a,b:b});
      }
    });
    return s;
  }
  for(var i=0;i<near.length;i++){
    var si=segsOf(near[i]);
    if(!si.length) continue;
    for(var j=i+1;j<near.length;j++){
      var sj=segsOf(near[j]);
      if(!sj.length||si.length*sj.length>40000) continue;
      for(var a=0;a<si.length;a++) for(var b=0;b<sj.length;b++){
        var hit=segInt(si[a],sj[b]);
        if(!hit) continue;
        out.push({x:si[a].a.x+(si[a].b.x-si[a].a.x)*hit.t,
                  y:si[a].a.y+(si[a].b.y-si[a].a.y)*hit.t,
                  kind:'intersection',of:near[i].l.name+' × '+near[j].l.name});
      }
    }
  }
  return out;
}

// An end placed on nothing in particular lands on a whole pixel. This is a sheet
// measured in pixels, so 216.387 is noise dressed up as precision, and it makes
// every reading downstream look approximate when it is not. Holding the fine key
// steps by the configured amount instead, the same as placing anything else --
// that step is a whole number too, so nothing here can land between pixels.
// Ends that snap keep their exact coordinates: an arc endpoint really is at
// 240.47694, and rounding it away would throw out the reason the snap exists.
function measFree(v){
  return S.fine?Math.round(v/S.fineStep)*S.fineStep:Math.round(v);
}
// the one candidate the pointer is actually asking for, or a plain unsnapped point
function measSnap(sx,sy){
  var r=13/S.view.z, best=null, bestScore=1e9;
  function consider(p){
    if(!measEnabled(p.kind)) return;
    var d=Math.hypot(p.x-sx,p.y-sy);
    if(d>r) return;
    var score=d*S.view.z-(SNAPBONUS[p.kind]||0);
    if(score<bestScore){ bestScore=score; best=p; }
  }
  S.layers.forEach(function(l){
    if(!l.visible) return;
    snapPointsFor(l).forEach(consider);
  });
  if(measEnabled('intersection')) crossingsNear(sx,sy,r).forEach(consider);
  if(measEnabled('grid')&&S.grid>0)
    consider({x:Math.round(sx/S.grid)*S.grid,y:Math.round(sy/S.grid)*S.grid,
              kind:'grid',of:S.grid+' px grid'});
  if(best) return {x:best.x,y:best.y,kind:best.kind,of:best.of};
  return {x:measFree(sx),y:measFree(sy),kind:null,of:null};
}

/* ---- gap between two outlines ---- */

function segDist(p,q,a,b){          // distance between segment pq and segment ab
  function pd(px,py,ax,ay,bx,by){
    var dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy;
    var t=L?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/L)):0;
    return {d:Math.hypot(px-(ax+dx*t),py-(ay+dy*t)),x:ax+dx*t,y:ay+dy*t};
  }
  if(segInt({a:p,b:q},{a:a,b:b})) return {d:0,p:p,q:p};
  var c=[];
  var r1=pd(p.x,p.y,a.x,a.y,b.x,b.y); c.push({d:r1.d,p:p,q:{x:r1.x,y:r1.y}});
  var r2=pd(q.x,q.y,a.x,a.y,b.x,b.y); c.push({d:r2.d,p:q,q:{x:r2.x,y:r2.y}});
  var r3=pd(a.x,a.y,p.x,p.y,q.x,q.y); c.push({d:r3.d,p:{x:r3.x,y:r3.y},q:a});
  var r4=pd(b.x,b.y,p.x,p.y,q.x,q.y); c.push({d:r4.d,p:{x:r4.x,y:r4.y},q:b});
  return c.reduce(function(m,o){ return o.d<m.d?o:m; });
}
// rings can run to thousands of points after flattening; a clearance figure does
// not need every one of them, and an O(n·m) sweep over the lot would stall a drag
function decimate(rings,cap){
  var total=0;
  rings.forEach(function(r){ total+=r.length; });
  var step=Math.max(1,Math.ceil(total/cap)),out=[];
  rings.forEach(function(r){
    var keep=[];
    for(var i=0;i<r.length;i+=step) keep.push(r[i]);
    if(keep.length>=2) out.push(keep);
  });
  return out.length?out:rings;
}
function ringSegs(rings){
  var s=[];
  rings.forEach(function(r){
    for(var i=0;i<r.length;i++) s.push({a:r[i],b:r[(i+1)%r.length]});
  });
  return s;
}
function measureGap(i,j){
  var la=S.layers[i], lb=S.layers[j];
  if(!la||!lb) return null;
  var ra=memberRings(la,null), rb=memberRings(lb,null);
  if(!ra||!ra.length||!rb||!rb.length) return null;
  var sa=ringSegs(decimate(ra,260)), sb=ringSegs(decimate(rb,260));
  var best={d:1e12,p:null,q:null};
  for(var a=0;a<sa.length;a++) for(var b=0;b<sb.length;b++){
    var r=segDist(sa[a].a,sa[a].b,sb[b].a,sb[b].b);
    if(r.d<best.d) best={d:r.d,p:r.p,q:r.q};
  }
  if(!best.p) return null;
  var ba=layerBox(la), bb=layerBox(lb);
  // the axis figures are what a layout actually cares about, and they only mean
  // anything when the two boxes share that axis' band
  var hGap=null,vGap=null;
  if(ba&&bb){
    if(ba.y1>bb.y0&&bb.y1>ba.y0) hGap=Math.max(0,Math.max(ba.x0,bb.x0)-Math.min(ba.x1,bb.x1));
    if(ba.x1>bb.x0&&bb.x1>ba.x0) vGap=Math.max(0,Math.max(ba.y0,bb.y0)-Math.min(ba.y1,bb.y1));
  }
  return {kind:'gap',a:{x:best.p.x,y:best.p.y},b:{x:best.q.x,y:best.q.y},
          d:best.d,hGap:hGap,vGap:vGap,of:la.name+' → '+lb.name};
}

/* ---- readouts ---- */

function measSpanText(m){
  var dx=m.b.x-m.a.x, dy=m.b.y-m.a.y;
  return {d:Math.hypot(dx,dy),dx:dx,dy:dy,
          ang:(Math.atan2(-dy,dx)*180/Math.PI+360)%360};
}
function measAngleAt(m){
  var v=m.v||m.a;
  var a1=Math.atan2(m.a.y-v.y,m.a.x-v.x), a2=Math.atan2(m.b.y-v.y,m.b.x-v.x);
  var d=(a2-a1)*180/Math.PI;
  while(d<=-180) d+=360;
  while(d>180) d-=360;
  return {deg:Math.abs(d),signed:d,a1:a1,a2:a2};
}
function mnum(v){ return roundTo(v,S.precision>0?S.precision:1); }
// the canvas pill has to say what it is; the list already has a kind column
function measLabel(m,onSheet){
  if(m.kind==='gap'){
    var g=(onSheet?'gap ':'')+mnum(m.d);
    if(m.hGap!==null&&m.hGap!==undefined) g+='   h '+mnum(m.hGap);
    if(m.vGap!==null&&m.vGap!==undefined) g+='   v '+mnum(m.vGap);
    return g;
  }
  if(m.kind==='angle') return mnum(measAngleAt(m).deg)+'°';
  var s=measSpanText(m);
  return mnum(s.d);
}
function measDetail(m){
  if(m.kind==='gap')
    return 'closest approach '+mnum(m.d)+' px'
      +(m.hGap!==null&&m.hGap!==undefined?',  horizontal '+mnum(m.hGap):'')
      +(m.vGap!==null&&m.vGap!==undefined?',  vertical '+mnum(m.vGap):'');
  if(m.kind==='angle'){
    // two rays enclose two angles; the pill takes the lesser, by convention,
    // but on a wide arc the reflex is just as often the one being asked for
    var ad=measAngleAt(m).deg;
    return mnum(ad)+'° at the vertex   ·   reflex '+mnum(360-ad)+'°';
  }
  var s=measSpanText(m);
  return 'd '+mnum(s.d)+'   dx '+mnum(s.dx)+'   dy '+mnum(s.dy)+'   ∠ '+mnum(s.ang)+'°';
}

/* ---- painting ---- */

var MEASINK='#b02f4c', MEASDARK='#17242b';

function measPill(c,x,y,text,z,accent){
  c.font='500 '+(11/z)+'px "IBM Plex Mono", monospace';
  var w=c.measureText(text).width, padx=6/z, h=17/z;
  var bx=x-w/2-padx, by=y-h/2, bw=w+padx*2, r=3/z;
  c.beginPath();
  c.moveTo(bx+r,by); c.arcTo(bx+bw,by,bx+bw,by+h,r);
  c.arcTo(bx+bw,by+h,bx,by+h,r); c.arcTo(bx,by+h,bx,by,r); c.arcTo(bx,by,bx+bw,by,r);
  c.closePath();
  c.fillStyle=accent||MEASDARK; c.fill();
  c.fillStyle='#eef1ea';
  c.textAlign='center'; c.textBaseline='middle';
  c.fillText(text,x,y);
  c.textAlign='left'; c.textBaseline='alphabetic';
}
function measTick(c,a,b,z){          // the serif that caps a measurement line
  var dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy)||1, t=6/z;
  var nx=-dy/L*t, ny=dx/L*t;
  c.beginPath();
  c.moveTo(a.x-nx,a.y-ny); c.lineTo(a.x+nx,a.y+ny);
  c.moveTo(b.x-nx,b.y-ny); c.lineTo(b.x+nx,b.y+ny);
  c.stroke();
}
function drawSnapMark(c,p,z){
  var r=4.5/z;
  c.save();
  c.strokeStyle=MEASINK; c.lineWidth=1.6/z; c.fillStyle='#fff';
  c.beginPath();
  var k=SNAPGLYPH[p.kind];
  if(k==='square'){ c.rect(p.x-r,p.y-r,r*2,r*2); c.fill(); c.stroke(); }
  else if(k==='circle'){ c.arc(p.x,p.y,r,0,Math.PI*2); c.fill(); c.stroke(); }
  else if(k==='triangle'){
    c.moveTo(p.x,p.y-r); c.lineTo(p.x+r,p.y+r*0.8); c.lineTo(p.x-r,p.y+r*0.8);
    c.closePath(); c.fill(); c.stroke();
  } else if(k==='diamond'){
    c.moveTo(p.x,p.y-r); c.lineTo(p.x+r,p.y); c.lineTo(p.x,p.y+r); c.lineTo(p.x-r,p.y);
    c.closePath(); c.fill(); c.stroke();
  } else if(k==='cross'){
    c.moveTo(p.x-r,p.y-r); c.lineTo(p.x+r,p.y+r);
    c.moveTo(p.x+r,p.y-r); c.lineTo(p.x-r,p.y+r); c.stroke();
  } else {
    c.moveTo(p.x-r,p.y); c.lineTo(p.x+r,p.y);
    c.moveTo(p.x,p.y-r); c.lineTo(p.x,p.y+r); c.stroke();
  }
  if(p.kind){
    var txt=p.kind+(p.of?' · '+p.of:'');
    c.font=(10.5/z)+'px "IBM Plex Mono", monospace';
    var w=c.measureText(txt).width;
    c.fillStyle='rgba(23,36,43,.9)';
    c.fillRect(p.x+8/z,p.y-20/z,w+8/z,15/z);
    c.fillStyle='#eef1ea';
    c.textBaseline='middle';
    c.fillText(txt,p.x+12/z,p.y-12.5/z);
    c.textBaseline='alphabetic';
  }
  c.restore();
}
// a measurement has to stay readable wherever it lands, and it lands on top of
// filled shapes by definition. A pale halo under every stroke buys that without
// tinting the drawing underneath the way a translucent line would
function measStroke(c,z,sel,draw){
  c.save();
  c.strokeStyle='rgba(255,255,255,.75)';
  c.lineWidth=(sel?4.5:3.6)/z;
  c.lineCap='round'; c.lineJoin='round';
  draw();
  c.restore();
  c.strokeStyle=MEASINK;
  c.lineWidth=(sel?2:1.3)/z;
  draw();
}
function drawOneMeasure(c,m,z,live,sel){
  c.save();
  c.strokeStyle=MEASINK;
  c.lineWidth=(sel?2:1.3)/z;
  c.globalAlpha=live?0.85:1;
  if(m.kind==='angle'){
    var v=m.v;
    measStroke(c,z,sel,function(){
      c.beginPath();
      c.moveTo(m.a.x,m.a.y); c.lineTo(v.x,v.y); c.lineTo(m.b.x,m.b.y);
      c.stroke();
    });
    var ang=measAngleAt(m), R=Math.min(30/z,
      Math.hypot(m.a.x-v.x,m.a.y-v.y)*0.7, Math.hypot(m.b.x-v.x,m.b.y-v.y)*0.7);
    if(R>2/z) measStroke(c,z,sel,function(){
      c.beginPath();
      c.arc(v.x,v.y,R,ang.a1,ang.a2,ang.signed<0);
      c.stroke();
    });
    var mid=(ang.a1+ang.a2)/2+(Math.abs(ang.a2-ang.a1)>Math.PI?Math.PI:0);
    measPill(c,v.x+Math.cos(mid)*(R+16/z),v.y+Math.sin(mid)*(R+16/z),measLabel(m,true),z);
  } else {
    measStroke(c,z,sel,function(){
      c.beginPath(); c.moveTo(m.a.x,m.a.y); c.lineTo(m.b.x,m.b.y); c.stroke();
    });
    if(m.kind==='gap'){
      c.save();
      c.setLineDash([5/z,4/z]); c.strokeStyle='#4f7a3a'; c.lineWidth=(sel?2:1.4)/z;
      c.beginPath(); c.moveTo(m.a.x,m.a.y); c.lineTo(m.b.x,m.b.y); c.stroke();
      c.restore();
    }
    measStroke(c,z,sel,function(){ measTick(c,m.a,m.b,z); });
    measPill(c,(m.a.x+m.b.x)/2,(m.a.y+m.b.y)/2-12/z,measLabel(m,true),z,
             m.kind==='gap'?'#4f7a3a':null);
  }
  if(sel){
    var r=4/z;
    c.fillStyle='#fff';
    [m.a,m.b,m.v].forEach(function(p){
      if(!p) return;
      c.beginPath(); c.rect(p.x-r,p.y-r,r*2,r*2); c.fill(); c.stroke();
    });
  }
  c.restore();
}
function drawMeasures(){
  var z=S.view.z;
  var showAll=S.measShow!==false;
  if(showAll) S.measures.forEach(function(m,i){
    drawOneMeasure(ctx,m,z,false,i===S.measSel&&S.tool==='measure');
  });
  if(S.tool!=='measure') return;
  var d=S.measDraft;
  if(d&&d.a&&d.b) drawOneMeasure(ctx,d,z,true,false);
  else if(d&&d.a){
    ctx.save();
    ctx.strokeStyle=MEASINK; ctx.lineWidth=1.3/z; ctx.setLineDash([4/z,3/z]);
    ctx.beginPath(); ctx.moveTo(d.a.x,d.a.y);
    if(S.measHover) ctx.lineTo(S.measHover.x,S.measHover.y);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }
  // the shape the gap is measured from, once it has been picked
  if(S.measMode==='gap'&&S.measGapFrom>=0&&S.layers[S.measGapFrom]){
    var b=layerBox(S.layers[S.measGapFrom]);
    if(b){
      ctx.save();
      ctx.strokeStyle='#4f7a3a'; ctx.lineWidth=1.5/z; ctx.setLineDash([6/z,4/z]);
      ctx.strokeRect(b.x0,b.y0,b.x1-b.x0,b.y1-b.y0);
      ctx.setLineDash([]); ctx.restore();
    }
  }
  if(S.measHover&&S.measHover.kind) drawSnapMark(ctx,S.measHover,z);
}

/* ---- pointer ---- */

function measHitMeasure(sx,sy){
  var r=8/S.view.z;
  for(var i=S.measures.length-1;i>=0;i--){
    var m=S.measures[i], pts=[m.a,m.b,m.v];
    for(var k=0;k<pts.length;k++)
      if(pts[k]&&Math.hypot(pts[k].x-sx,pts[k].y-sy)<=r) return {i:i,grip:k};
    var mid={x:(m.a.x+m.b.x)/2,y:(m.a.y+m.b.y)/2};
    if(Math.hypot(mid.x-sx,mid.y-sy)<=r*1.6) return {i:i,grip:-1};
  }
  return null;
}
function measTopShapeAt(sx,sy){
  for(var i=S.layers.length-1;i>=0;i--){
    var l=S.layers[i];
    if(l&&l.visible&&insideLayer(l,sx,sy)) return i;
  }
  return -1;
}
function measDown(s,e){
  if(S.measMode==='gap'){
    var hit=measTopShapeAt(s.x,s.y);
    if(hit<0){ S.measGapFrom=-1; draw(); return; }
    if(S.measGapFrom<0){ S.measGapFrom=hit; draw(); measStatus(); return; }
    if(hit===S.measGapFrom){ S.measGapFrom=-1; draw(); measStatus(); return; }
    var g=measureGap(S.measGapFrom,hit);
    if(!g){ toast('Those two shapes have no outline to measure between'); return; }
    push();
    S.measures.push(g);
    S.measSel=S.measures.length-1;
    S.measGapFrom=-1;
    syncMeasures(); draw(); scheduleSave();
    return;
  }
  // grab an existing measurement before starting a new one
  var grab=measHitMeasure(s.x,s.y);
  if(grab&&!S.measDraft){
    S.measSel=grab.i;
    if(grab.grip>=0) S.measDrag={i:grab.i,grip:grab.grip};
    syncMeasures(); draw(); return;
  }
  var p=measSnap(s.x,s.y);
  if(!S.measDraft){ S.measDraft={kind:S.measMode,a:p}; draw(); measStatus(); return; }
  if(S.measMode==='angle'){
    if(!S.measDraft.v){ S.measDraft.v=p; draw(); measStatus(); return; }
    S.measDraft.b=p;
    push();
    S.measures.push({kind:'angle',a:S.measDraft.a,v:S.measDraft.v,b:p});
  } else {
    push();
    S.measures.push({kind:'span',a:S.measDraft.a,b:p});
  }
  S.measSel=S.measures.length-1;
  S.measDraft=null;
  syncMeasures(); draw(); scheduleSave();
}
function measMove(s){
  S.measHover=(S.measMode==='gap')?null:measSnap(s.x,s.y);
  if(S.measDrag){
    var m=S.measures[S.measDrag.i];
    if(m){
      var p=measSnap(s.x,s.y);
      var key=['a','b','v'][S.measDrag.grip];
      if(m[key]){ m[key]={x:p.x,y:p.y,kind:p.kind,of:p.of}; }
      if(m.kind==='gap'){ m.d=Math.hypot(m.b.x-m.a.x,m.b.y-m.a.y); m.hGap=null; m.vGap=null; }
      syncMeasures();
    }
  }
  // the draft's second leg follows the pointer, so the number moves with it
  if(S.measDraft&&S.measHover){
    if(S.measMode==='angle'&&S.measDraft.v)
      S.measDraft.b={x:S.measHover.x,y:S.measHover.y};
    else if(S.measMode!=='angle')
      S.measDraft.b={x:S.measHover.x,y:S.measHover.y};
  }
  measStatus();
  draw();
}
function measUp(){
  if(S.measDrag){ S.measDrag=null; scheduleSave(); }
}
function measCancel(){
  if(S.measDraft||S.measGapFrom>=0){
    S.measDraft=null; S.measGapFrom=-1; draw(); measStatus(); return true;
  }
  return false;
}
function measStatus(){
  if(S.tool!=='measure') return;
  var d=S.measDraft;
  if(S.measMode==='gap'){
    setStatus('ruler',S.measGapFrom<0
      ? 'Click the first shape, then the second, for the clearance between their outlines'
      : 'Now click the shape to measure against  ·  Esc to start over',true);
    return;
  }
  if(d&&d.a&&d.b&&(S.measMode!=='angle'||d.v)){
    setStatus('ruler',measDetail(S.measMode==='angle'
      ?{kind:'angle',a:d.a,v:d.v,b:d.b}:{kind:'span',a:d.a,b:d.b}),true);
    return;
  }
  if(d&&S.measMode==='angle'&&!d.v){ setStatus('ruler','Now click the vertex of the angle',true); return; }
  if(d){ setStatus('ruler','Click the far end  ·  Esc to start over',true); return; }
  var sel=S.measures[S.measSel];
  setStatus('ruler',sel?measDetail(sel):(HINTS.measure||''),false);
}

/* ---- panel ---- */

function measKindTag(m){ return m.kind==='gap'?'gap':m.kind==='angle'?'angle':'span'; }
// what the ends landed on. The snap kind is the part worth reading at a glance --
// it is the difference between a measurement you can trust and one you eyeballed
function measWhere(m,full){
  if(m.of) return m.of;
  var ends=[m.a,m.v,m.b].filter(Boolean);
  return ends.map(function(p){
    if(!p.kind) return full?'free':'·';
    return full?(p.kind+(p.of?' of '+p.of:'')):p.kind;
  }).join(' → ');
}
function syncMeasures(){
  var host=document.getElementById('measList');
  if(!host) return;
  if(!S.measures.length){
    host.innerHTML='<div class="empty">No measurements yet. Pick the ruler from the '
      +'rail, then click two points.</div>';
  } else {
    host.innerHTML=S.measures.map(function(m,i){
      return '<div class="measrow'+(i===S.measSel?' on':'')+'" data-i="'+i+'">'
        +'<span class="mkind">'+measKindTag(m)+'</span>'
        +'<span class="mval">'+esc(measLabel(m))+'</span>'
        +'<span class="mof" title="'+esc(measWhere(m,true)).replace(/"/g,'&quot;')+'">'
          +esc(measWhere(m,false))+'</span>'
        +'<button type="button" class="x" data-del="'+i+'" title="Remove">×</button>'
        +'</div>';
    }).join('');
  }
  var det=document.getElementById('measDetail');
  var sel=S.measures[S.measSel];
  if(det) det.textContent=sel?measDetail(sel):'';
  document.querySelectorAll('#measMode button').forEach(function(b){
    b.setAttribute('aria-pressed',b.dataset.mm===S.measMode?'true':'false');
  });
  SNAPKINDS.forEach(function(k){
    var el=document.getElementById('snap_'+k);
    if(el) el.checked=measEnabled(k);
  });
  var sw=document.getElementById('measShow');
  if(sw) sw.checked=S.measShow!==false;
  var mn=document.getElementById('measModeNote');
  if(mn) mn.textContent=MEASNOTE[S.measMode]||'';
}
function measDelete(i){
  if(!S.measures[i]) return;
  push();
  S.measures.splice(i,1);
  if(S.measSel>=S.measures.length) S.measSel=S.measures.length-1;
  syncMeasures(); draw(); scheduleSave();
}
function measSetMode(m){
  S.measMode=m;
  S.measDraft=null; S.measGapFrom=-1;
  syncMeasures(); measStatus(); draw();
}


/* ---- wiring ---- */

var MEASNOTE={
  span:'Click the two points to measure between. The readout carries the distance, '
      +'its x and y components, and the angle from horizontal.',
  angle:'Click the first arm, then the vertex, then the second arm.',
  gap:'Click one shape, then another, for the closest approach between their outlines '
     +'and the clear space on each axis.'
};
document.getElementById('measMode').addEventListener('click',function(e){
  var b=e.target.closest('[data-mm]');
  if(b) measSetMode(b.dataset.mm);
});
document.getElementById('measList').addEventListener('click',function(e){
  var del=e.target.closest('[data-del]');
  if(del){ measDelete(+del.dataset.del); return; }
  var row=e.target.closest('.measrow');
  if(!row) return;
  S.measSel=+row.dataset.i;
  syncMeasures(); measStatus(); draw();
});
document.getElementById('measSnaps').addEventListener('change',function(e){
  var id=e.target.id;
  if(!id||id.indexOf('snap_')!==0) return;
  var k=id.slice(5), at=S.measSnaps.indexOf(k);
  if(e.target.checked){ if(at<0) S.measSnaps.push(k); }
  else if(at>=0) S.measSnaps.splice(at,1);
  S.measHover=null;
  draw(); scheduleSave();
});
document.getElementById('measShow').onchange=function(){
  S.measShow=this.checked; draw(); scheduleSave();
};
document.getElementById('measDel').onclick=function(){
  if(S.measSel<0){ toast('No measurement selected'); return; }
  measDelete(S.measSel);
};
document.getElementById('measClear').onclick=function(){
  if(!S.measures.length){ toast('Nothing to clear'); return; }
  var n=S.measures.length;
  push();
  S.measures=[]; S.measSel=-1; S.measDraft=null; S.measGapFrom=-1;
  syncMeasures(); draw(); scheduleSave();
  toast('Cleared '+n+' measurement'+(n===1?'':'s'));
};

/* ================= set operation lab =================
   Area algebra is easy to get wrong on the sheet: subtract runs strictly left
   to right, and anything nested has to be unrolled into temporaries by hand.
   The lab is a scratch sheet for exactly that -- lay operands down, write the
   expression, watch the outline it really makes, and only then commit it.
   It shares the sheet's coordinate space, so nothing shifts on the way over. */

var LABCH={'∪':'add','+':'add','|':'add',
           '∩':'intersect','&':'intersect','*':'intersect',
           '−':'subtract','-':'subtract','\\':'subtract',
           '⊕':'exclusiveOr','^':'exclusiveOr'};
var LABSIGN={add:'∪',subtract:'−',intersect:'∩',exclusiveOr:'⊕'};

var LAB={on:false,shapes:[],expr:'A − B',sel:-1,drag:null,pos:null,
         scale:1,ast:null,err:'',rings:null,ghost:true,snap:true};
var LABCACHE={k:null,rings:null,err:''};
var LABHIST=[];

function labEl(id){ return document.getElementById(id); }

/* ---- operands ---- */

function labFreeTag(){
  var used={};
  LAB.shapes.forEach(function(s){ used[s.labTag]=1; });
  for(var i=0;i<26;i++){
    var c=String.fromCharCode(65+i);
    if(!used[c]) return c;
  }
  return null;
}
function labTags(){
  var t={};
  LAB.shapes.forEach(function(s,i){ t[s.labTag]=i; });
  return t;
}
function labColor(i){ return PALETTE[i%PALETTE.length]; }

// a regular n-gon, and its star sibling, as plain path points
function labPoly(cx,cy,rx,ry,n,inner){
  var pts=[], count=inner?n*2:n, R=Math.round;
  for(var i=0;i<count;i++){
    var a=-Math.PI/2+i*Math.PI*2/count;
    var f=(inner&&(i%2))?inner:1;
    pts.push({cmd:i?'line':'move',x:R(cx+Math.cos(a)*rx*f),y:R(cy+Math.sin(a)*ry*f)});
  }
  return pts;
}
var LABKINDS={rect:'rect',ellipse:'ellipse',arc:'arc',text:'text',
              triangle:'path',star:'path',hexagon:'path'};

function labAdd(kind){
  var tag=labFreeTag();
  if(!tag){ toast('The lab holds 26 operands at a time'); return; }
  var l=normalize(defaults(kind+' '+tag,LABKINDS[kind]||'rect'));
  var n=LAB.shapes.length, R=Math.round;
  var w=Math.max(40,Math.min(210,R(S.W*0.36)));
  var h=Math.max(40,Math.min(170,R(S.H*0.36)));
  // fan them out, so a fresh operand never lands exactly on the last one
  var cx=S.W/2+((n%3)-1)*w*0.34, cy=S.H/2+((n%2)?1:-1)*h*0.2;
  l.labTag=tag;
  l.fillColor=l.strokeColor=labColor(n);
  l.render='fill';
  l.g.x=R(cx-w/2); l.g.y=R(cy-h/2); l.g.w=w; l.g.h=h;
  if(kind==='arc'){ l.g.start=0; l.g.extent=250; l.g.arcType='PIE'; }
  if(kind==='triangle') l.pts=labPoly(cx,cy,w/2,h/2,3);
  if(kind==='hexagon')  l.pts=labPoly(cx,cy,w/2,h/2,6);
  if(kind==='star')     l.pts=labPoly(cx,cy,w/2,h/2,5,0.42);
  if(kind==='text'){
    l.text.s=tag; l.text.size=Math.max(24,R(h*0.8));
    l.text.x=R(cx-w/3); l.text.y=R(cy+h/4);
  }
  labPush();
  LAB.shapes.push(l);
  LAB.sel=LAB.shapes.length-1;
  if(!String(LAB.expr).trim()) LAB.expr=tag;
  labEl('slExpr').value=LAB.expr;
  labChanged();
}

// the sheet's own selection, copied in so a real shape can be tried against others
function labPull(){
  var src=S.selLayers.map(function(i){ return S.layers[i]; })
    .filter(function(l){ return l&&l.kind!=='image'&&flattenLayer(l); });
  if(!src.length){ toast('Select a shape on the sheet first'); return; }
  if(LAB.shapes.length+src.length>26){ toast('That would push the lab past 26 operands'); return; }
  labPush();
  cloneLayers(src,0).forEach(function(c){
    c.labTag=labFreeTag();
    c.render='fill';
    c.combine='none'; c.isClip=false; c.clipped=false; c.group=null;
    // two operands answering to one name reads as a mistake in the list, even
    // though the generator would quietly suffix the loser
    if(LAB.shapes.some(function(s){ return s.name===c.name; })) c.name+=' '+c.labTag;
    LAB.shapes.push(c);
    LAB.sel=LAB.shapes.length-1;
  });
  labChanged();
  toast(src.length===1?'Copied "'+src[0].name+'" into the lab'
                     :'Copied '+src.length+' shapes into the lab');
}

function labRemove(i){
  if(!LAB.shapes[i]) return;
  labPush();
  LAB.shapes.splice(i,1);
  if(LAB.sel>=LAB.shapes.length) LAB.sel=LAB.shapes.length-1;
  labChanged();
}

/* ---- the expression ----
   Precedence follows set notation rather than Java's method chain: intersection
   binds tightest, then difference, then union and symmetric difference. */

function labParse(src,tags){
  var s=String(src||''), i=0;
  function ws(){ while(i<s.length&&/\s/.test(s.charAt(i))) i++; }
  function peek(){ ws(); return i<s.length?s.charAt(i):''; }
  function expr(){
    var n=term(),c;
    while((c=peek())&&(c==='∪'||c==='+'||c==='|'||c==='⊕'||c==='^')){
      i++; n={op:LABCH[c],l:n,r:term()};
    }
    return n;
  }
  function term(){
    var n=fact(),c;
    while((c=peek())&&(c==='−'||c==='-'||c==='\\')){ i++; n={op:'subtract',l:n,r:fact()}; }
    return n;
  }
  function fact(){
    var n=atom(),c;
    while((c=peek())&&(c==='∩'||c==='&'||c==='*')){ i++; n={op:'intersect',l:n,r:atom()}; }
    return n;
  }
  function atom(){
    var c=peek();
    if(!c) throw new Error('The expression stops early — an operand was expected.');
    if(c==='('){
      i++;
      var n=expr();
      if(peek()!==')') throw new Error('A bracket is never closed.');
      i++; return n;
    }
    if(/[A-Za-z]/.test(c)){
      i++;
      var t=c.toUpperCase();
      if(!(t in tags)) throw new Error('There is no operand '+t+' in the lab.');
      return {ref:tags[t]};
    }
    if(c===')') throw new Error('A bracket is closed without being opened.');
    throw new Error('"'+c+'" is neither an operand nor an operator.');
  }
  var root=expr();
  ws();
  if(i<s.length) throw new Error('"'+s.slice(i)+'" is left over at the end.');
  return root;
}
function labRefs(node,out){
  if(node.ref!==undefined){ if(out.indexOf(node.ref)<0) out.push(node.ref); return out; }
  labRefs(node.l,out); labRefs(node.r,out);
  return out;
}
function labInside(node,members,x,y){
  if(node.ref!==undefined) return pointInMember(members[node.ref],x,y);
  var a=labInside(node.l,members,x,y), b=labInside(node.r,members,x,y);
  if(node.op==='add') return a||b;
  if(node.op==='subtract') return a&&!b;
  if(node.op==='intersect') return a&&b;
  return a!==b;
}
// the expression written back out with the operands' own letters
function labText(node){
  if(!node) return '';
  if(node.ref!==undefined){ var l=LAB.shapes[node.ref]; return l?l.labTag:'?'; }
  var a=labText(node.l), b=labText(node.r);
  if(node.l.op) a='('+a+')';
  if(node.r.op) b='('+b+')';
  return a+' '+LABSIGN[node.op]+' '+b;
}

/* ---- solving ---- */

function labMembers(){
  return LAB.shapes.map(function(l){
    var rings=memberRings(l,null);
    return {rings:rings||[],
      wind:(l.kind==='text'||l.wind==='evenodd')?'evenodd':'nonzero',
      path:ringsToPath(rings||[])};
  });
}
// an operand with nothing to trace behaves as new Area(emptyShape) does in Java,
// so the solve carries on -- but silence about it would just look like a bug
function labEmptyOperands(){
  var out=[];
  LAB.shapes.forEach(function(l){
    var r=memberRings(l,null);
    if(!r||!r.length) out.push(l.labTag);
  });
  return out;
}
// the same edge classification the sheet's Area preview uses, driven by the
// expression tree instead of a straight top-to-bottom chain
function labCompute(members,ast){
  var refs=labRefs(ast,[]),segs=[],i;
  refs.forEach(function(k){
    members[k].rings.forEach(function(r){
      for(var j=0;j<r.length;j++){
        var a=r[j], b=r[(j+1)%r.length];
        if(Math.abs(a.x-b.x)<1e-9&&Math.abs(a.y-b.y)<1e-9) continue;
        segs.push({a:a,b:b});
      }
    });
  });
  if(!segs.length) return [];
  if(segs.length>7000) throw new Error('Too many edges to solve — use simpler operands.');
  var pieces=splitAll(segs);
  if(pieces.length>14000) throw new Error('Too many crossings to solve — use simpler operands.');
  var kept=[];
  for(i=0;i<pieces.length;i++){
    var s=pieces[i];
    var mx=(s.a.x+s.b.x)/2, my=(s.a.y+s.b.y)/2;
    var dx=s.b.x-s.a.x, dy=s.b.y-s.a.y, len=Math.hypot(dx,dy);
    if(len<1e-7) continue;
    var eps=Math.min(0.05,len*0.4);
    var nx=-dy/len*eps, ny=dx/len*eps;
    if(labInside(ast,members,mx+nx,my+ny)!==labInside(ast,members,mx-nx,my-ny))
      kept.push({a:s.a,b:s.b});
  }
  if(!kept.length) return [];
  return chainSegments(kept);
}
function labKey(){
  return String(LAB.expr)+'\u0000'+LAB.shapes.map(function(l){
    return l.labTag+'|'+l.kind+'|'+l.wind+'|'+JSON.stringify(l.tf)+'|'
      +(l.kind==='path'?JSON.stringify(l.pts):JSON.stringify(l.g))
      +(l.kind==='text'?JSON.stringify(l.text):'');
  }).join('');
}
function labSolve(){
  LAB.ast=null; LAB.rings=null; LAB.err='';
  if(!LAB.shapes.length){ LAB.err='Add an operand to get started.'; return; }
  if(!String(LAB.expr).trim()){ LAB.err='Write an expression, for example A − B.'; return; }
  try{ LAB.ast=labParse(LAB.expr,labTags()); }
  catch(e){ LAB.err=e.message; return; }
  var key=labKey();
  if(key===LABCACHE.k){ LAB.rings=LABCACHE.rings; LAB.err=LABCACHE.err; return; }
  try{ LAB.rings=labCompute(labMembers(),LAB.ast); }
  catch(e){ LAB.err=e.message; LAB.rings=null; }
  LABCACHE={k:key,rings:LAB.rings,err:LAB.err};
}

/* ---- Java ----
   A nested expression cannot be one chain of Area calls, so each bracketed part
   gets its own Area and is folded back into its parent as an argument. */

function labTemp(ctx){ ctx.n++; return javaName('area'+(ctx.n>1?ctx.n:''),ctx.used); }
function labEmitVar(node,ctx){
  if(node.ref!==undefined){
    var v=labTemp(ctx);
    ctx.code+='Area '+v+' = new Area('+ctx.names[node.ref]+');\n';
    return v;
  }
  var lv=labEmitVar(node.l,ctx);
  var arg=labEmitArg(node.r,ctx);      // its own code has to land before the call
  ctx.code+=lv+'.'+node.op+'('+arg+');\n';
  return lv;
}
function labEmitArg(node,ctx){
  if(node.ref!==undefined) return 'new Area('+ctx.names[node.ref]+')';
  return labEmitVar(node,ctx);
}
function labJava(){
  if(!LAB.ast) return '';
  var keepFrc=USED_FRC;
  try{
    var used={},names=[],decl='';
    var refs=labRefs(LAB.ast,[]).slice().sort(function(a,b){ return a-b; });
    refs.forEach(function(i){
      var l=LAB.shapes[i];
      var v=javaName(l.name,used);
      var d=declParts(v,l,false,g2n()+'.getFontRenderContext()');
      decl+=d.field+d.build;
      var bake=tfBake(v,l,null);       // the operand's own rotate / scale / shear
      decl+=bake.code;
      names[i]=bake.name;
    });
    var ctx={code:'',names:names,n:0,used:used};
    var root=labEmitVar(LAB.ast,ctx);
    return '// '+labText(LAB.ast)+'\n'+decl+'\n'+ctx.code
      +'\n'+g2n()+'.fill('+root+');\n';
  } finally { USED_FRC=keepFrc; }      // the sheet's own output owns that flag
}

/* ---- handing the result to the sheet ---- */

// ((A op B) op C)... over operands that each appear once is the only shape the
// sheet's layer chain can hold; anything nested has to go over as an outline
function labChain(node){
  var chain=[],seen={};
  function walk(n){
    if(n.ref!==undefined){ chain.unshift({ref:n.ref,op:null}); return true; }
    if(n.r.ref===undefined) return false;
    chain.unshift({ref:n.r.ref,op:n.op});
    return walk(n.l);
  }
  if(!walk(node)) return null;
  for(var i=0;i<chain.length;i++){
    if(seen[chain[i].ref]) return null;
    seen[chain[i].ref]=1;
  }
  return chain;
}
function labResultPts(){
  var pts=[], R=function(v){ return parseFloat(roundTo(v,S.precision)); };
  (LAB.rings||[]).forEach(function(r){
    var ring=simplifyRing(r,0.06);     // the flattener leaves far more points than Java needs
    if(ring.length<3) return;
    ring.forEach(function(p,i){ pts.push({cmd:i?'line':'move',x:R(p.x),y:R(p.y)}); });
  });
  return pts;
}
function labInsertOutline(){
  if(!LAB.ast||!LAB.rings||!LAB.rings.length){ toast('There is no result to insert'); return; }
  var pts=labResultPts();
  if(!pts.length){ toast('The result came out empty'); return; }
  push();
  var l=normalize(defaults(labText(LAB.ast),'path'));
  l.pts=pts;
  l.closed=true;
  l.wind='evenodd';                    // holes, the way the sheet fills an Area
  l.render='fill';
  S.layers.push(l);
  setSel([S.layers.length-1],S.layers.length-1);
  S.sel=null; sync();
  toast('Inserted the outline as "'+l.name+'"');
}
function labInsertOperands(){
  if(!LAB.ast){ toast('Fix the expression first'); return; }
  var chain=labChain(LAB.ast);
  if(!chain){ toast('Only a flat left-to-right expression can go over as shapes'); return; }
  push();
  var added=[];
  chain.forEach(function(step,k){
    var c=normalize(JSON.parse(JSON.stringify(LAB.shapes[step.ref])));
    delete c.labTag;
    c.combine=k?step.op:'none';
    S.layers.push(c);
    added.push(S.layers.length-1);
  });
  setSel(added,added[0]);
  S.sel=null; sync();
  toast('Inserted '+added.length+' shapes, combined on the sheet');
}

/* ---- painting the scratch sheet ---- */

function labFit(){
  var host=labEl('slSheet'), cv=labEl('slCanvas');
  var aw=Math.max(60,host.clientWidth-18), ah=Math.max(60,host.clientHeight-18);
  var sc=Math.min(aw/S.W,ah/S.H);
  if(!isFinite(sc)||sc<=0) sc=1;
  LAB.scale=sc;
  var dpr=window.devicePixelRatio||1;
  var cw=Math.max(1,Math.round(S.W*sc)), ch=Math.max(1,Math.round(S.H*sc));
  cv.style.width=cw+'px'; cv.style.height=ch+'px';
  cv.width=Math.round(cw*dpr); cv.height=Math.round(ch*dpr);
  var c=cv.getContext('2d');
  c.setTransform(dpr*sc,0,0,dpr*sc,0,0);
  return c;
}
function labHandles(i){
  var l=LAB.shapes[i]; if(!l) return [];
  var b=layerBox(l); if(!b) return [];
  return [{k:'nw',x:b.x0,y:b.y0},{k:'ne',x:b.x1,y:b.y0},
          {k:'se',x:b.x1,y:b.y1},{k:'sw',x:b.x0,y:b.y1}];
}
function labPaint(){
  if(!LAB.on) return;
  var c=labFit(), z=LAB.scale, x, y;
  c.clearRect(0,0,S.W,S.H);
  c.fillStyle='#ffffff'; c.fillRect(0,0,S.W,S.H);

  if(S.showGrid&&S.grid>0&&S.grid*z>3){
    c.save();
    c.lineWidth=1/z;
    c.strokeStyle=rgba(S.gridColor,0.55*S.gridOpacity);
    c.beginPath();
    for(x=S.grid;x<S.W;x+=S.grid){ c.moveTo(x,0); c.lineTo(x,S.H); }
    for(y=S.grid;y<S.H;y+=S.grid){ c.moveTo(0,y); c.lineTo(S.W,y); }
    c.stroke();
    c.restore();
  }

  // the operands are drawn from the very rings the solver reads, so what you
  // see outlined is exactly what the expression is working on
  var mem=labMembers();
  if(LAB.ghost){
    c.save();
    c.setLineDash([5/z,4/z]);
    c.lineWidth=1/z;
    LAB.shapes.forEach(function(l,i){
      if(!mem[i]) return;
      c.strokeStyle=rgba(labColor(i),i===LAB.sel?0.95:0.5);
      c.stroke(mem[i].path);
    });
    c.setLineDash([]);
    c.font=(11/z)+'px "IBM Plex Mono", monospace';
    c.textBaseline='alphabetic';
    LAB.shapes.forEach(function(l,i){
      var b=layerBox(l); if(!b) return;
      c.fillStyle=labColor(i);
      c.fillText(l.labTag,b.x0,Math.max(11/z,b.y0-4/z));
    });
    c.restore();
  }

  if(LAB.rings&&LAB.rings.length){
    var p=ringsToPath(LAB.rings);
    c.save();
    c.fillStyle=rgba('#b02f4c',0.22);
    c.fill(p,'evenodd');
    c.strokeStyle='#b02f4c';
    c.lineWidth=1.6/z;
    c.stroke(p);
    c.restore();
  }

  var sb=LAB.shapes[LAB.sel]&&layerBox(LAB.shapes[LAB.sel]);
  if(sb){
    c.save();
    c.strokeStyle=rgba('#17242b',0.35);
    c.lineWidth=1/z;
    c.setLineDash([3/z,3/z]);
    c.strokeRect(sb.x0,sb.y0,sb.x1-sb.x0,sb.y1-sb.y0);
    c.setLineDash([]);
    var r=4.5/z;
    c.lineWidth=1.2/z;
    labHandles(LAB.sel).forEach(function(h){
      c.fillStyle='#ffffff'; c.strokeStyle='#17242b';
      c.beginPath(); c.rect(h.x-r,h.y-r,r*2,r*2); c.fill(); c.stroke();
    });
    c.restore();
  }

  c.save();
  c.strokeStyle=rgba('#17242b',0.5);
  c.lineWidth=1/z;
  c.strokeRect(0.5/z,0.5/z,S.W-1/z,S.H-1/z);
  c.restore();
}

/* ---- the panels around it ---- */

function labKindTag(l){
  if(l.kind!=='path') return l.kind;
  return polygonal(l)?(l.pts.length+'-gon'):'path';
}
function labAttr(s){ return esc(String(s)).replace(/"/g,'&quot;'); }
function labRenderList(){
  var host=labEl('slList');
  if(!LAB.shapes.length){
    host.innerHTML='<div class="empty">Nothing here yet. Add a shape below, '
      +'or copy the sheet’s selection in.</div>';
    return;
  }
  host.innerHTML=LAB.shapes.map(function(l,i){
    return '<div class="slrow'+(i===LAB.sel?' on':'')+'" data-i="'+i+'">'
      +'<span class="sltag" style="background:'+labColor(i)+'">'+esc(l.labTag)+'</span>'
      +'<span class="nm">'+esc(l.name)+'</span>'
      +'<span class="kd">'+esc(labKindTag(l))+'</span>'
      +'<button type="button" class="x" data-del="'+i+'" title="Remove this operand">×</button>'
      +'</div>';
  }).join('');
}
function labNum(k,label,v,step){
  return '<div class="field"><label>'+label+'</label>'
    +'<input type="number" data-k="'+k+'" value="'+v+'" step="'+(step||1)+'"></div>';
}
function labRenderProps(){
  var host=labEl('slProps'), l=LAB.shapes[LAB.sel];
  if(!l){ host.innerHTML=''; return; }
  var g=l.g, h='';
  h+='<div class="row"><div class="field"><label>Name (Java variable)</label>'
    +'<input type="text" data-k="name" value="'+labAttr(l.name)+'"></div></div>';
  if(l.kind==='text'){
    h+='<div class="row"><div class="field"><label>Text</label>'
      +'<input type="text" data-k="text.s" value="'+labAttr(l.text.s)+'"></div></div>';
    h+='<div class="row">'+labNum('text.x','x',l.text.x)+labNum('text.y','baseline y',l.text.y)
      +labNum('text.size','size',l.text.size)+'</div>';
  } else if(l.kind==='path'){
    var b=layerBounds(l);
    h+='<p class="note">'+l.pts.length+' points, '
      +(b?Math.round(b.x1-b.x0)+' × '+Math.round(b.y1-b.y0):'empty')
      +'. Drag it on the sheet, or pull a corner to resize.</p>';
  } else {
    h+='<div class="row">'+labNum('g.x','x',g.x)+labNum('g.y','y',g.y)+'</div>';
    h+='<div class="row">'+labNum('g.w','w',g.w)+labNum('g.h','h',g.h)+'</div>';
    if(l.kind==='rect')
      h+='<div class="row">'+labNum('g.rx','arc w',g.rx)+labNum('g.ry','arc h',g.ry)+'</div>';
    if(l.kind==='arc'){
      h+='<div class="row">'+labNum('g.start','start°',g.start,5)
        +labNum('g.extent','extent°',g.extent,5)+'</div>';
      h+='<div class="row"><div class="field"><label>Arc type</label><select data-k="g.arcType">'
        +['PIE','CHORD','OPEN'].map(function(t){
            return '<option value="'+t+'"'+(g.arcType===t?' selected':'')+'>'+t+'</option>';
          }).join('')
        +'</select></div></div>';
    }
  }
  h+='<div class="row">'+labNum('tf.rot','rotate°',l.tf.rot,5)
    +'<div class="field"><label>Winding</label><select data-k="wind">'
    +'<option value="nonzero"'+(l.wind==='nonzero'?' selected':'')+'>nonzero</option>'
    +'<option value="evenodd"'+(l.wind==='evenodd'?' selected':'')+'>evenodd</option>'
    +'</select></div></div>';
  host.innerHTML=h;
}
function labRenderOut(){
  var stat=labEl('slStat'), note=labEl('slInsNote');
  labEl('slErr').textContent=LAB.err;
  stat.classList.toggle('bad',!!LAB.err);
  if(LAB.err) stat.textContent='no result';
  else if(!LAB.rings) stat.textContent='—';
  else if(!LAB.rings.length) stat.textContent=labText(LAB.ast)+'  →  empty';
  else {
    var n=LAB.rings.reduce(function(a,r){ return a+r.length; },0);
    stat.textContent=labText(LAB.ast)+'  →  '+LAB.rings.length
      +(LAB.rings.length===1?' ring, ':' rings, ')+n+' points';
  }
  var blank=labEmptyOperands();
  if(blank.length&&!LAB.err)
    stat.textContent+='   ·  '+blank.join(', ')+(blank.length===1?' is empty':' are empty');

  var java='';
  try{ java=labJava(); }catch(e){ java=''; }
  labEl('slCode').innerHTML=java?highlight(java):'';

  var chain=LAB.ast?labChain(LAB.ast):null;
  labEl('slInsertOps').disabled=!chain;
  labEl('slInsert').disabled=!(LAB.rings&&LAB.rings.length);
  note.textContent = !LAB.ast ? ''
    : chain ? 'Either button works here: the outline lands as one path, the operands land as '
        +chain.length+' shapes the sheet combines for you.'
    : 'This expression is nested, so the sheet’s top-to-bottom chain cannot hold it. '
        +'Insert the result outline instead.';
}
function labChanged(){
  labSolve();
  labRenderList();
  labRenderProps();
  labRenderOut();
  labPaint();
  scheduleSave();
}
// a live drag only needs the parts that move
function labTouched(){
  labSolve(); labRenderOut(); labPaint();
}

/* ---- lab-local undo: sheet history has no business holding scratch work ---- */

function labSnapshot(){
  return JSON.stringify({shapes:LAB.shapes,expr:LAB.expr,sel:LAB.sel});
}
function labPush(){
  LABHIST.push(labSnapshot());
  if(LABHIST.length>40) LABHIST.shift();
}
function labUndo(){
  if(!LABHIST.length){ toast('Nothing to undo in the lab'); return; }
  try{
    var d=JSON.parse(LABHIST.pop());
    LAB.shapes=(d.shapes||[]).map(normalize);
    LAB.expr=d.expr||'';
    LAB.sel=(d.sel===undefined)?-1:d.sel;
    labEl('slExpr').value=LAB.expr;
    labChanged();
  }catch(e){}
}

/* ---- pointer work on the scratch sheet ---- */

function labPoint(ev){
  var r=labEl('slCanvas').getBoundingClientRect();
  return {x:(ev.clientX-r.left)/LAB.scale, y:(ev.clientY-r.top)/LAB.scale};
}
function labSnapV(v){ return (LAB.snap&&S.grid>0)?Math.round(v/S.grid)*S.grid:Math.round(v); }
function labHitHandle(p){
  if(LAB.sel<0) return null;
  var tol=7/LAB.scale, hs=labHandles(LAB.sel);
  for(var i=0;i<hs.length;i++)
    if(Math.abs(p.x-hs[i].x)<=tol&&Math.abs(p.y-hs[i].y)<=tol) return hs[i];
  return null;
}
function labHitShape(p){
  var mem=labMembers();
  for(var i=LAB.shapes.length-1;i>=0;i--)
    if(mem[i]&&pointInMember(mem[i],p.x,p.y)) return i;
  return -1;
}
labEl('slCanvas').addEventListener('pointerdown',function(e){
  if(e.button!==0) return;
  var p=labPoint(e), h=labHitHandle(p);
  if(h){
    var l=LAB.shapes[LAB.sel], b=layerBox(l);
    // the corner opposite the grip stays put, as it does on the sheet
    var pv={x:(h.k==='nw'||h.k==='sw')?b.x1:b.x0,
            y:(h.k==='nw'||h.k==='ne')?b.y1:b.y0};
    labPush();
    LAB.drag={mode:'scale',i:LAB.sel,pivot:pv,start:p,base:scaleBase(l)};
    try{ this.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
    return;
  }
  var hit=labHitShape(p);
  if(hit<0){ LAB.sel=-1; labRenderList(); labRenderProps(); labPaint(); return; }
  LAB.sel=hit;
  labPush();
  LAB.drag={mode:'move',i:hit,origin:p,last:{x:0,y:0}};
  try{ this.setPointerCapture(e.pointerId); }catch(err){}
  labRenderList(); labRenderProps(); labPaint();
  e.preventDefault();
});
labEl('slCanvas').addEventListener('pointermove',function(e){
  var d=LAB.drag; if(!d) return;
  var p=labPoint(e), l=LAB.shapes[d.i];
  if(!l) return;
  if(d.mode==='move'){
    var dx=labSnapV(p.x-d.origin.x), dy=labSnapV(p.y-d.origin.y);
    if(dx===d.last.x&&dy===d.last.y) return;
    shiftLayer(l,dx-d.last.x,dy-d.last.y);
    d.last={x:dx,y:dy};
  } else {
    // rewind to the numbers the drag started from, so nothing compounds
    var sx=d.start.x-d.pivot.x, sy=d.start.y-d.pivot.y;
    var fx=Math.abs(sx)<1e-6?1:(labSnapV(p.x)-d.pivot.x)/sx;
    var fy=Math.abs(sy)<1e-6?1:(labSnapV(p.y)-d.pivot.y)/sy;
    if(e.shiftKey){
      var u=Math.max(Math.abs(fx),Math.abs(fy));
      fx=u; fy=u;
    }
    scaleRestore(l,d.base);
    scaleLayer(l,scaleFactor(Math.abs(fx)),scaleFactor(Math.abs(fy)),d.pivot,'geom');
  }
  labTouched();
});
function labEndDrag(){
  if(!LAB.drag) return;
  LAB.drag=null;
  labRenderProps();
  labChanged();
}
labEl('slCanvas').addEventListener('pointerup',labEndDrag);
labEl('slCanvas').addEventListener('pointercancel',labEndDrag);

/* ---- wiring ---- */

labEl('slLeft').addEventListener('click',function(e){
  var b=e.target.closest('[data-add]');
  if(b){ labAdd(b.dataset.add); return; }
  var del=e.target.closest('[data-del]');
  if(del){ labRemove(+del.dataset.del); return; }
  var row=e.target.closest('.slrow');
  if(!row) return;
  LAB.sel=+row.dataset.i;
  labRenderList(); labRenderProps(); labPaint();
});
labEl('slPull').onclick=labPull;

labEl('slProps').addEventListener('input',function(e){
  var t=e.target, k=t.dataset.k, l=LAB.shapes[LAB.sel];
  if(!k||!l||t.tagName==='SELECT') return;
  var v=(t.type==='number')?parseFloat(t.value):t.value;
  if(t.type==='number'&&!isFinite(v)) return;
  if(k==='name'){ l.name=t.value; labRenderList(); }
  else {
    var part=k.split('.');
    if(part[0]==='g') l.g[part[1]]=(part[1]==='w'||part[1]==='h')?Math.max(1,v):v;
    else if(part[0]==='text') l.text[part[1]]=(part[1]==='s')?t.value:v;
    else if(part[0]==='tf') l.tf[part[1]]=v;
  }
  labTouched();
  scheduleSave();
});
labEl('slProps').addEventListener('change',function(e){
  var t=e.target, k=t.dataset.k, l=LAB.shapes[LAB.sel];
  if(t.tagName!=='SELECT'||!k||!l) return;
  if(k==='wind') l.wind=t.value;
  else if(k==='g.arcType') l.g.arcType=t.value;
  labChanged();
});

labEl('slExpr').addEventListener('input',function(){
  LAB.expr=this.value;
  labTouched();
  scheduleSave();
});
labEl('slOps').addEventListener('click',function(e){
  var b=e.target.closest('[data-ins]'); if(!b) return;
  var ta=labEl('slExpr'), s=ta.selectionStart, t=ta.selectionEnd;
  var ins=b.dataset.ins, pad=(ins==='('||ins===')')?ins:' '+ins+' ';
  ta.value=ta.value.slice(0,s)+pad+ta.value.slice(t);
  ta.selectionStart=ta.selectionEnd=s+pad.length;
  ta.focus();
  LAB.expr=ta.value;
  labTouched();
  scheduleSave();
});
labEl('slGhost').onchange=function(){ LAB.ghost=this.checked; labPaint(); };
labEl('slSnap').onchange=function(){ LAB.snap=this.checked; };
labEl('slInsert').onclick=labInsertOutline;
labEl('slInsertOps').onclick=labInsertOperands;
labEl('slCopy').onclick=function(){
  var txt='';
  try{ txt=labJava(); }catch(e){}
  if(!txt.trim()){ toast('Nothing to copy yet'); return; }
  if(navigator.clipboard&&navigator.clipboard.writeText)
    navigator.clipboard.writeText(txt).then(function(){ toast('Java copied'); },
      function(){ toast('Select the code and copy manually'); });
  else toast('Select the code and copy manually');
};

function labPlace(){
  var el=labEl('setlab'), r=el.getBoundingClientRect();
  if(!LAB.pos) LAB.pos={x:Math.max(8,(window.innerWidth-r.width)/2),
                        y:Math.max(8,(window.innerHeight-r.height)/2)};
  LAB.pos.x=Math.min(LAB.pos.x,Math.max(8,window.innerWidth-r.width-8));
  LAB.pos.y=Math.min(LAB.pos.y,Math.max(8,window.innerHeight-r.height-8));
  el.style.left=Math.max(8,LAB.pos.x)+'px';
  el.style.top=Math.max(8,LAB.pos.y)+'px';
}
function showSetLab(on){
  LAB.on=(on===undefined)?!LAB.on:!!on;
  labEl('setlab').classList.toggle('on',LAB.on);
  if(!LAB.on) return;
  labEl('slGhost').checked=LAB.ghost;
  labEl('slSnap').checked=LAB.snap;
  // an empty lab demonstrates nothing, so seed it with something to try
  if(!LAB.shapes.length){
    LAB.expr='A − B';
    labAdd('rect'); labAdd('ellipse');
  }
  labEl('slExpr').value=LAB.expr;
  labChanged();
  labPlace();
  requestAnimationFrame(function(){ labPaint(); labPlace(); });
}
labEl('slClose').onclick=function(){ showSetLab(false); };
labEl('openSetLab').onclick=function(){ MENUCLOSE(); showSetLab(true); };
window.addEventListener('resize',function(){ if(LAB.on){ labPaint(); labPlace(); } });

labEl('slHead').addEventListener('pointerdown',function(e){
  if(e.button!==0||e.target.closest('button,label,input')) return;
  var head=this, el=labEl('setlab'), r=el.getBoundingClientRect();
  var off={x:e.clientX-r.left,y:e.clientY-r.top};
  head.classList.add('drag');
  try{ head.setPointerCapture(e.pointerId); }catch(err){}
  function move(ev){ LAB.pos={x:ev.clientX-off.x,y:ev.clientY-off.y}; labPlace(); }
  function up(){
    head.classList.remove('drag');
    head.removeEventListener('pointermove',move);
    head.removeEventListener('pointerup',up);
    head.removeEventListener('pointercancel',up);
  }
  head.addEventListener('pointermove',move);
  head.addEventListener('pointerup',up);
  head.addEventListener('pointercancel',up);
});

// the lab holds the keyboard while the pointer is in it, or Delete hits the sheet
document.addEventListener('keydown',function(e){
  if(!LAB.on) return;
  if(e.key==='Escape'){ showSetLab(false); return; }
  if(!(e.target&&e.target.closest&&e.target.closest('#setlab'))) return;
  var k=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&k==='z'){ e.preventDefault(); e.stopPropagation(); labUndo(); return; }
  if(/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  if((k==='delete'||k==='backspace')&&LAB.sel>=0){
    e.preventDefault(); e.stopPropagation(); labRemove(LAB.sel);
  }
},true);

/* ================= boot ================= */

if(window.ResizeObserver) new ResizeObserver(function(){ resize(); }).observe(stage);
else window.addEventListener('resize',resize);

hitCtx.setTransform(1,0,0,1,0,0);
buildRail();
initResizers();
initMenus();
S.remember=(lsGet(RKEY)!=='0');
document.getElementById('remember').checked=S.remember;

S.layers.push(normalize(defaults('path 1','path')));
S.active=0; S.selLayers=[0];
setTool('line');
showTab('shape');
syncSheetUI();
syncPrecisionUI();
syncMeasures();
sync();

if(S.remember) restoreSession();
requestAnimationFrame(function(){ resize(); fitView(); });

})();
