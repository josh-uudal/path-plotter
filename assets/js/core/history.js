(function(root){
"use strict";

root.createHistory = function(deps){
var S=deps.state, normalize=deps.normalize, toast=deps.toast;
var HIST=[],FUT=[];

function snapshot(){
  var project=deps.getProject?deps.getProject():undefined;
  return JSON.stringify({layers:project&&project.layers?undefined:S.layers,active:S.active,sel:S.selLayers,W:S.W,H:S.H,
    measures:S.measures,measSel:S.measSel,point:S.sel,
    project:project});
}
function push(){ HIST.push(snapshot()); if(HIST.length>80) HIST.shift(); FUT.length=0; }
function restore(str){
  var st=JSON.parse(str);
  if(st.project&&deps.restoreProject){deps.restoreProject(st.project);st.layers=st.project.layers||st.layers;}
  var folds=S.layers.map(function(l){ return !!l.collapsed; });
  S.layers=st.layers.map(normalize);
  // fold is how the list is being read, not part of the drawing; a stale flag on
  // a row that is no longer a base is inert, so index carry-over is enough
  S.layers.forEach(function(l,i){ if(folds[i]!==undefined) l.collapsed=folds[i]; });
  S.active=Math.min(st.active,st.layers.length-1);
  S.selLayers=st.sel||[S.active];
  S.W=st.W; S.H=st.H; S.sel=st.point||null;
  S.measures=st.measures||[];
  S.measSel=Math.min(st.measSel===undefined?-1:st.measSel,S.measures.length-1);
  S.measDraft=null; S.measGapFrom=-1;
  deps.onRestore();
}
function undo(){ if(!HIST.length){ toast('Nothing to undo'); return; } FUT.push(snapshot()); restore(HIST.pop()); }
function redo(){ if(!FUT.length){ toast('Nothing to redo'); return; } HIST.push(snapshot()); restore(FUT.pop()); }


return {
  past:HIST, future:FUT,
  snapshot:snapshot,
  push:push,
  restore:restore,
  undo:undo,
  redo:redo
};
};

})(window.PathPlotter = window.PathPlotter || {});
