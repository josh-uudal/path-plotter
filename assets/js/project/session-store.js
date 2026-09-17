(function(root){
"use strict";
root.createSessionStore=function(deps){
  var key='pathPlotter/session@1', chain=Promise.resolve(), generation=0;
  var dbPromise=new Promise(function(resolve){
    try{
      if(!deps.indexedDB){ resolve(null); return; }
      var req=deps.indexedDB.open('pathPlotter',1);
      req.onupgradeneeded=function(){ req.result.createObjectStore('sessions'); };
      req.onsuccess=function(){ resolve(req.result); };
      req.onerror=req.onblocked=function(){ resolve(null); };
    }catch(e){ resolve(null); }
  });
  function localGet(){
    var raw;try{raw=deps.local.getItem(key);}catch(e){return null;}
    try{return JSON.parse(raw||'null');}catch(e){return {corrupt:true};}
  }
  function localSet(d){ try{ deps.local.setItem(key,JSON.stringify(d)); return true; }catch(e){ return false; } }
  function request(db,mode,fn){
    return new Promise(function(resolve,reject){
      try{
        var tx=db.transaction('sessions',mode), req=fn(tx.objectStore('sessions')), result;
        req.onsuccess=function(){ result=req.result; };
        tx.oncomplete=function(){ resolve(result); };
        tx.onerror=tx.onabort=function(){ reject(tx.error||new Error('Storage unavailable')); };
      }catch(e){ reject(e); }
    });
  }
  return {
    read:function(){
      var local=localGet();
      return dbPromise.then(function(db){
        return db?request(db,'readonly',function(s){ return s.get('current'); }).catch(function(){ return null; }):null;
      }).then(function(stored){
        if(local&&local.layers&&(!stored||(local.savedAt||0)>(stored.savedAt||0))) return local;
        if(stored) return stored;
        if(local&&local.corrupt)throw new Error('Stored project is damaged. Open a JSON backup.');
        if(local&&local.storage==='indexedDB') throw new Error('Stored work is unavailable. Open a JSON backup.');
        return null;
      });
    },
    save:function(data){
      var current=generation, record=JSON.parse(JSON.stringify(data)); record.savedAt=Date.now();
      chain=chain.catch(function(){}).then(function(){
        if(current!==generation) return;
        return dbPromise.then(function(db){
          return db?request(db,'readwrite',function(s){ return s.put(record,'current'); }).then(function(){ return true; }).catch(function(){ return false; }):false;
        }).then(function(saved){
          if(current!==generation) return;
          var complete=record.trimmed?{state:'partial',message:'Images missing — open a JSON backup'}:{state:'saved',message:'Saved in this browser'};
          if(saved){ localSet({storage:'indexedDB',savedAt:record.savedAt}); return complete; }
          if(localSet(record)) return complete;
          // Keep a recoverable geometry copy, but never call this a full save.
          record.trimmed=true; record.image=null;
          record.layers.concat(record.lab?record.lab.shapes:[]).forEach(function(l){
            if(l.img) l.img.src=''; if(l.tex) l.tex.src='';
          });
          return localSet(record)
            ?{state:'partial',message:'Images not saved — download a JSON backup'}
            :{state:'error',message:'Could not save — download a JSON backup'};
        });
      });
      return chain;
    },
    clear:function(){
      generation++;
      chain=chain.catch(function(){}).then(function(){
        try{ deps.local.removeItem(key); }catch(e){}
        return dbPromise.then(function(db){ return db?request(db,'readwrite',function(s){ return s.delete('current'); }):null; });
      });
      return chain;
    }
  };
};
})(window.PathPlotter = window.PathPlotter || {});
