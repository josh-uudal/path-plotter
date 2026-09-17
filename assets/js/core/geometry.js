(function(root){
"use strict";

root.createGeometry = function(deps){
var S=deps.state, textMetrics=deps.textMetrics;
var K=0.5522847498307936, BSTEP=16;

function isCircularArc(l){
  if(!l||l.kind!=='arc') return false;
  var g=norm(l.g);
  return Math.abs(g.w-g.h)<0.5;
}

function arcAngleAt(l,x,y){
  var g=norm(l.g), cx=g.x+g.w/2, cy=g.y+g.h/2;
  var dx=(x-cx)/((g.w/2)||1), dy=(y-cy)/((g.h/2)||1);
  return Math.atan2(-dy,dx)*180/Math.PI;
}

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

function arcPoint(cx,cy,rx,ry,deg){
  var t=deg*Math.PI/180;
  return {x:cx+rx*Math.cos(t), y:cy-ry*Math.sin(t)};
}

function arcDeriv(rx,ry,deg){
  var t=deg*Math.PI/180;
  return {x:-rx*Math.sin(t), y:-ry*Math.cos(t)};
}

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

function hasTf(l){
  var t=l.tf; return t.rot!==0||t.sx!==1||t.sy!==1||t.shx!==0||t.shy!==0;
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

function isStrokeDefault(l){
  return l.cap==='square'&&l.join==='miter'&&Math.abs((l.miter||10)-10)<1e-9&&!dashArray(l);
}

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

return {
  isCircularArc:isCircularArc,
  arcAngleAt:arcAngleAt,
  nearest:nearest,
  hex2rgb:hex2rgb,
  rgba:rgba,
  norm:norm,
  arcPoint:arcPoint,
  arcDeriv:arcDeriv,
  arcToCubics:arcToCubics,
  layerBounds:layerBounds,
  centreOf:centreOf,
  hasTf:hasTf,
  tfMatrix:tfMatrix,
  relMatrix:relMatrix,
  isIdentity:isIdentity,
  gradEnds:gradEnds,
  dashArray:dashArray,
  isStrokeDefault:isStrokeDefault,
  toPathPoints:toPathPoints,
  ringsFromPts:ringsFromPts,
  lerp:lerp,
  segPoint:segPoint,
  splitSeg:splitSeg
};
};

})(window.PathPlotter = window.PathPlotter || {});
