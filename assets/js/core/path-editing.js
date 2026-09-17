(function(root){
"use strict";

// Segment controls belong to the endpoint they lead into. Node metadata belongs
// to the anchor; the last anchor's outgoing handle is kept for Continue path.
function curve(l,i){
  var p=l.pts[i], a=l.pts[i-1];
  if(!a||!p||p.cmd==='move'||p.cmd==='cubic') return;
  if(p.cmd==='quad'){
    p.c1x=a.x+(p.cx-a.x)*2/3; p.c1y=a.y+(p.cy-a.y)*2/3;
    p.c2x=p.x+(p.cx-p.x)*2/3; p.c2y=p.y+(p.cy-p.y)*2/3;
  } else {
    p.c1x=a.x+(p.x-a.x)/3; p.c1y=a.y+(p.y-a.y)/3;
    p.c2x=a.x+(p.x-a.x)*2/3; p.c2y=a.y+(p.y-a.y)*2/3;
  }
  p.cmd='cubic'; delete p.cx; delete p.cy;
  if(l.shapeClass==='Polygon') l.shapeClass='GeneralPath';
}
function next(l,i){ var p=l.pts[i+1]; return p&&p.cmd!=='move'?p:null; }
function position(l,s){
  var p=l.pts[s.i]; if(!p) return null;
  var k=s.key==='a'?'':s.key==='c'?'c':s.key;
  return {x:p[k+'x'],y:p[k+'y']};
}
function mirror(a,x,y,oldX,oldY){
  var dx=x-a.x,dy=y-a.y,n=Math.hypot(dx,dy);
  var len=Math.hypot(oldX-a.x,oldY-a.y);
  return n?{x:a.x-dx*len/n,y:a.y-dy*len/n}:{x:a.x,y:a.y};
}
function setPoint(l,s,x,y){
  var p=l.pts[s.i], n=next(l,s.i); if(!p) return;
  if(s.key==='a'){
    var dx=x-p.x,dy=y-p.y;
    if(p.cmd==='cubic'){ p.c2x+=dx; p.c2y+=dy; }
    if(p.cmd==='quad'){ p.cx+=dx; p.cy+=dy; }
    if(n&&n.cmd==='cubic'){ n.c1x+=dx; n.c1y+=dy; }
    if(p.outX!==undefined){ p.outX+=dx; p.outY+=dy; }
    p.x=x; p.y=y; return;
  }
  p[s.key+'x']=x; p[s.key+'y']=y;
  var a,q;
  if(s.key==='c2'&&p.smooth){
    if(n&&n.cmd==='cubic'){
      q=mirror(p,x,y,n.c1x,n.c1y); n.c1x=q.x; n.c1y=q.y;
    }
    p.outX=2*p.x-x; p.outY=2*p.y-y;
  } else if(s.key==='c1'&&(a=l.pts[s.i-1])&&a.smooth){
    if(a.cmd==='cubic'){
      q=mirror(a,x,y,a.c2x,a.c2y); a.c2x=q.x; a.c2y=q.y;
    }
    a.outX=x; a.outY=y;
  }
}
function nodeMode(l,i,smooth){
  var p=l.pts[i]; if(!p) return;
  p.smooth=smooth;
  if(!smooth) return;
  curve(l,i); if(next(l,i)) curve(l,i+1);
  var a=p.cmd==='move'?null:l.pts[i-1], n=next(l,i);
  var dx=(n?n.x:p.x)-(a?a.x:p.x),dy=(n?n.y:p.y)-(a?a.y:p.y);
  var len=Math.hypot(dx,dy); if(!len) return;
  dx/=len; dy/=len;
  if(p.cmd==='cubic'){
    var il=Math.hypot(p.c2x-p.x,p.c2y-p.y);
    p.c2x=p.x-dx*il; p.c2y=p.y-dy*il;
  }
  var ol=n?Math.hypot(n.x-p.x,n.y-p.y)/3:40;
  p.outX=p.x+dx*ol; p.outY=p.y+dy*ol;
  if(n){ n.c1x=p.outX; n.c1y=p.outY; }
}
function segment(l,i,kind){
  var p=l.pts[i]; if(!p||p.cmd==='move') return;
  if(kind==='cubic'){ curve(l,i); return; }
  p.cmd='line'; p.smooth=false;
  delete p.cx; delete p.cy; delete p.c1x; delete p.c1y; delete p.c2x; delete p.c2y;
  var a=l.pts[i-1]; if(a){ a.smooth=false; delete a.outX; delete a.outY; }
}
function append(l,x,y,newRun){
  var a=l.pts[l.pts.length-1],p={cmd:!a||newRun?'move':'line',x:x,y:y};
  if(p.cmd==='line'&&a.outX!==undefined){
    p.cmd='cubic'; p.c1x=a.outX; p.c1y=a.outY;
    p.c2x=x; p.c2y=y;
  }
  l.pts.push(p); l.closed=false;
  if(l.shapeClass==='Polygon') l.shapeClass='GeneralPath';
  return l.pts.length-1;
}
function pull(l,i,x,y){
  var p=l.pts[i]; if(!p) return;
  curve(l,i);
  p.smooth=true; p.outX=x; p.outY=y;
  if(p.cmd==='cubic'){ p.c2x=2*p.x-x; p.c2y=2*p.y-y; }
}
root.pathEditing={curve:curve,position:position,setPoint:setPoint,nodeMode:nodeMode,
  segment:segment,append:append,pull:pull};
})(window.PathPlotter = window.PathPlotter || {});
