(function(root){
"use strict";

function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

var KW=/\b(GeneralPath|Path2D|Polygon|Rectangle2D|RoundRectangle2D|Ellipse2D|Arc2D|Area|BasicStroke|AffineTransform|AlphaComposite|Composite|GradientPaint|RadialGradientPaint|TexturePaint|BufferedImage|ImageIO|IOException|File|Point2D|Font|Shape|Color|Dimension|Graphics2D|Graphics|JPanel|JFrame|SwingUtilities|RenderingHints|Math|new|public|protected|import|class|extends|return|void|static|try|catch|null|int|float)\b/g;
function plainCode(s){
  return esc(s).replace(KW,'<span class="kw">$1</span>')
               .replace(/(-?\d+\.?\d*)(?=[,)f])/g,'<span class="num">$1</span>');
}
function highlight(src){
  var out='', i=0, n=src.length;
  while(i<n){
    if(src.charAt(i)==='"'){
      var j=i+1;
      while(j<n){
        if(src.charAt(j)==='\\'){ j+=2; continue; }
        if(src.charAt(j)==='"'){ j++; break; }
        j++;
      }
      out+='<span class="str">'+esc(src.slice(i,j))+'</span>';
      i=j; continue;
    }
    if(src.charAt(i)==='/'&&src.charAt(i+1)==='/'){
      var k=src.indexOf('\n',i); if(k<0) k=n;
      out+='<span class="cm">'+esc(src.slice(i,k))+'</span>';
      i=k; continue;
    }
    var m=i;
    while(m<n&&src.charAt(m)!=='"'&&!(src.charAt(m)==='/'&&src.charAt(m+1)==='/')) m++;
    out+=plainCode(src.slice(i,m));
    i=m;
  }
  return out;
}


function mapLines(text,groups,layers){
  var lines=text.split('\n').map(function(t){ return {text:t,layers:[],point:null}; });
  groups.forEach(function(group){
    ['fields','build','paint'].forEach(function(part){
      var block=group[part].replace(/^\n+|\n+$/g,'').split('\n');
      if(!block[0]) return;
      for(var i=0;i<=lines.length-block.length;i++){
        if(!block.every(function(t,j){ return lines[i+j].text.trim()===t.trim(); })) continue;
        var point=0, single=group.layers.length===1&&layers[group.layers[0]].kind==='path';
        block.forEach(function(t,j){
          lines[i+j].layers=group.layers;
          if(single&&/\.(moveTo|lineTo|quadTo|curveTo)\(/.test(t)) lines[i+j].point=point++;
        });
        break;
      }
    });
  });
  return lines;
}
function render(text,groups,state){
  return mapLines(text,groups,state.layers).map(function(line){
    var selected=line.layers.some(function(i){return state.selLayers.indexOf(i)>=0;});
    var point=selected&&state.sel&&line.point===state.sel.i;
    var attrs=line.layers.length?' data-layer="'+line.layers[0]+'"':'';
    if(line.point!==null) attrs+=' data-point="'+line.point+'"';
    return '<span class="code-line'+(selected?' code-selected':'')+(point?' code-point':'')+'"'+attrs+'>'+highlight(line.text)+'</span>';
  }).join('');
}
root.codeOutput={esc:esc,highlight:highlight,mapLines:mapLines,render:render};

})(window.PathPlotter = window.PathPlotter || {});
