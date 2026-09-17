(function(root){
"use strict";
root.createSelection=function(S){
  function normalize(){
    S.selLayers=(S.selLayers||[]).filter(function(i,pos,all){
      return Number.isInteger(i)&&i>=0&&i<S.layers.length&&all.indexOf(i)===pos;
    });
    if(S.selLayers.indexOf(S.active)<0) S.active=S.selLayers.length?S.selLayers[0]:-1;
    if(S.active<0) S.sel=null;
  }
  function group(gid){
    var out=[];
    if(gid) S.layers.forEach(function(l,i){ if(l.group===gid) out.push(i); });
    return out;
  }
  function expand(idxs){
    var out=[];
    idxs.forEach(function(i){
      var l=S.layers[i]; if(!l) return;
      (l.group?group(l.group):[i]).forEach(function(j){ if(out.indexOf(j)<0) out.push(j); });
    });
    return out.sort(function(a,b){return a-b;});
  }
  function set(idxs,active){
    S.selLayers=expand(idxs);
    S.active=active===undefined?idxs[idxs.length-1]:active;
    S.sel=null;
    normalize();
  }
  function toggle(i){
    var members=expand([i]), removing=S.selLayers.indexOf(i)>=0;
    set(removing?S.selLayers.filter(function(j){return members.indexOf(j)<0;}):
      S.selLayers.concat(members),removing?S.active:i);
  }
  return {normalize:normalize,group:group,expand:expand,set:set,toggle:toggle};
};
})(window.PathPlotter = window.PathPlotter || {});
