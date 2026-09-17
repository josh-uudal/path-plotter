(function(root){
"use strict";

root.createJavaGenerator = function(deps){
var S=deps.state;
var hex2rgb=deps.hex2rgb,
    norm=deps.norm,
    polygonal=deps.polygonal,
    relMatrix=deps.relMatrix,
    isIdentity=deps.isIdentity,
    gradEnds=deps.gradEnds,
    isStrokeDefault=deps.isStrokeDefault,
    dashArray=deps.dashArray,
    hasTf=deps.hasTf,
    centreOf=deps.centreOf,
    groups=deps.groups,
    clipScopes=deps.clipScopes,
    clipOwns=deps.clipOwns,
    tfMatrix=deps.tfMatrix;

var RESERVED={"abstract":1,"assert":1,"boolean":1,"break":1,"byte":1,"case":1,"catch":1,"char":1,
"class":1,"const":1,"continue":1,"default":1,"do":1,"double":1,"else":1,"enum":1,"extends":1,
"final":1,"finally":1,"float":1,"for":1,"goto":1,"if":1,"implements":1,"import":1,"instanceof":1,
"int":1,"interface":1,"long":1,"native":1,"new":1,"package":1,"private":1,"protected":1,"public":1,
"return":1,"short":1,"static":1,"strictfp":1,"super":1,"switch":1,"synchronized":1,"this":1,
"throw":1,"throws":1,"transient":1,"try":1,"void":1,"volatile":1,"while":1,"true":1,"false":1,"null":1};

function javaIdent(raw){
  var words=String(raw).replace(/[^A-Za-z0-9]+/g,' ').trim().split(/\s+/),id='';
  words.forEach(function(w,i){
    if(!w) return;
    id += i===0 ? w.charAt(0).toLowerCase()+w.slice(1) : w.charAt(0).toUpperCase()+w.slice(1);
  });
  return id;
}
// the Graphics2D variable the emitted code paints through. Everything that writes
// a paint statement goes through this, so one setting renames the whole output.
function g2n(){ return S.g2Name||'g2'; }
// the identifier a name wants, before anything is done about collisions. The
// prefix keeps generated fields clear of whatever the target class already has;
// the class name itself asks for the plain form.
function javaBase(raw,plain){
  var id=javaIdent(raw);
  var pfx=plain?'':(S.varPrefix||'');
  if(pfx) id=pfx+cap(id||'shape');
  if(!id||/^[0-9]/.test(id)) id='shape'+id;
  if(RESERVED[id]) id=id+'Shape';
  return id;
}
function javaName(raw,used,plain){
  var base=javaBase(raw,plain),id=base,n=2;
  while(used[id]){ id=base+'_'+n; n++; }
  used[id]=1; return id;
}
// two names can camel-case down to the same identifier, and the generator then
// quietly suffixes the loser; the shape list says so rather than let it surprise
function nameClashes(){
  var seen={},dup={};
  S.layers.forEach(function(l){
    var id=javaBase(l.name);
    if(seen[id]) dup[id]=1; else seen[id]=1;
  });
  return dup;
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
// Every coordinate in the output goes through here. toFixed is what kills the
// float residue: Math.round(n*100)/100 cannot, because dividing puts it back.
// Trailing zeros are stripped -- the output has always been terse.
function roundTo(n,dp){
  var v=parseFloat(n);
  if(!isFinite(v)) return '0';
  dp=Math.max(0,Math.min(6,dp|0));
  var s=v.toFixed(dp);
  if(dp>0) s=s.replace(/([.][0-9]*?)0+$/,'$1').replace(/[.]$/,'');
  return (s===''||s==='-0')?'0':s;
}
function num(n){ return roundTo(n,2); }
// every length or position the drawing is made of; the one the setting moves
function coord(n){ return roundTo(n,S.precision); }
function num6(n){ return (Math.round(n*1e6)/1e6).toString(); }
function colorExpr(hex){ var c=hex2rgb(hex); return 'new Color('+c[0]+', '+c[1]+', '+c[2]+')'; }
function jstr(s){
  return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')
    .replace(/\n/g,'\\n').replace(/\r/g,'').replace(/\t/g,'\\t')+'"';
}

var IMGVARS={}, USED_IMAGES=false, USED_FRC=false;
function collectImages(used){
  IMGVARS={};
  var out=[],files=Object.create(null);
  function add(src,name){
    if(!src||IMGVARS[src]) return;
    name=String(name||'image.png').split(/[\\/]/).pop().replace(/[<>:\"|?*]/g,'_')||'image.png';
    var original=name,n=2,dot=name.lastIndexOf('.');
    while(files[name.toLowerCase()])name=(dot>0?original.slice(0,dot):original)+'-'+(n++)+(dot>0?original.slice(dot):'');
    files[name.toLowerCase()]=true;
    var stem=String(name||'image').replace(/\.[A-Za-z0-9]+$/,'')||'image';
    var v=javaName('img '+stem,used);
    IMGVARS[src]=v;
    out.push({v:v,name:name||'image.png',src:src});
  }
  S.layers.forEach(function(l){
    if(!l.visible) return;
    if(l.kind==='image'&&l.img&&l.img.src) add(l.img.src,l.img.name);
    if(l.paint==='texture'&&l.tex&&l.tex.src) add(l.tex.src,l.tex.name);
  });
  return out;
}

function fontDecl(v,l){
  var style = l.text.bold&&l.text.italic ? 'Font.BOLD | Font.ITALIC'
            : l.text.bold ? 'Font.BOLD' : l.text.italic ? 'Font.ITALIC' : 'Font.PLAIN';
  var size=Math.max(1,l.text.size);
  return 'Font font'+cap(v)+' = new Font('+jstr(l.text.family)+', '+style+', '+Math.round(size)+')'
    +(Number.isInteger(size)?'':'.deriveFont('+coord(size)+'f)')+';\n';
}
// text as a real Shape, so it can join an Area the same way a path can
// Shapes are declared either inline (everything inside paintComponent) or split
// into a field plus a build step, so they are constructed once instead of on
// every repaint. `asField` picks which; `frcVar` is needed because glyph outlines
// want a FontRenderContext, and g2 does not exist outside paint.
function textParts(v,l,asField,frcVar){
  var lines=String(l.text.s||'').split('\n');
  var type=(lines.length===1)?'Shape':'Area';
  function outline(i){
    return 'font'+cap(v)+'.createGlyphVector('+frcVar+', '+jstr(lines[i])+')\n'
         +'        .getOutline('+coord(l.text.x)+'f, '+coord(l.text.y+i*l.text.size*1.2)+'f)';
  }
  var body=fontDecl(v,l), i;
  if(asField){
    body+=v+' = '+(type==='Area'?('new Area('+outline(0)+')'):outline(0))+';\n';
    for(i=1;i<lines.length;i++) body+=v+'.add(new Area('+outline(i)+'));\n';
    return {field:'private '+type+' '+v+';\n', build:body};
  }
  body+=type+' '+v+' = '+(type==='Area'?('new Area('+outline(0)+')'):outline(0))+';\n';
  for(i=1;i<lines.length;i++) body+=v+'.add(new Area('+outline(i)+'));\n';
  return {field:body, build:''};
}

function primitiveExpr(l){
  var g=norm(l.g);
  if(l.kind==='rect'){
    var rx=Math.min(l.g.rx||0,g.w/2), ry=Math.min(l.g.ry||0,g.h/2);
    if(rx>0&&ry>0) return {type:'RoundRectangle2D',
      ctor:'new RoundRectangle2D.Double('+coord(g.x)+', '+coord(g.y)+', '+coord(g.w)+', '+coord(g.h)
          +', '+coord(rx*2)+', '+coord(ry*2)+')'};
    return {type:'Rectangle2D',
      ctor:'new Rectangle2D.Double('+coord(g.x)+', '+coord(g.y)+', '+coord(g.w)+', '+coord(g.h)+')'};
  }
  if(l.kind==='ellipse') return {type:'Ellipse2D',
    ctor:'new Ellipse2D.Double('+coord(g.x)+', '+coord(g.y)+', '+coord(g.w)+', '+coord(g.h)+')'};
  if(l.kind==='arc') return {type:'Arc2D',
    ctor:'new Arc2D.Double('+coord(g.x)+', '+coord(g.y)+', '+coord(g.w)+', '+coord(g.h)+', '
        +num(l.g.start)+', '+num(l.g.extent)+', Arc2D.'+l.g.arcType+')'};
  return null;
}

function declParts(v,l,asField,frcVar){
  if(l.kind==='image') return {field:'',build:''};
  if(l.kind==='text') return textParts(v,l,asField,frcVar||g2n()+'.getFontRenderContext()');
  if(l.kind==='path'){
    var cls=l.shapeClass||'GeneralPath';
    if(cls==='Polygon'&&polygonal(l)){
      var xs=[],ys=[];
      l.pts.forEach(function(p){ xs.push(Math.round(p.x)); ys.push(Math.round(p.y)); });
      var arrays='int[] '+v+'X = {'+xs.join(', ')+'};\n'
                +'int[] '+v+'Y = {'+ys.join(', ')+'};\n';
      var make='new Polygon('+v+'X, '+v+'Y, '+xs.length+')';
      if(asField) return {field:'private Polygon '+v+';\n', build:arrays+v+' = '+make+';\n'};
      return {field:arrays+'Polygon '+v+' = '+make+';\n', build:''};
    }
    if(cls==='Polygon') cls='GeneralPath';   // curves crept in since it was picked
    var wind=(l.wind==='evenodd')
      ? (cls==='GeneralPath'?'GeneralPath.WIND_EVEN_ODD':'Path2D.WIND_EVEN_ODD') : '';
    var ctor='new '+cls+'('+wind+')';
    var body='', open=false;
    l.pts.forEach(function(p){
      if(p.cmd==='move'){
        if(open&&l.closed) body+=v+'.closePath();\n';
        body+=v+'.moveTo('+coord(p.x)+', '+coord(p.y)+');\n'; open=true;
      }
      else if(p.cmd==='line')  body+=v+'.lineTo('+coord(p.x)+', '+coord(p.y)+');\n';
      else if(p.cmd==='quad')  body+=v+'.quadTo('+coord(p.cx)+', '+coord(p.cy)+', '+coord(p.x)+', '+coord(p.y)+');\n';
      else if(p.cmd==='cubic') body+=v+'.curveTo('+coord(p.c1x)+', '+coord(p.c1y)+', '+coord(p.c2x)+', '+coord(p.c2y)+', '+coord(p.x)+', '+coord(p.y)+');\n';
    });
    if(open&&l.closed) body+=v+'.closePath();\n';
    if(asField) return {field:'private final '+cls+' '+v+' = '+ctor+';\n', build:body};
    return {field:cls+' '+v+' = '+ctor+';\n', build:body};
  }
  var e=primitiveExpr(l);
  if(!e) return {field:'',build:''};
  if(asField) return {field:'private final '+e.type+' '+v+' = '+e.ctor+';\n', build:''};
  return {field:e.type+' '+v+' = '+e.ctor+';\n', build:''};
}

// a group member keeps its own transform by baking it into the shape
function tfBake(v,l,baseInv){
  var m=relMatrix(l,baseInv);
  if(isIdentity(m)) return {code:'',name:v};
  var tv='tx'+cap(v);
  return {code:'AffineTransform '+tv+' = new AffineTransform('
      +num6(m.a)+', '+num6(m.b)+', '+num6(m.c)+', '
      +num6(m.d)+', '+num6(m.e)+', '+num6(m.f)+');\n'
      +'Shape '+v+'T = '+tv+'.createTransformedShape('+v+');\n',
    name:v+'T'};
}

function paintStmt(l){
  if(l.paint==='linear'){
    var e=gradEnds(l);
    return g2n()+'.setPaint(new GradientPaint('+coord(e.x1)+'f, '+coord(e.y1)+'f, '+colorExpr(l.fillColor)
         +', '+coord(e.x2)+'f, '+coord(e.y2)+'f, '+colorExpr(l.fillColor2)+'));\n';
  }
  if(l.paint==='radial'){
    var q=gradEnds(l);
    return g2n()+'.setPaint(new RadialGradientPaint(new Point2D.Float('+coord(q.cx)+'f, '+coord(q.cy)+'f), '
         +coord(q.r)+'f,\n        new float[]{0f, 1f},\n        new Color[]{'
         +colorExpr(l.fillColor)+', '+colorExpr(l.fillColor2)+'}));\n';
  }
  if(l.paint==='texture'&&l.tex&&l.tex.src&&IMGVARS[l.tex.src]){
    return g2n()+'.setPaint(new TexturePaint('+IMGVARS[l.tex.src]+', new Rectangle2D.Double('
         +coord(l.tex.x)+', '+coord(l.tex.y)+', '+coord(l.tex.w)+', '+coord(l.tex.h)+')));\n';
  }
  return g2n()+'.setColor('+colorExpr(l.fillColor)+');\n';
}

function strokeStmt(l){
  var w=num(l.strokeW)+'f';
  var d=dashArray(l);
  if(isStrokeDefault(l)) return g2n()+'.setStroke(new BasicStroke('+w+'));\n';
  var capC='BasicStroke.CAP_'+String(l.cap).toUpperCase();
  var joinC='BasicStroke.JOIN_'+String(l.join).toUpperCase();
  var ml=num(Math.max(1,l.miter||10))+'f';
  if(!d) return g2n()+'.setStroke(new BasicStroke('+w+', '+capC+', '+joinC+', '+ml+'));\n';
  return g2n()+'.setStroke(new BasicStroke('+w+', '+capC+', '+joinC+', '+ml+',\n'
       +'        new float[]{'+d.map(function(n){ return num(n)+'f'; }).join(', ')+'}, '
       +num(l.dashPhase||0)+'f));\n';
}

function tfOpen(l,v){
  if(!hasTf(l)) return '';
  var c=centreOf(l), t=l.tf, s='';
  s+='AffineTransform tx'+cap(v)+' = '+g2n()+'.getTransform();\n';
  s+=g2n()+'.translate('+coord(c.x)+', '+coord(c.y)+');\n';
  if(t.rot) s+=g2n()+'.rotate(Math.toRadians('+num(t.rot)+'));\n';
  if(t.sx!==1||t.sy!==1) s+=g2n()+'.scale('+num(t.sx)+', '+num(t.sy)+');\n';
  if(t.shx||t.shy) s+=g2n()+'.shear('+num(t.shx)+', '+num(t.shy)+');\n';
  s+=g2n()+'.translate('+coord(-c.x)+', '+coord(-c.y)+');\n';
  return s;
}
function tfClose(l,v){ return hasTf(l)?(g2n()+'.setTransform(tx'+cap(v)+');\n'):''; }
function alphaOpen(l,v){
  if(l.alpha===undefined||l.alpha>=1) return '';
  return 'Composite comp'+cap(v)+' = '+g2n()+'.getComposite();\n'
       + g2n()+'.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, '+num(l.alpha)+'f));\n';
}
function alphaClose(l,v){
  return (l.alpha===undefined||l.alpha>=1)?'':(g2n()+'.setComposite(comp'+cap(v)+');\n');
}

function textBlock(l,v){
  var out=fontDecl(v,l);
  out+=g2n()+'.setFont(font'+cap(v)+');\n';
  var lines=String(l.text.s||'').split('\n');
  lines.forEach(function(line,i){
    var yy=coord(l.text.y+i*l.text.size*1.2);
    if(l.render==='fill'||l.render==='both'){
      out+=paintStmt(l);
      var xx=coord(l.text.x), fractional=xx.indexOf('.')>=0||yy.indexOf('.')>=0;
      out+=g2n()+'.drawString('+jstr(line)+', '+xx+(fractional?'f':'')+', '+yy+(fractional?'f':'')+');\n';
    }
    if(l.render==='draw'||l.render==='both'){
      out+='Shape outline'+cap(v)+(i?String(i+1):'')+' = font'+cap(v)
         +'.createGlyphVector('+g2n()+'.getFontRenderContext(), '+jstr(line)+')\n'
         +'        .getOutline('+coord(l.text.x)+'f, '+yy+'f);\n';
      out+=g2n()+'.setColor('+colorExpr(l.strokeColor)+');\n';
      out+=strokeStmt(l);
      out+=g2n()+'.draw(outline'+cap(v)+(i?String(i+1):'')+');\n';
    }
  });
  return out;
}

function drawableIn(l){
  if(l.kind==='text') return String(l.text.s||'').length>0;
  if(l.kind==='image') return !!(l.img&&l.img.src);
  if(l.kind==='path') return l.pts.length>0;
  var g=norm(l.g); return g.w>0&&g.h>0;
}

function buildOnceOn(){
  return !!deps.getBuildOnce();
}

// Produces three streams. In "build once" mode the shapes become fields built a
// single time; otherwise everything lands in the paint stream exactly as before.
var SOURCE_MAP=[];
function genParts(split){
  var used={}, F='', B='', P='', first=true;
  SOURCE_MAP=[];
  var SC=clipScopes(), clipStack=[];   // saved-clip names, innermost last
  var frc=split?'FRC':g2n()+'.getFontRenderContext()';
  var imgs=collectImages(used);
  USED_IMAGES=imgs.length>0;
  USED_FRC=false;

  if(imgs.length){
    if(split){
      imgs.forEach(function(im){ F+='private BufferedImage '+im.v+';\n'; });
      B+='// files are relative to the Java process working directory\n';
      B+='try {\n';
      imgs.forEach(function(im){ B+='    '+im.v+' = ImageIO.read(new File('+jstr(im.name)+'));\n'; });
      B+='} catch (IOException ex) {\n    ex.printStackTrace();\n}\n';
    } else {
      P+='// images: files are relative to the Java process working directory\n';
      imgs.forEach(function(im){ P+='BufferedImage '+im.v+' = null;\n'; });
      P+='try {\n';
      imgs.forEach(function(im){ P+='    '+im.v+' = ImageIO.read(new File('+jstr(im.name)+'));\n'; });
      P+='} catch (IOException ex) {\n    ex.printStackTrace();\n}\n';
      first=false;
    }
  }
  function put(parts){
    if(split){ F+=parts.field; B+=parts.build; }
    else { P+=parts.field+parts.build; }
  }
  function local(parts){   // group members are only used while building the Area
    if(split){ B+=parts.field+parts.build; }
    else { P+=parts.field+parts.build; }
  }

  groups().forEach(function(grp){
    var start={fields:F.length,build:B.length,paint:P.length};
    try{
    var base=grp[0];
    var drawable=grp.filter(drawableIn);
    if(!drawable.length) return;
    // An empty member is dropped above because add, subtract and exclusiveOr all
    // leave the running Area alone -- but intersect does not, it empties it, and
    // quietly dropping the member would have the code draw a shape the sheet does
    // not. Java would arrive at nothing here, so the output says nothing too.
    var emptied=grp.some(function(l,i){
      return i>0&&!drawableIn(l)&&l.combine==='intersect';
    });
    if(emptied){
      if(!first) P+='\n';
      first=false;
      P+='// '+base.name+': an empty shape is intersected into this run, so the Area\n'
        +'// comes out empty and there is nothing to paint\n';
      return;
    }
    if(!first) P+='\n';
    first=false;

    // leaving a clip's run restores whatever clip was active before it
    var bi=S.layers.indexOf(base), bd=(bi>=0&&SC[bi])?SC[bi].length:0;
    var closed=0;
    while(clipStack.length>bd){ P+=g2n()+'.setClip('+clipStack.pop()+');\n'; closed++; }
    if(closed) P+='\n';           // let the restored scope breathe

    if(base.isClip&&grp.length===1){
      if(!clipOwns(bi)) return;    // nothing is nested under it, so emit nothing
      var cv=javaName(base.name,used);
      P+='// clip region: '+base.name+'\n';
      put(declParts(cv,base,split,frc));
      var sv='savedClip'+(clipStack.length?String(clipStack.length+1):'');
      P+='Shape '+sv+' = '+g2n()+'.getClip();\n';
      // clip() intersects with what is already active so nested regions compose;
      // setClip() would throw the outer region away
      P+=g2n()+'.clip('+cv+');\n';
      clipStack.push(sv);
      return;
    }

    if(drawable.length===1){
      var l=drawable[0], v=javaName(l.name,used);
      P+='// '+l.name+(l.group?'  [group]':'')+'\n';
      if(l.kind!=='text'&&l.kind!=='image') put(declParts(v,l,split,frc));
      P+=alphaOpen(l,v);
      P+=tfOpen(l,v);
      if(l.kind==='text') P+=textBlock(l,v);
      else if(l.kind==='image'){
        var gi=norm(l.g);
        if([gi.x,gi.y,gi.w,gi.h].every(Number.isInteger)){
          P+=g2n()+'.drawImage('+IMGVARS[l.img.src]+', '+coord(gi.x)+', '+coord(gi.y)+', '
            +coord(gi.w)+', '+coord(gi.h)+', null);\n';
        } else {
          var iv=IMGVARS[l.img.src];
          P+='if ('+iv+' != null) {\n'
            +'    AffineTransform imageTx'+cap(v)+' = AffineTransform.getTranslateInstance('+coord(gi.x)+', '+coord(gi.y)+');\n'
            +'    imageTx'+cap(v)+'.scale('+coord(gi.w)+' / (double) '+iv+'.getWidth(), '+coord(gi.h)+' / (double) '+iv+'.getHeight());\n'
            +'    '+g2n()+'.drawImage('+iv+', imageTx'+cap(v)+', null);\n}\n';
        }
      } else {
        if(l.render==='fill'||l.render==='both'){ P+=paintStmt(l); P+=g2n()+'.fill('+v+');\n'; }
        if(l.render==='draw'||l.render==='both'){
          P+=g2n()+'.setColor('+colorExpr(l.strokeColor)+');\n';
          P+=strokeStmt(l);
          P+=g2n()+'.draw('+v+');\n';
        }
      }
      P+=tfClose(l,v);
      P+=alphaClose(l,v);
      return;
    }

    // Area group: members keep their own transforms, relative to the base
    P+='// '+drawable.map(function(x){ return x.name; }).join(' → ')+'\n';
    var bm=tfMatrix(base), baseInv=null;
    if(bm){ try{ baseInv=bm.inverse(); }catch(e){ baseInv=null; } }
    var names=drawable.map(function(x){ return javaName(x.name,used); });
    var parts=[];
    drawable.forEach(function(x,i){
      local(declParts(names[i],x,false,frc));
      if(x.kind==='text') USED_FRC=USED_FRC||split;
      var bake=tfBake(names[i],x,baseInv);
      if(split) B+=bake.code; else P+=bake.code;
      parts.push(bake.name);
    });
    var av=javaName(drawable[0].name+' area',used);
    var areaBuild='Area '+av+' = new Area('+parts[0]+');\n';
    for(var i=1;i<drawable.length;i++)
      areaBuild+=av+'.'+drawable[i].combine+'(new Area('+parts[i]+'));\n';
    if(split){
      F+='private Area '+av+';\n';
      B+=areaBuild.replace('Area '+av+' = ',av+' = ')+'\n';
    } else P+=areaBuild;

    P+=alphaOpen(base,av);
    P+=tfOpen(base,av);
    if(base.render==='fill'||base.render==='both'){ P+=paintStmt(base); P+=g2n()+'.fill('+av+');\n'; }
    if(base.render==='draw'||base.render==='both'){
      P+=g2n()+'.setColor('+colorExpr(base.strokeColor)+');\n';
      P+=strokeStmt(base);
      P+=g2n()+'.draw('+av+');\n';
    }
    P+=tfClose(base,av);
    P+=alphaClose(base,av);
    } finally {
      SOURCE_MAP.push({layers:grp.map(function(l){ return S.layers.indexOf(l); }),
        fields:F.slice(start.fields),build:B.slice(start.build),paint:P.slice(start.paint)});
    }
  });

  if(clipStack.length) P+='\n';
  while(clipStack.length) P+=g2n()+'.setClip('+clipStack.pop()+');\n';
  if(split&&USED_FRC)
    F='private static final FontRenderContext FRC = new FontRenderContext(null, true, true);\n'+F;
  return {fields:F,build:B,paint:P};
}

function generate(){
  var split=buildOnceOn();
  var g=genParts(split);
  if(!g.paint.trim()) return '';
  var setup=bgSetup();
  var head=setup?'// ---- panel: call this in your constructor ----\n'+setup+'\n':'';
  if(!split) return head+g.paint;
  var out=head;
  if(g.fields.trim()) out+='// ---- fields: declare these in your class ----\n'+g.fields+'\n';
  if(g.build.trim()) out+='// ---- build once: call this from your constructor ----\n'+g.build+'\n';
  out+='// ---- paintComponent ----\n'+g.paint;
  return out;
}

function indent(t,p){ return t.split('\n').map(function(l){ return l.trim()===''?'':p+l; }).join('\n'); }

function classNameOf(){
  var id=javaName(deps.getClassName()||'ShapePanel',{},true);
  return cap(id);
}

function classImports(){
  var s='import java.awt.*;\nimport java.awt.geom.*;\nimport javax.swing.*;\n';
  if(USED_FRC) s+='import java.awt.font.FontRenderContext;\n';
  if(USED_IMAGES) s+='import java.awt.image.BufferedImage;\nimport javax.imageio.ImageIO;\n'
                    +'import java.io.File;\nimport java.io.IOException;\n';
  return s;
}
function bgSetup(){
  return S.bgSet?('setBackground('+colorExpr(S.bg)+');\n'):'';
}
function hintsBlock(){
  return S.aa?'        '+g2n()+'.setRenderingHint(RenderingHints.KEY_ANTIALIASING,\n'
             +'                            RenderingHints.VALUE_ANTIALIAS_ON);\n':'';
}
function mainBlock(cn){
  return '    public static void main(String[] args) {\n'
  +'        SwingUtilities.invokeLater(() -> {\n'
  +'            JFrame f = new JFrame("'+cn+'");\n'
  +'            f.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);\n'
  +'            f.add(new '+cn+'());\n'
  +'            f.pack();\n'
  +'            f.setLocationRelativeTo(null);\n'
  +'            f.setVisible(true);\n'
  +'        });\n'
  +'    }\n';
}

// shapes built once in the constructor; paintComponent only paints
function fullClassOnce(){
  var g=genParts(true);
  if(!g.paint.trim()) return '';
  var cn=classNameOf(), hasBuild=!!g.build.trim();
  return classImports()+'\n'
  +'public class '+cn+' extends JPanel {\n\n'
  +(g.fields.trim()?indent(g.fields.replace(/\n+$/,''),'    ')+'\n\n':'')
  +'    public '+cn+'() {\n'
  +'        setPreferredSize(new Dimension('+S.W+', '+S.H+'));\n'
  +(S.bgSet?'        '+bgSetup():'')
  +(hasBuild?'        buildShapes();\n':'')
  +'    }\n\n'
  +(hasBuild?('    private void buildShapes() {\n'
             +indent(g.build.replace(/\n+$/,''),'        ')+'\n'
             +'    }\n\n'):'')
  +'    @Override\n'
  +'    protected void paintComponent(Graphics g) {\n'
  +'        super.paintComponent(g);\n'
  +'        Graphics2D '+g2n()+' = (Graphics2D) g;\n'
  +hintsBlock()
  +'\n'+indent(g.paint.replace(/\n+$/,''),'        ')+'\n'
  +'    }\n\n'
  +mainBlock(cn)
  +'}\n';
}

function fullClass(){
  if(buildOnceOn()) return fullClassOnce();
  var body=generate();
  if(!body.trim()) return '';
  var cn=classNameOf();
  return classImports()+'\n'
  +'public class '+cn+' extends JPanel {\n\n'
  +(S.bgSet?('    public '+cn+'() {\n        '+bgSetup()+'    }\n\n'):'')
  +'    @Override\n'
  +'    protected void paintComponent(Graphics g) {\n'
  +'        super.paintComponent(g);\n'
  +'        Graphics2D '+g2n()+' = (Graphics2D) g;\n'
  +hintsBlock()
  +'\n'+indent(body.replace(/\n+$/,''),'        ')+'\n'
  +'    }\n\n'
  +'    @Override\n'
  +'    public Dimension getPreferredSize() {\n'
  +'        return new Dimension('+S.W+', '+S.H+');\n'
  +'    }\n\n'
  +mainBlock(cn)
  +'}\n';
}

function outputText(){ return S.out==='full' ? fullClass() : generate(); }


return {
  isReserved:function(id){ return !!RESERVED[id]; },
  javaIdent:javaIdent,
  g2n:g2n,
  javaBase:javaBase,
  javaName:javaName,
  nameClashes:nameClashes,
  cap:cap,
  roundTo:roundTo,
  num:num,
  declParts:declParts,
  tfBake:tfBake,
  classNameOf:classNameOf,
  outputText:outputText,
  generate:generate,
  fullClass:fullClass,
  parts:function(){ return genParts(buildOnceOn()); },
  sourceMap:function(){ return SOURCE_MAP; },
  assets:function(){ return collectImages({}); },
  imports:classImports,
  background:bgSetup
};
};

})(window.PathPlotter = window.PathPlotter || {});
