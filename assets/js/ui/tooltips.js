(function(root){
"use strict";
// A portal keeps help readable even inside scrolling menus and the inspector.
// The source notes retain their ids so live descriptions continue to update.
root.createTooltips=function(){
  var tip=document.createElement('div'), active=null, timer=null, count=0;
  tip.id='descriptionTooltip'; tip.className='description-tooltip'; tip.hidden=true;
  tip.setAttribute('role','tooltip'); document.body.appendChild(tip);
  function hide(){
    clearTimeout(timer); tip.hidden=true;
    if(active) active.button.removeAttribute('aria-describedby');
    active=null;
  }
  function show(item){
    hide(); active=item;
    tip.textContent=item.note.textContent; tip.hidden=false;
    item.button.setAttribute('aria-describedby',tip.id);
    var r=item.button.getBoundingClientRect(), box=tip.getBoundingClientRect();
    tip.style.left=Math.max(8,Math.min(r.left,window.innerWidth-box.width-8))+'px';
    tip.style.top=(r.bottom+box.height+12<window.innerHeight?r.bottom+6:Math.max(8,r.top-box.height-6))+'px';
  }
  function later(){ clearTimeout(timer); timer=setTimeout(hide,150); }
  function add(note){
    var button=document.createElement('button'); button.type='button';
    button.className='help-tip'; button.textContent='?';
    var id=note.id||'description-'+(++count); note.id=id;
    button.dataset.description=id;
    var prev=note.previousElementSibling, label=prev&&prev.querySelector('label');
    var heading=note.parentElement.querySelector('h2,h3,summary');
    var name=(label||heading||prev), host=note.dataset.helpFor&&document.getElementById(note.dataset.helpFor);
    button.setAttribute('aria-label','Help: '+(note.dataset.helpLabel||(name&&name.textContent.trim().replace(/\s+/g,' ').slice(0,65))||'drawing controls'));
    if(host) host.appendChild(button);
    else if(prev&&prev.matches('h2,h3,summary,.checks')) prev.appendChild(button);
    else if(label&&!label.querySelector('input')) label.appendChild(button);
    else note.before(button);
    note.classList.add('tooltip-source');
    var item={button:button,note:note};
    button.addEventListener('mouseenter',function(){show(item);});
    button.addEventListener('focus',function(){show(item);});
    button.addEventListener('mouseleave',later);
    button.addEventListener('blur',later);
    button.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();show(item);});
    new MutationObserver(function(){
      button.hidden=!note.textContent.trim();
      if(active===item){ if(button.hidden)hide();else show(item); }
    }).observe(note,{subtree:true,childList:true,characterData:true});
    button.hidden=!note.textContent.trim();
  }
  // Keep warnings, asset names, and measurement results visible.
  document.querySelectorAll('.menupanel .note,#props .note,#hint,#pvNote,#slRight .note:not(#slErr)').forEach(function(note){
    if(['imgLayerNote','texNote','measDetail'].indexOf(note.id)<0) add(note);
  });
  tip.addEventListener('mouseenter',function(){clearTimeout(timer);});
  tip.addEventListener('mouseleave',later);
  document.addEventListener('pointerdown',function(e){
    if(active&&!tip.contains(e.target)&&e.target!==active.button) hide();
  },true);
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&active){hide();e.stopPropagation();e.preventDefault();}
  },true);
  window.addEventListener('resize',hide);
  document.addEventListener('scroll',function(e){if(e.target!==tip)hide();},true);
  return {hide:hide};
};
})(window.PathPlotter = window.PathPlotter || {});
