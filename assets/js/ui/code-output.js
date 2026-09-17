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


root.codeOutput={esc:esc,highlight:highlight};

})(window.PathPlotter = window.PathPlotter || {});
