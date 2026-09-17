(function(root){
"use strict";

root.createScene = function(S){

function clipScopes(){
  var out=new Array(S.layers.length), stack=[];
  S.layers.forEach(function(l,i){
    if(!l.clipped) stack=[];          // an unclipped layer ends every open scope
    out[i]=stack.slice();             // the scopes this layer is painted inside
    if(l.isClip) stack=stack.concat([i]);
  });
  return out;
}

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

return {
  clipScopes:clipScopes,
  clipOwns:clipOwns,
  groups:groups
};
};

})(window.PathPlotter = window.PathPlotter || {});
