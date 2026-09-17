(function(root){
"use strict";

root.createModel = function(PALETTE){
var S={
  W:600,H:450,grid:25,snap:true,objectSnap:true,showGrid:true,labels:true,aa:true,
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
  var o=Object.assign({},d,l);
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


function nextGroupId(){ return 'g'+(++GID); }

return {
  state:S,
  L:L,
  defaults:defaults,
  polygonal:polygonal,
  normalize:normalize,
  nextGroupId:nextGroupId
};
};

})(window.PathPlotter = window.PathPlotter || {});
