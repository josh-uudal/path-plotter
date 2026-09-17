(function(root){
"use strict";
root.createEditActions=function(deps){
  var S=deps.state, held=null;
  return {
    endNudge:function(){ held=null; },
    nudge:function(key,step,repeat){
      var dx=key==='arrowleft'?-step:key==='arrowright'?step:0;
      var dy=key==='arrowup'?-step:key==='arrowdown'?step:0;
      var l=S.layers[S.active]; if(!l||(!dx&&!dy)) return false;
      var point=l.kind==='path'&&S.sel?deps.pathEditing.position(l,S.sel):null;
      if(l.kind==='path'&&S.sel&&!point) return false;
      if(!repeat||held!==key) deps.push();
      held=key;
      if(point) deps.pathEditing.setPoint(l,S.sel,point.x+dx,point.y+dy);
      else deps.shiftSelection(dx,dy);
      deps.changed(); return true;
    }
  };
};
})(window.PathPlotter = window.PathPlotter || {});
