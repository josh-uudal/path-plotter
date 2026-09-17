(function(root){
"use strict";
root.createDrawingSnap=function(deps){
  var S=deps.state;
  function candidates(x,y,excluded){
    var out=[];
    S.layers.forEach(function(l,i){
      if(l.visible&&excluded.indexOf(i)<0) out=out.concat(deps.points(l));
    });
    if(deps.crossings) out=out.concat(deps.crossings(x,y,10/S.view.z,excluded));
    return out;
  }
  function resolve(x,y,excluded,align,cached){
    var fallback={x:deps.grid(x),y:deps.grid(y),target:null};
    if(!S.snap||!S.objectSnap||S.fine) return fallback;
    var r=10/S.view.z,points=cached||candidates(x,y,excluded||[]),best=null,score=r;
    points.forEach(function(p){
      var d=Math.hypot(x-p.x,y-p.y);
      if(d<score){ score=d; best=p; }
    });
    if(best) return {x:best.x,y:best.y,target:best};
    if(align){
      var ax=null,ay=null,rx=r*.6,ry=r*.6;
      points.forEach(function(p){
        if(Math.abs(x-p.x)<rx){ rx=Math.abs(x-p.x); ax=p; }
        if(Math.abs(y-p.y)<ry){ ry=Math.abs(y-p.y); ay=p; }
      });
      if(ax||ay) return {x:ax?ax.x:fallback.x,y:ay?ay.y:fallback.y,
        target:{kind:'alignment',of:(ax||ay).of},vertical:ax&&ax.x,horizontal:ay&&ay.y};
    }
    return fallback;
  }
  function move(dx,dy,sources,excluded,axis){
    var best=null,dist=Infinity;
    if(!S.snap||!S.objectSnap||S.fine||!sources.length) return {dx:dx,dy:dy,target:null};
    // Enumerate target geometry once per pointer event, not once per source node.
    var points=candidates(sources[0].x+dx,sources[0].y+dy,excluded);
    sources.forEach(function(p){
      var q=resolve(p.x+dx,p.y+dy,excluded,true,points);
      if(!q.target) return;
      if(axis==='x'&&Math.abs(q.y-p.y)>1e-6) return;
      if(axis==='y'&&Math.abs(q.x-p.x)>1e-6) return;
      var d=Math.hypot(q.x-p.x-dx,q.y-p.y-dy);
      if(d<dist){ dist=d; best=q; best.dx=q.x-p.x; best.dy=q.y-p.y; }
    });
    return best||{dx:dx,dy:dy,target:null};
  }
  return {resolve:resolve,move:move};
};
})(window.PathPlotter = window.PathPlotter || {});
