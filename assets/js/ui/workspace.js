(function(root){
"use strict";
root.createWorkspace=function(deps){
  var S=deps.state, doc=document;
  root.createTooltips();
  function el(id){ return doc.getElementById(id); }
  function on(id,fn){ el(id).addEventListener('click',fn); }
  function action(fn){ deps.push(); fn(); deps.sync(); }
  on('quickPreview',function(){ deps.preview(); });
  on('saveStatus',function(){ el('saveProj').click(); });
  on('newPath',deps.newPath);
  on('finishPath',function(){ deps.finish(false); });
  on('closePath',function(){ deps.finish(true); });
  on('continuePath',deps.continuePath);
  ['smoothNode','cornerNode','curveSegment','lineSegment'].forEach(function(id){
    on(id,function(){
      if(!S.sel) return;
      var l=S.layers[S.active];
      // handles change with the node type, so a transformed path is pinned too
      action(function(){ deps.pinned(l,function(){
        if(id==='smoothNode'||id==='cornerNode') root.pathEditing.nodeMode(l,S.sel.i,id==='smoothNode');
        else root.pathEditing.segment(l,S.sel.i,id==='curveSegment'?'cubic':'line');
      }); });
    });
  });
  el('quickSnap').onchange=function(){ S.snap=this.checked; el('snapChk').checked=S.snap; deps.sync(); };
  el('objectSnap').onchange=function(){ S.objectSnap=this.checked; deps.sync(); };
  on('viewMode',function(){ S.solidView=!S.solidView; el('solidChk').checked=S.solidView; deps.sync(); });
  on('toggleInspector',function(){
    var hidden=doc.body.classList.toggle('inspector-hidden');
    el('toggleInspector').setAttribute('aria-expanded',String(!hidden));
    el('side').inert=hidden;
  });
  if(window.matchMedia('(max-width: 760px)').matches){
    doc.body.classList.add('inspector-hidden'); el('side').inert=true;
    el('toggleInspector').setAttribute('aria-expanded','false');
  }
  on('drawerToggle',function(){
    var shut=el('drawer').classList.toggle('shut');
    el('drawerToggle').setAttribute('aria-expanded',String(!shut));
  });
  // Tabs expose a single keyboard stop and follow the usual arrow-key pattern.
  var tabs=Array.from(doc.querySelectorAll('#tabs button'));
  tabs.forEach(function(tab){
    tab.id='tab-'+tab.dataset.p; tab.setAttribute('aria-controls','pane-'+tab.dataset.p);
    var pane=doc.querySelector('[data-pane="'+tab.dataset.p+'"]');
    pane.id='pane-'+tab.dataset.p; pane.setAttribute('role','tabpanel');
    pane.setAttribute('aria-labelledby',tab.id);
    tab.addEventListener('keydown',function(e){
      if(['ArrowRight','ArrowLeft','Home','End'].indexOf(e.key)<0) return;
      e.preventDefault(); e.stopPropagation();
      var i=e.key==='Home'?0:e.key==='End'?tabs.length-1:
        (tabs.indexOf(tab)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
      deps.tab(tabs[i].dataset.p); tabs[i].focus();
    });
  });
  // One undo entry per field-edit session, captured BEFORE its input handler.
  var field=null;
  var drawingInputs='gx gy gw gh grx gry astart aext tx ty tsize trot tsx tsy tshx tshy gradAng strokeW miterLim dashPhase texX texY texW texH ptx pty dashPat tstr fillCol fillCol2 strokeCol alpha opacity imgScale ix iy'.split(' ');
  doc.addEventListener('input',function(e){
    if(drawingInputs.indexOf(e.target.id)<0) return;
    if(field!==e.target){ deps.push(); field=e.target; }
  },true);
  doc.addEventListener('focusout',function(){ field=null; });
  doc.addEventListener('change',function(){ field=null; });
  ['input','change'].forEach(function(event){
    doc.addEventListener(event,function(e){
      if(e.target.closest('#props,#menubar,#drawer')) deps.save();
    });
  });
  var helpFocus=null;
  var help=el('help');
  new MutationObserver(function(){
    if(help.classList.contains('on')){ helpFocus=doc.activeElement; el('helpClose').focus(); }
    else if(helpFocus){ helpFocus.focus(); helpFocus=null; }
  }).observe(help,{attributes:true,attributeFilter:['class']});
  help.addEventListener('keydown',function(e){
    if(e.key==='Tab'){ e.preventDefault(); el('helpClose').focus(); }
    if(e.key==='Escape') help.classList.remove('on');
    e.stopPropagation();
  });
  on('showCodeSelection',function(){
    el('drawer').classList.remove('shut');
    var line=el('code').querySelector('.code-selected');
    if(line) line.scrollIntoView({block:'nearest',inline:'nearest'});
    else deps.toast('This selection has no emitted code');
  });
  el('code').addEventListener('click',function(e){
    // Keep ordinary text selection usable for manual copying.
    if(String(window.getSelection())) return;
    var line=e.target.closest('[data-layer]'); if(!line) return;
    deps.selectCode(+line.dataset.layer,line.dataset.point===undefined?null:+line.dataset.point);
  });
  el('copyTarget').onchange=function(){
    el('copy').textContent=this.value==='all'?'Copy code':'Copy '+this.options[this.selectedIndex].text.toLowerCase();
  };
  return {
    update:function(){
      var l=S.layers[S.active],path=l&&l.kind==='path',has=path&&l.pts.length;
      var selected=path&&S.sel&&l.pts[S.sel.i];
      el('selectionInfo').textContent=S.selLayers.length>1?S.selLayers.length+' shapes selected':
        l?(l.name+(selected?' · point '+(S.sel.i+1):'')):'Nothing selected';
      el('quickSnap').checked=S.snap; el('objectSnap').checked=S.objectSnap;
      el('viewMode').textContent=S.solidView?'True opacity':'Edit view';
      el('viewMode').setAttribute('aria-pressed',String(S.solidView));
      el('finishPath').disabled=!has||['pen','line','quad','cubic'].indexOf(S.tool)<0;
      el('closePath').disabled=!has||l.pts.length<2||l.closed;
      el('continuePath').disabled=!has;
      el('pathState').textContent=has?(l.closed?'Closed path':'Open path')+' · '+l.pts.length+' points':'';
      el('pathBar').hidden=!path;
      var tabName=(tabs.filter(function(t){return t.getAttribute('aria-selected')==='true';})[0]||{}).dataset;
      el('nothingSelected').hidden=!!l||!!(tabName&&['image','ruler'].indexOf(tabName.p)>=0);
      ['smoothNode','cornerNode'].forEach(function(id){ el(id).disabled=!selected||S.sel.key!=='a'; });
      ['curveSegment','lineSegment'].forEach(function(id){ el(id).disabled=!selected||selected.cmd==='move'; });
      el('nodeNote').textContent=selected?
        (selected.smooth?'Smooth node: tangent handles stay linked.':'Corner node: handles move independently.'):
        'Select an anchor to change its node type; select an endpoint to change the segment leading into it.';
      tabs.forEach(function(tab){ tab.tabIndex=tab.getAttribute('aria-selected')==='true'?0:-1; });
      el('drawerToggle').setAttribute('aria-expanded',String(!el('drawer').classList.contains('shut')));
    },
    saveStatus:function(state,message){
      el('saveStatus').dataset.state=state; el('saveStatusText').textContent=message;el('saveStatus').setAttribute('aria-label',message+'. Download JSON backup');
    }
  };
};
})(window.PathPlotter = window.PathPlotter || {});
