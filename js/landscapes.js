/* 山水背景引擎 —— 由「山水风景图集.html」抽取，供「古诗跑酷」做关卡远景背景。
   纯离线、确定性：window.LandscapeArt.renderTo(index, canvas) 把第 index 帧画到离屏 canvas。
   与图集同源；此处默认不绘题款/印章（LABELS=false），仅作背景。 */
window.LandscapeArt = (function(){
  "use strict";
  var LABELS = false;   // 背景模式：不画竖排标题与印章

  /* ============ 基础工具 ============ */
  // mulberry32 —— 固定种子伪随机，保证每帧画面"确定性生成"
  function rngOf(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a,b,t)=>a+(b-a)*t;
  const clamp = (v,a,b)=>v<a?a:(v>b?b:v);

  // hex -> {r,g,b}
  function parse(hex){
    hex = hex.replace('#','');
    return { r:parseInt(hex.slice(0,2),16), g:parseInt(hex.slice(2,4),16), b:parseInt(hex.slice(4,6),16) };
  }
  function rgba(hex,a){ const c=parse(hex); return `rgba(${c.r},${c.g},${c.b},${a})`; }
  // 两色按 t 混合后输出 rgba
  function mix(h1,h2,t,a){
    const c1=parse(h1),c2=parse(h2);
    const r=Math.round(lerp(c1.r,c2.r,t)), g=Math.round(lerp(c1.g,c2.g,t)), b=Math.round(lerp(c1.b,c2.b,t));
    return `rgba(${r},${g},${b},${a==null?1:a})`;
  }

  // 一维中点位移 —— 生成自然起伏的山脊线（长度 = 2^pow + 1）
  function ridge(rng, pow, rough, amp){
    const n = (1<<pow);
    const p = new Array(n+1).fill(0);
    p[0] = (rng()-0.5)*amp; p[n] = (rng()-0.5)*amp;
    let step=n, a=amp;
    while(step>1){
      const half=step>>1;
      for(let i=half;i<n;i+=step){
        p[i] = (p[i-half]+p[i+half])/2 + (rng()-0.5)*a;
      }
      a*=rough; step=half;
    }
    return p;
  }

  /* ============ 纸张 / 纹理 / 晕染 ============ */
  // 宣纸底：基色填充 + 经向晕色 + 暗角 + 纤维噪点
  function paper(ctx,W,H,base,warm,rng){
    ctx.fillStyle = base; ctx.fillRect(0,0,W,H);
    // 天地晕色（上方略亮）
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, rgba(warm,.0));
    g.addColorStop(.5, rgba(warm,.10));
    g.addColorStop(1, rgba(warm,.22));
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    // 暗角
    const v = ctx.createRadialGradient(W/2,H*.42,W*.2, W/2,H*.5,W*.85);
    v.addColorStop(0,'rgba(0,0,0,0)');
    v.addColorStop(1,'rgba(40,34,24,.18)');
    ctx.fillStyle=v; ctx.fillRect(0,0,W,H);
    // 纤维噪点
    const n = Math.floor(W*H/620);
    for(let i=0;i<n;i++){
      const x=rng()*W, y=rng()*H, s=rng()*1.5+.3;
      ctx.fillStyle = rng()>.5 ? 'rgba(255,255,255,.05)' : 'rgba(60,50,35,.05)';
      ctx.fillRect(x,y,s,s);
    }
  }

  // 皴擦：在区域内撒短墨线，模拟山体肌理
  function cunStrokes(ctx,x0,y0,x1,y1,color,rng,count){
    ctx.save(); ctx.strokeStyle=color; ctx.lineCap='round';
    for(let i=0;i<count;i++){
      const x=lerp(x0,x1,rng()), y=lerp(y0,y1,rng());
      const len=rng()*16+5, ang=Math.PI*0.5 + (rng()-0.5)*0.9;
      ctx.globalAlpha = rng()*0.18+0.05;
      ctx.lineWidth = rng()*1.2+0.4;
      ctx.beginPath(); ctx.moveTo(x,y);
      ctx.lineTo(x+Math.cos(ang)*len, y+Math.sin(ang)*len); ctx.stroke();
    }
    ctx.restore();
  }

  // 墨点晕染团（带柔边）
  function inkBlot(ctx,x,y,r,color,rng,blobs){
    ctx.save();
    for(let i=0;i<blobs;i++){
      const rr=r*(0.5+rng()*0.7);
      const gg=ctx.createRadialGradient(x,y,0,x,y,rr);
      gg.addColorStop(0,color);
      gg.addColorStop(1,color.replace(/[\d.]+\)$/,'0)'));
      ctx.fillStyle=gg;
      ctx.beginPath();
      ctx.arc(x+(rng()-0.5)*r*0.8, y+(rng()-0.5)*r*0.5, rr, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ============ 山体 / 远峰 ============ */
  // 一层山：topY 为山脊基准线，向下填到 floorY
  function mountainBand(ctx,W,topY,floorY,amp,rough,fillTop,fillBot,rng){
    const N=8; const r=ridge(rng,N,rough,amp); const seg=(1<<N);
    ctx.beginPath(); ctx.moveTo(0,floorY);
    for(let i=0;i<=seg;i++){
      const x=W*i/seg, y=topY+r[i];
      ctx.lineTo(x,y);
    }
    ctx.lineTo(W,floorY); ctx.closePath();
    const g=ctx.createLinearGradient(0,topY-amp,0,floorY);
    g.addColorStop(0,fillTop); g.addColorStop(1,fillBot);
    ctx.fillStyle=g; ctx.fill();
    return r; // 返回脊线供倒影/勾边
  }

  // 桂林式喀斯特独峰（钟乳状圆顶峰）
  function karst(ctx,cx,baseY,w,h,fillTop,fillBot,line){
    ctx.beginPath();
    ctx.moveTo(cx-w/2, baseY);
    ctx.bezierCurveTo(cx-w*0.5, baseY-h*0.5, cx-w*0.30, baseY-h, cx, baseY-h);
    ctx.bezierCurveTo(cx+w*0.30, baseY-h, cx+w*0.5, baseY-h*0.5, cx+w/2, baseY);
    ctx.closePath();
    const g=ctx.createLinearGradient(cx,baseY-h,cx,baseY);
    g.addColorStop(0,fillTop); g.addColorStop(1,fillBot);
    ctx.fillStyle=g; ctx.fill();
    if(line){ ctx.strokeStyle=line; ctx.lineWidth=1.2; ctx.stroke(); }
  }

  /* ============ 元素：水 / 云 / 日月 / 雨 / 竹 / 鸟 ============ */
  function water(ctx,W,y0,y1,topColor,botColor,rng){
    const g=ctx.createLinearGradient(0,y0,0,y1);
    g.addColorStop(0,topColor); g.addColorStop(1,botColor);
    ctx.fillStyle=g; ctx.fillRect(0,y0,W,y1-y0);
    // 横向波光
    ctx.save();
    for(let i=0;i<46;i++){
      const y=lerp(y0+4,y1-4,rng());
      const x=rng()*W, len=rng()*W*0.22+20;
      ctx.globalAlpha=rng()*0.18+0.04;
      ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=rng()*1.2+0.4;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+len,y); ctx.stroke();
    }
    ctx.restore();
  }

  // 云带 / 雾气：柔和横向晕染
  function mistBand(ctx,W,cy,h,color,rng){
    ctx.save();
    for(let i=0;i<5;i++){
      const y=cy+(rng()-0.5)*h;
      const g=ctx.createRadialGradient(W*rng(),y,0, W*rng(),y, W*(0.4+rng()*0.4));
      g.addColorStop(0,color); g.addColorStop(1,color.replace(/[\d.]+\)$/,'0)'));
      ctx.fillStyle=g;
      ctx.fillRect(0,cy-h,W,h*2);
    }
    ctx.restore();
  }

  function orb(ctx,x,y,r,core,glow){
    const g=ctx.createRadialGradient(x,y,0,x,y,r*3.2);
    g.addColorStop(0,glow); g.addColorStop(.18,glow);
    g.addColorStop(1,glow.replace(/[\d.]+\)$/,'0)'));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r*3.2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=core; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }

  function rain(ctx,W,H,y0,color,rng,count,slant){
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=1;
    for(let i=0;i<count;i++){
      const x=rng()*W*1.1-W*0.05, y=y0+rng()*(H-y0), len=rng()*22+12;
      ctx.globalAlpha=rng()*0.4+0.15;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+slant*len, y+len); ctx.stroke();
    }
    ctx.restore();
  }

  function bamboo(ctx,x,baseY,h,color,rng){
    ctx.save(); ctx.strokeStyle=color; ctx.lineCap='round';
    const segs=Math.floor(h/26);
    ctx.lineWidth=3; ctx.beginPath();
    let yy=baseY;
    for(let s=0;s<segs;s++){
      const ny=yy-26;
      ctx.moveTo(x,yy); ctx.lineTo(x+(rng()-0.5)*3, ny);
      yy=ny;
    }
    ctx.stroke();
    // 竹叶
    ctx.fillStyle=color;
    for(let s=0;s<segs;s++){
      if(rng()<0.55){
        const ly=baseY - s*26 - rng()*20;
        for(let k=0;k<3;k++){
          const ang=-Math.PI/3 + rng()*Math.PI*0.9, ll=rng()*16+10;
          ctx.save(); ctx.translate(x,ly); ctx.rotate(ang); ctx.globalAlpha=0.8;
          ctx.beginPath(); ctx.ellipse(ll/2,0,ll/2,2.2,0,0,Math.PI*2); ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  function birds(ctx,x,y,scale,color,rng,n){
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=1.6; ctx.lineCap='round';
    for(let i=0;i<n;i++){
      const bx=x+(rng()-0.5)*120*scale, by=y+(rng()-0.5)*60*scale, w=(rng()*5+6)*scale;
      ctx.beginPath();
      ctx.moveTo(bx-w,by); ctx.quadraticCurveTo(bx,by-w*0.6,bx,by);
      ctx.quadraticCurveTo(bx,by-w*0.6,bx+w,by); ctx.stroke();
    }
    ctx.restore();
  }

  function pineTree(ctx,x,baseY,h,color){
    ctx.save();
    ctx.strokeStyle=color; ctx.lineWidth=2.4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x,baseY); ctx.quadraticCurveTo(x+6,baseY-h*0.6,x+2,baseY-h); ctx.stroke();
    ctx.fillStyle=color;
    for(let i=0;i<4;i++){
      const ly=baseY-h*(0.55+i*0.13), lw=h*(0.42-i*0.08);
      ctx.globalAlpha=0.85;
      ctx.beginPath();
      ctx.moveTo(x-lw,ly); ctx.lineTo(x+lw*0.3,ly-h*0.06); ctx.lineTo(x+lw,ly);
      ctx.lineTo(x+lw*0.2,ly+h*0.05); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /* ============ 扩展元素 ============ */
  // 瀑布：白练垂落 + 落潭雾气
  function waterfall(ctx,x,yTop,yBot,w,rng,tint){
    ctx.save();
    const g=ctx.createLinearGradient(x,yTop,x,yBot);
    g.addColorStop(0, tint||'rgba(255,255,255,.95)');
    g.addColorStop(1,'rgba(236,243,243,.62)');
    ctx.fillStyle=g; ctx.fillRect(x-w/2,yTop,w,yBot-yTop);
    ctx.strokeStyle='rgba(255,255,255,.92)'; ctx.lineCap='round';
    for(let i=0;i<34;i++){
      const xx=x-w/2+rng()*w;
      ctx.globalAlpha=rng()*0.5+0.18; ctx.lineWidth=rng()*1.6+0.4;
      ctx.beginPath(); ctx.moveTo(xx,yTop+rng()*24); ctx.lineTo(xx+(rng()-0.5)*5,yBot); ctx.stroke();
    }
    ctx.restore();
  }

  // 沙丘：多层平滑曲线
  function dunes(ctx,W,y0,yEnd,c1,c2,rng){
    const layers=4;
    for(let k=0;k<layers;k++){
      const baseY=lerp(y0,yEnd,k/layers);
      ctx.beginPath(); ctx.moveTo(0,yEnd+40);
      ctx.lineTo(0,baseY);
      const pts=6;
      for(let i=1;i<=pts;i++){
        const x=W*i/pts;
        const y=baseY + Math.sin(i*1.3+k*1.7)*16 + (rng()-0.5)*10;
        const px=W*(i-0.5)/pts, py=baseY+Math.sin((i-0.6)*1.3+k*1.7)*16;
        ctx.quadraticCurveTo(px,py,x,y);
      }
      ctx.lineTo(W,yEnd+40); ctx.closePath();
      ctx.fillStyle=mix(c1,c2,k/(layers-1),.97); ctx.fill();
    }
  }

  // 多层塔（宝塔 / 楼阁）
  function pagoda(ctx,x,baseY,levels,w0,lvH,color){
    ctx.save(); ctx.fillStyle=color;
    for(let i=0;i<levels;i++){
      const lw=w0*(1-i*0.12), ly=baseY-i*lvH;
      ctx.fillRect(x-lw/2, ly-lvH+6, lw, lvH-8);
      ctx.beginPath(); // 飞檐
      ctx.moveTo(x-lw/2-6,ly+2); ctx.lineTo(x+lw/2+6,ly+2);
      ctx.lineTo(x+lw/2-3,ly-6); ctx.lineTo(x-lw/2+3,ly-6); ctx.closePath(); ctx.fill();
    }
    const ty=baseY-levels*lvH;
    ctx.beginPath(); ctx.moveTo(x,ty-14); ctx.lineTo(x-5,ty+4); ctx.lineTo(x+5,ty+4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 亭（攒尖顶 + 立柱）
  function pavilion(ctx,x,baseY,w,h,color){
    ctx.save(); ctx.fillStyle=color; ctx.strokeStyle=color; ctx.lineWidth=2.4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x-2,baseY-h*0.45); ctx.lineTo(x-2,baseY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+w-2,baseY-h*0.45); ctx.lineTo(x+w-2,baseY); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x-w*0.35-2,baseY-h*0.45);
    ctx.quadraticCurveTo(x+w*0.5-2,baseY-h*0.62, x+w*0.5-2,baseY-h);
    ctx.quadraticCurveTo(x+w*0.5-2,baseY-h*0.62, x+w*1.35-2,baseY-h*0.45);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 拱桥
  function archBridge(ctx,cx,y,r,color){
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=2.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.arc(cx,y,r,Math.PI,0); ctx.stroke();
    ctx.lineWidth=2; ctx.beginPath();
    ctx.moveTo(cx-r-6,y+2); ctx.quadraticCurveTo(cx,y-r-8,cx+r+6,y+2); ctx.stroke();
    ctx.restore();
  }

  // 枫/红叶树：墨干 + 朱点叶冠
  function mapleTree(ctx,x,baseY,h,leaf,trunk,rng){
    ctx.save(); ctx.strokeStyle=trunk; ctx.lineWidth=2.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x,baseY); ctx.lineTo(x+(rng()-0.5)*8,baseY-h*0.62); ctx.stroke();
    for(let i=0;i<3;i++){ const a=-0.4+i*0.4; ctx.beginPath(); ctx.moveTo(x,baseY-h*0.5);
      ctx.lineTo(x+Math.cos(-Math.PI/2+a)*h*0.4, baseY-h*0.5+Math.sin(-Math.PI/2+a)*h*0.4); ctx.stroke(); }
    ctx.fillStyle=leaf;
    for(let i=0;i<46;i++){ const r=h*0.42*rng();
      const ang=rng()*Math.PI*2, px=x+Math.cos(ang)*r, py=baseY-h*0.72+Math.sin(ang)*r*0.8;
      ctx.globalAlpha=rng()*0.5+0.4; ctx.beginPath(); ctx.arc(px,py,rng()*3+1.4,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }

  // 帆船
  function sailBoat(ctx,x,y,s,hull,sail){
    ctx.save();
    ctx.strokeStyle=hull; ctx.lineWidth=2*s; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x-16*s,y); ctx.quadraticCurveTo(x,y+6*s,x+16*s,y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y-26*s); ctx.stroke();
    ctx.fillStyle=sail; ctx.globalAlpha=0.9;
    ctx.beginPath(); ctx.moveTo(x+2*s,y-2*s); ctx.lineTo(x+2*s,y-24*s); ctx.quadraticCurveTo(x+16*s,y-14*s,x+2*s,y-2*s); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 渔舟 + 蓑笠翁
  function fisherBoat(ctx,x,y,color){
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x-24,y); ctx.quadraticCurveTo(x,y+8,x+24,y); ctx.stroke();
    ctx.fillStyle=color; ctx.beginPath(); ctx.ellipse(x-4,y-10,6,5,0,0,Math.PI*2); ctx.fill(); // 斗笠
    ctx.beginPath(); ctx.moveTo(x-4,y-7); ctx.lineTo(x-4,y-1); ctx.stroke(); // 身
    ctx.beginPath(); ctx.moveTo(x-2,y-8); ctx.lineTo(x+22,y-22); ctx.stroke(); // 鱼竿
    ctx.restore();
  }

  // 蒙古包
  function yurt(ctx,x,baseY,r,color){
    ctx.save(); ctx.fillStyle=color;
    ctx.beginPath(); ctx.moveTo(x-r,baseY); ctx.lineTo(x-r,baseY-r*0.5);
    ctx.quadraticCurveTo(x,baseY-r*1.25,x+r,baseY-r*0.5); ctx.lineTo(x+r,baseY); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(40,34,28,.5)'; ctx.fillRect(x-r*0.18,baseY-r*0.42,r*0.36,r*0.42);
    ctx.restore();
  }

  // 骆驼剪影
  function camel(ctx,x,baseY,s,color){
    ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=2.2*s; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(x-10*s,baseY); ctx.lineTo(x-10*s,baseY-9*s);
    ctx.quadraticCurveTo(x-7*s,baseY-15*s,x-4*s,baseY-9*s);
    ctx.quadraticCurveTo(x,baseY-16*s,x+4*s,baseY-9*s);
    ctx.lineTo(x+8*s,baseY-9*s); ctx.lineTo(x+11*s,baseY-15*s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-8*s,baseY-9*s); ctx.lineTo(x-8*s,baseY);
    ctx.moveTo(x+6*s,baseY-9*s); ctx.lineTo(x+6*s,baseY); ctx.stroke();
    ctx.restore();
  }

  // 飘雪
  function snowFall(ctx,W,H,rng,n){
    ctx.save(); ctx.fillStyle='rgba(255,255,255,.9)';
    for(let i=0;i<n;i++){ ctx.globalAlpha=rng()*0.7+0.2;
      ctx.beginPath(); ctx.arc(rng()*W,rng()*H,rng()*2+0.6,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }

  // 卷云 / 留白晕染（比 mistBand 更聚拢的云团）
  function cloudPuff(ctx,x,y,w,h,color){
    const g=ctx.createRadialGradient(x,y,0,x,y,w);
    g.addColorStop(0,color); g.addColorStop(1,color.replace(/[\d.]+\)$/,'0)'));
    ctx.save(); ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(x,y,w,h,0,0,Math.PI*2); ctx.fill(); ctx.restore();
  }

  /* ============ 题款 / 印章 ============ */
  function title(ctx,W,H,text,ink){
    if(!LABELS) return H*0.10;
    ctx.save();
    ctx.fillStyle=ink; ctx.textAlign='center'; ctx.textBaseline='middle';
    const fs=Math.round(W*0.052);
    ctx.font=`900 ${fs}px "Songti SC","STSong","SimSun",serif`;
    const x=W-fs*0.95;
    let y=H*0.10;
    for(const ch of text){
      ctx.globalAlpha=0.9;
      ctx.fillText(ch,x,y); y+=fs*1.18;
    }
    ctx.restore();
    return y - fs*1.18 + fs*0.5; // 末字底部 y，供印章定位
  }

  function seal(ctx,W,H,text,sealColor,titleBottom){
    if(!LABELS) return;
    ctx.save();
    const s=Math.round(W*0.115);
    const x=W-s-W*0.045, y=(titleBottom!=null?titleBottom:H*0.42) + s*0.42;
    // 印底
    ctx.fillStyle=sealColor;
    const r=6;
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+s,y,x+s,y+s,r); ctx.arcTo(x+s,y+s,x,y+s,r);
    ctx.arcTo(x,y+s,x,y,r); ctx.arcTo(x,y,x+s,y,r); ctx.closePath(); ctx.fill();
    // 阳文白字
    ctx.fillStyle='rgba(245,238,224,.95)';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const fs=s*0.42;
    ctx.font=`900 ${fs}px "Songti SC","STSong","SimSun",serif`;
    if(text.length===2){
      ctx.fillText(text[0], x+s*0.5, y+s*0.30);
      ctx.fillText(text[1], x+s*0.5, y+s*0.72);
    }else{
      ctx.fillText(text, x+s*0.5, y+s*0.5);
    }
    ctx.restore();
  }

  /* ============ 六帧场景 ============ */
  // 通用：W,H 长卷比例
  const W=540, H=756;  // 离屏背景尺寸（柔化用）

  const SCENES = [
    {
      id:'huangshan', name:'黄山云海', seal:'黄山', poem:'绝壁松云接太虚',
      color:'石青', swatch:'#2B5F86', seed:10711,
      draw(ctx,rng){
        paper(ctx,W,H,'#e9efee','#8fb0bf',rng);
        // 远天
        const sky=ctx.createLinearGradient(0,0,0,H*0.5);
        sky.addColorStop(0,'#dfeaec'); sky.addColorStop(1,'#c3d6dc');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.5);
        // 层叠远峰（石青冷调，越远越淡）
        mountainBand(ctx,W,H*0.30,H*0.55, 70,0.62, mix('#2B5F86','#cfe0e6',.7,.5), mix('#2B5F86','#cfe0e6',.55,.6), rngOf(this.seed+1));
        mistBand(ctx,W,H*0.42,60,'rgba(245,250,250,.9)',rngOf(this.seed+9));
        mountainBand(ctx,W,H*0.40,H*0.66, 95,0.60, mix('#2B5F86','#9fc0cd',.35,.78), mix('#2B5F86','#6f9db8',.2,.85), rngOf(this.seed+2));
        mistBand(ctx,W,H*0.56,70,'rgba(248,251,251,.92)',rngOf(this.seed+8));
        // 近峰主体（深石青 + 皴擦）
        const near=mountainBand(ctx,W,H*0.52,H*0.92, 150,0.58,'#3c7a9e','#173a55',rngOf(this.seed+3));
        cunStrokes(ctx,W*0.05,H*0.56,W*0.95,H*0.9,'#102d44',rngOf(this.seed+4),420);
        // 奇松立于近峰肩
        pineTree(ctx,W*0.30,H*0.58,90,'#16364a');
        pineTree(ctx,W*0.70,H*0.60,70,'#16364a');
        // 翻涌云海铺于谷间
        mistBand(ctx,W,H*0.80,90,'rgba(255,255,255,.95)',rngOf(this.seed+5));
        mistBand(ctx,W,H*0.88,70,'rgba(240,247,247,.85)',rngOf(this.seed+6));
        const tb=title(ctx,W,H,this.name,'#143a52'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'lijiang', name:'桂林漓江', seal:'漓江', poem:'江作青罗带，山如碧玉簪',
      color:'天青', swatch:'#5E97AE', seed:20533,
      draw(ctx,rng){
        paper(ctx,W,H,'#e9f1ef','#7fb0bd',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.5);
        sky.addColorStop(0,'#e4eff0'); sky.addColorStop(1,'#cfe4e3');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.62);
        const horizon=H*0.62;
        // 群峰：喀斯特独峰——瘦削峰丛，[cx, 宽, 高, 进深t(越大越近越深)]
        const peaks=[
          [0.10,0.13,0.30,.30],[0.22,0.17,0.44,.55],[0.31,0.11,0.26,.32],
          [0.46,0.20,0.52,.78],[0.58,0.14,0.36,.50],[0.69,0.18,0.46,.68],
          [0.80,0.12,0.30,.40],[0.90,0.16,0.40,.60],[0.97,0.10,0.24,.34]
        ];
        // 远峰在后、近峰在前：按进深排序绘制
        peaks.slice().sort((a,b)=>a[3]-b[3]).forEach((p)=>{
          const cx=W*p[0], w=W*p[1], h=H*p[2], baseY=horizon, t=p[3];
          karst(ctx,cx,baseY,w,h, mix('#8fbac8','#cfe4e3',1-t,.92), mix('#5E97AE','#3f7080',t,.96), rgba('#2a4e58',.30));
        });
        // 主峰皴擦肌理
        cunStrokes(ctx,W*0.40,H*0.18,W*0.56,horizon,'#2f5a66',rngOf(this.seed+4),160);
        cunStrokes(ctx,W*0.63,H*0.24,W*0.76,horizon,'#356069',rngOf(this.seed+11),120);
        // 江面 + 群峰倒影
        water(ctx,W,horizon,H*0.96, mix('#bcd8da','#9cc3c6',.4,.95),'#6fa0a6',rngOf(this.seed+7));
        ctx.save(); ctx.globalAlpha=0.28; ctx.scale(1,-1); ctx.translate(0,-2*horizon);
        peaks.forEach((p)=>{
          karst(ctx,W*p[0],horizon,W*p[1],H*p[2]*0.7, rgba('#5E97AE',.5), rgba('#4d8497',.4), null);
        });
        ctx.restore();
        // 一叶渔舟
        ctx.save(); ctx.strokeStyle='#2c4f57'; ctx.lineWidth=2; ctx.lineCap='round';
        const by=H*0.72, bx=W*0.30;
        ctx.beginPath(); ctx.moveTo(bx-26,by); ctx.quadraticCurveTo(bx,by+8,bx+26,by); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx-4,by); ctx.lineTo(bx-4,by-22); ctx.stroke();
        ctx.restore();
        birds(ctx,W*0.7,H*0.18,1,'rgba(44,79,87,.7)',rngOf(this.seed+5),5);
        const tb=title(ctx,W,H,this.name,'#2c4f57'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'xihu', name:'西湖烟雨', seal:'西湖', poem:'山色空蒙雨亦奇',
      color:'月白', swatch:'#d7e2df', seed:30859,
      draw(ctx,rng){
        paper(ctx,W,H,'#eef2ef','#c7d2cf',rng);
        // 通体月白朦胧
        const sky=ctx.createLinearGradient(0,0,0,H);
        sky.addColorStop(0,'#f1f5f3'); sky.addColorStop(.6,'#e3eae7'); sky.addColorStop(1,'#d3ddda');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        const horizon=H*0.60;
        // 极淡远山（几乎隐入烟雨）
        mountainBand(ctx,W,H*0.40,horizon, 60,0.6, rgba('#9fb0ae',.32), rgba('#8a9d9b',.4), rngOf(this.seed+1));
        mistBand(ctx,W,H*0.48,90,'rgba(248,250,249,.96)',rngOf(this.seed+2));
        // 远岸雷峰塔剪影（隐于烟雨）
        ctx.save();
        ctx.fillStyle='rgba(120,132,128,.34)';
        const tx=W*0.72, tBase=horizon-8, tw=34, levels=5;
        for(let i=0;i<levels;i++){
          const lw=tw*(1-i*0.13), ly=tBase-i*26;
          ctx.fillRect(tx-lw/2, ly-22, lw, 20);
          ctx.beginPath(); // 飞檐
          ctx.moveTo(tx-lw/2-5,ly-2); ctx.lineTo(tx+lw/2+5,ly-2); ctx.lineTo(tx+lw/2-2,ly-8); ctx.lineTo(tx-lw/2+2,ly-8); ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.moveTo(tx,tBase-levels*26-22); ctx.lineTo(tx-4,tBase-levels*26-6); ctx.lineTo(tx+4,tBase-levels*26-6); ctx.closePath(); ctx.fill();
        ctx.restore();
        // 苏堤一痕、长桥卧波
        ctx.save();
        ctx.strokeStyle='rgba(82,96,94,.7)'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(0,horizon-6);
        ctx.bezierCurveTo(W*0.3,horizon-14,W*0.7,horizon-2,W,horizon-10); ctx.stroke();
        // 拱桥
        ctx.lineWidth=2.4; ctx.beginPath();
        ctx.arc(W*0.40,horizon-2,30,Math.PI,0); ctx.stroke();
        ctx.restore();
        // 湖面
        water(ctx,W,horizon,H*0.97, rgba('#dde6e3',.95), rgba('#bcccc8',.95), rngOf(this.seed+3));
        // 垂柳（近景，淡墨）
        function willow(x,baseY,h){
          ctx.save(); ctx.strokeStyle='rgba(66,84,76,.78)'; ctx.lineWidth=3.4; ctx.lineCap='round';
          ctx.beginPath(); ctx.moveTo(x,baseY); ctx.quadraticCurveTo(x-10,baseY-h*0.7,x-2,baseY-h); ctx.stroke();
          ctx.lineWidth=1.4;
          for(let i=0;i<26;i++){
            const sx=x-2+(rng()-0.5)*70, sy=baseY-h+rng()*16;
            ctx.globalAlpha=0.62;
            ctx.strokeStyle='rgba(74,98,86,.8)';
            ctx.beginPath(); ctx.moveTo(sx,sy);
            ctx.quadraticCurveTo(sx+ (rng()-0.5)*14, sy+h*0.45, sx+(rng()-0.5)*22, sy+h*0.78);
            ctx.stroke();
          }
          ctx.restore();
        }
        willow(W*0.14,H*0.68,180); willow(W*0.88,H*0.72,150);
        // 一叶轻舟横于湖心
        ctx.save(); ctx.strokeStyle='rgba(70,88,82,.72)'; ctx.lineWidth=2; ctx.lineCap='round';
        const bx=W*0.56, by=H*0.74;
        ctx.beginPath(); ctx.moveTo(bx-22,by); ctx.quadraticCurveTo(bx,by+7,bx+22,by); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx-2,by); ctx.lineTo(bx-2,by-16); ctx.stroke();
        ctx.restore();
        // 烟雨细丝
        rain(ctx,W,H,horizon-40,'rgba(160,175,172,.5)',rngOf(this.seed+6),130,0.18);
        // 雨雾再罩一层
        mistBand(ctx,W,H*0.66,80,'rgba(250,252,251,.55)',rngOf(this.seed+7));
        const tb=title(ctx,W,H,this.name,'#4a5c54'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'taishan', name:'泰山日出', seal:'泰山', poem:'会当凌绝顶，一览众山小',
      color:'朱砂红', swatch:'#C8423B', seed:40177,
      draw(ctx,rng){
        paper(ctx,W,H,'#f3e6d6','#e8a33d',rng);
        // 朝霞天幕：朱砂—暖金渐变
        const sky=ctx.createLinearGradient(0,0,0,H*0.6);
        sky.addColorStop(0,'#7a1f1a'); sky.addColorStop(.35,'#c8423b');
        sky.addColorStop(.7,'#e8853d'); sky.addColorStop(1,'#f2c14e');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.6);
        // 朝阳喷薄
        orb(ctx,W*0.5,H*0.46,46,'#fff3d6','rgba(255,224,150,.85)');
        // 霞光放射
        ctx.save(); ctx.translate(W*0.5,H*0.46); ctx.globalCompositeOperation='lighter';
        for(let i=0;i<18;i++){
          const a=(i/18)*Math.PI*2 + 0.2;
          ctx.strokeStyle='rgba(255,210,120,.10)'; ctx.lineWidth=rng()*10+4;
          ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*W, Math.sin(a)*W); ctx.stroke();
        }
        ctx.restore();
        // 云海被染成暖色
        mistBand(ctx,W,H*0.58,70,'rgba(255,224,170,.85)',rngOf(this.seed+5));
        mistBand(ctx,W,H*0.66,80,'rgba(248,206,150,.7)',rngOf(this.seed+6));
        // 群山剪影（深朱褐，逆光）
        mountainBand(ctx,W,H*0.50,H*0.72, 60,0.6, rgba('#7a2a1c',.55), rgba('#5a1d14',.7), rngOf(this.seed+1));
        const near=mountainBand(ctx,W,H*0.66,H*0.98, 130,0.56,'#5a201a','#2e120d',rngOf(this.seed+2));
        cunStrokes(ctx,W*0.05,H*0.7,W*0.95,H*0.96,'#1e0c08',rngOf(this.seed+3),360);
        // 登顶石阶/南天门小景剪影
        ctx.save(); ctx.fillStyle='#240e08';
        ctx.fillRect(W*0.46,H*0.70,W*0.08,H*0.05);
        ctx.fillRect(W*0.47,H*0.66,W*0.06,H*0.05);
        ctx.restore();
        const tb=title(ctx,W,H,this.name,'#f3d9a0'); seal(ctx,W,H,this.seal,'#7a1f1a',tb);
      }
    },
    {
      id:'dongting', name:'洞庭秋月', seal:'洞庭', poem:'洞庭秋月生湖心',
      color:'柿黄', swatch:'#E8A33D', seed:50261,
      draw(ctx,rng){
        // 夜色绢底（偏暖深）
        paper(ctx,W,H,'#26343b','#3a2e1a',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.58);
        sky.addColorStop(0,'#1b2a31'); sky.addColorStop(1,'#34464d');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.58);
        const horizon=H*0.58;
        // 一轮柿黄秋月
        orb(ctx,W*0.66,H*0.24,52,'#f2c14e','rgba(232,163,61,.7)');
        // 淡月晕
        mistBand(ctx,W,H*0.30,70,'rgba(242,193,78,.10)',rngOf(this.seed+8));
        // 远岸低山
        mountainBand(ctx,W,H*0.50,horizon, 38,0.6, rgba('#22343a',.9), rgba('#16242a',.95), rngOf(this.seed+1));
        // 湖面 + 月华倒影金带
        water(ctx,W,horizon,H*0.98, '#2a4d5c','#16242c',rngOf(this.seed+3));
        ctx.save(); ctx.globalCompositeOperation='lighter';
        for(let i=0;i<60;i++){
          const y=lerp(horizon+6,H*0.96,rng());
          const w=(1-(y-horizon)/(H-horizon))*W*0.22 + 12;
          ctx.globalAlpha=rng()*0.4+0.12;
          ctx.fillStyle='rgba(242,193,78,.9)';
          ctx.fillRect(W*0.66 - w/2, y, w, rng()*1.6+0.6);
        }
        ctx.restore();
        // 芦苇/孤舟
        ctx.save(); ctx.strokeStyle='rgba(214,190,140,.55)'; ctx.lineWidth=1.4; ctx.lineCap='round';
        for(let i=0;i<10;i++){
          const x=W*0.10+rng()*W*0.16, by=H*0.80+rng()*40;
          ctx.beginPath(); ctx.moveTo(x,by); ctx.quadraticCurveTo(x+6,by-50,x+2,by-90); ctx.stroke();
        }
        ctx.restore();
        ctx.save(); ctx.strokeStyle='rgba(222,200,150,.7)'; ctx.lineWidth=2; ctx.lineCap='round';
        const bx=W*0.42, by=H*0.78;
        ctx.beginPath(); ctx.moveTo(bx-24,by); ctx.quadraticCurveTo(bx,by+7,bx+24,by); ctx.stroke();
        ctx.restore();
        mistBand(ctx,W,H*0.60,40,'rgba(210,225,228,.10)',rngOf(this.seed+6));
        const tb=title(ctx,W,H,this.name,'#e8d6a8'); seal(ctx,W,H,this.seal,'#c0392b',tb);
      }
    },
    {
      id:'xiaoxiang', name:'潇湘夜雨', seal:'潇湘', poem:'夜雨潇湘冷入秋',
      color:'黛蓝', swatch:'#1E3A47', seed:60917,
      draw(ctx,rng){
        // 黛蓝冷夜
        paper(ctx,W,H,'#1b2d36','#0f1d24',rng);
        const sky=ctx.createLinearGradient(0,0,0,H);
        sky.addColorStop(0,'#13242c'); sky.addColorStop(.55,'#1e3a47'); sky.addColorStop(1,'#0d1a20');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        const horizon=H*0.64;
        // 远山隐于雨幕
        mountainBand(ctx,W,H*0.40,horizon, 70,0.6, rgba('#24414e',.7), rgba('#16303a',.85), rngOf(this.seed+1));
        mistBand(ctx,W,H*0.46,90,'rgba(120,150,160,.16)',rngOf(this.seed+2));
        const near=mountainBand(ctx,W,H*0.54,horizon+8, 50,0.58,'#1c3743','#102229',rngOf(this.seed+3));
        // 江面
        water(ctx,W,horizon,H*0.98, '#1a333d','#0c1b22',rngOf(this.seed+4));
        // 江畔孤亭 + 一点暖灯（柿黄点醒，作辅色呼应）
        ctx.save();
        const px=W*0.22, py=horizon-2;
        ctx.fillStyle='#0c1820';
        ctx.fillRect(px-2,py-44,4,44); ctx.fillRect(px+34,py-44,4,44);
        ctx.beginPath(); ctx.moveTo(px-14,py-44); ctx.lineTo(px+18,py-62); ctx.lineTo(px+50,py-44); ctx.closePath(); ctx.fill();
        // 灯火
        orb(ctx,px+18,py-30,5,'#ffdc8a','rgba(232,163,61,.5)');
        ctx.restore();
        // 倒影灯影
        ctx.save(); ctx.globalCompositeOperation='lighter';
        for(let i=0;i<18;i++){ const y=lerp(horizon+4,H*0.84,rng());
          ctx.globalAlpha=rng()*0.3+0.06; ctx.fillStyle='rgba(232,163,61,.8)';
          ctx.fillRect(W*0.22+18-6, y, 12, rng()*1.4+0.5); }
        ctx.restore();
        // 临江丛竹
        bamboo(ctx,W*0.80,H*0.92,260,'rgba(40,70,70,.8)',rngOf(this.seed+9));
        bamboo(ctx,W*0.88,H*0.94,210,'rgba(30,55,58,.7)',rngOf(this.seed+10));
        // 斜密夜雨
        rain(ctx,W,H,0,'rgba(180,200,210,.45)',rngOf(this.seed+7),260,0.32);
        rain(ctx,W,H,0,'rgba(210,225,232,.35)',rngOf(this.seed+8),120,0.30);
        const tb=title(ctx,W,H,this.name,'#bcd0d8'); seal(ctx,W,H,this.seal,'#c0392b',tb);
      }
    },
    {
      id:'lushan', name:'庐山飞瀑', seal:'庐山', poem:'飞流直下三千尺',
      color:'青绿', swatch:'#2f7d5f', seed:70123,
      draw(ctx,rng){
        paper(ctx,W,H,'#e7efe8','#3f8f6a',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.5); sky.addColorStop(0,'#dcebe2'); sky.addColorStop(1,'#bcd9c7');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.6);
        mountainBand(ctx,W,H*0.16,H*0.6, 90,0.58, mix('#2f7d5f','#bcd9c7',.45,.9), mix('#2f7d5f','#1d5740',.3,.95), rngOf(this.seed+1));
        ctx.fillStyle='#1f5a42';
        ctx.beginPath(); ctx.moveTo(0,H*0.22); ctx.lineTo(W*0.40,H*0.30); ctx.lineTo(W*0.43,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(W,H*0.18); ctx.lineTo(W*0.60,H*0.27); ctx.lineTo(W*0.57,H); ctx.lineTo(W,H); ctx.closePath(); ctx.fill();
        cunStrokes(ctx,0,H*0.32,W*0.42,H*0.95,'#103a2b',rngOf(this.seed+2),260);
        cunStrokes(ctx,W*0.58,H*0.32,W,H*0.95,'#103a2b',rngOf(this.seed+3),260);
        waterfall(ctx,W*0.5,H*0.28,H*0.84,W*0.12,rngOf(this.seed+4));
        mistBand(ctx,W,H*0.84,70,'rgba(255,255,255,.95)',rngOf(this.seed+5));
        water(ctx,W,H*0.88,H*0.98,'rgba(150,196,176,.92)','#3f7d68',rngOf(this.seed+6));
        pineTree(ctx,W*0.30,H*0.52,70,'#123f2d'); pineTree(ctx,W*0.71,H*0.5,58,'#123f2d');
        const tb=title(ctx,W,H,this.name,'#16513a'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'sanxia', name:'巫峡云雨', seal:'三峡', poem:'朝辞白帝彩云间',
      color:'黛青', swatch:'#355c63', seed:80231,
      draw(ctx,rng){
        paper(ctx,W,H,'#e6edee','#3a6b73',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.6); sky.addColorStop(0,'#dde9ea'); sky.addColorStop(1,'#c2d6d8');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        mountainBand(ctx,W,H*0.28,H*0.55, 70,0.6, rgba('#7ba1a6',.6), rgba('#4e7c83',.72), rngOf(this.seed+1));
        mistBand(ctx,W,H*0.40,90,'rgba(244,249,249,.92)',rngOf(this.seed+2));
        ctx.fillStyle='#2c5258';
        ctx.beginPath(); ctx.moveTo(0,H*0.16); ctx.lineTo(W*0.34,H*0.44); ctx.lineTo(W*0.30,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(W,H*0.12); ctx.lineTo(W*0.66,H*0.42); ctx.lineTo(W*0.70,H); ctx.lineTo(W,H); ctx.closePath(); ctx.fill();
        cunStrokes(ctx,0,H*0.2,W*0.32,H,'#16363b',rngOf(this.seed+3),230);
        cunStrokes(ctx,W*0.66,H*0.2,W,H,'#16363b',rngOf(this.seed+4),230);
        water(ctx,W,H*0.6,H*0.98,'#6f9ba1','#345257',rngOf(this.seed+5));
        sailBoat(ctx,W*0.5,H*0.72,1,'#1e3d42','#e3edee');
        mistBand(ctx,W,H*0.56,70,'rgba(240,248,248,.65)',rngOf(this.seed+6));
        birds(ctx,W*0.42,H*0.2,1,'rgba(30,60,66,.6)',rngOf(this.seed+7),4);
        const tb=title(ctx,W,H,this.name,'#1e4248'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'huashan', name:'华山天险', seal:'华山', poem:'只有天在上，更无山与齐',
      color:'苍黛', swatch:'#495a68', seed:90337,
      draw(ctx,rng){
        paper(ctx,W,H,'#e9ecef','#46566a',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.6); sky.addColorStop(0,'#e3e8ec'); sky.addColorStop(1,'#c5cdd6');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.7);
        function sharp(cx,baseY,w,h,fill){ ctx.fillStyle=fill; ctx.beginPath();
          ctx.moveTo(cx-w/2,baseY); ctx.lineTo(cx-w*0.08,baseY-h); ctx.lineTo(cx+w*0.16,baseY-h*0.8); ctx.lineTo(cx+w/2,baseY); ctx.closePath(); ctx.fill(); }
        mistBand(ctx,W,H*0.5,80,'rgba(246,249,251,.9)',rngOf(this.seed+5));
        sharp(W*0.22,H*0.66,W*0.34,H*0.42,rgba('#6f7f8d',.8));
        sharp(W*0.78,H*0.66,W*0.34,H*0.40,rgba('#6f7f8d',.8));
        sharp(W*0.5,H*0.78,W*0.5,H*0.62,'#3a4754');
        cunStrokes(ctx,W*0.30,H*0.2,W*0.70,H*0.78,'#212b34',rngOf(this.seed+2),320);
        pineTree(ctx,W*0.5,H*0.2,46,'#1c2730');
        ctx.save(); ctx.strokeStyle='rgba(40,52,62,.6)'; ctx.lineWidth=1.4; ctx.setLineDash([5,4]);
        ctx.beginPath(); ctx.moveTo(W*0.5,H*0.2); ctx.lineTo(W*0.42,H*0.5); ctx.lineTo(W*0.5,H*0.78); ctx.stroke(); ctx.restore();
        mistBand(ctx,W,H*0.82,70,'rgba(244,248,250,.85)',rngOf(this.seed+6));
        const tb=title(ctx,W,H,this.name,'#2a3540'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'wuling', name:'武陵峰林', seal:'武陵', poem:'三千奇峰立翠微',
      color:'黛绿', swatch:'#2c4f3b', seed:100447,
      draw(ctx,rng){
        paper(ctx,W,H,'#e6ede7','#356b4c',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.5); sky.addColorStop(0,'#dde9e1'); sky.addColorStop(1,'#c3d8ca');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        // 锥状峰柱：底宽顶收、顶圆，仿石英砂岩柱
        function spire(cx,baseY,w,h,fill,line){
          ctx.beginPath();
          ctx.moveTo(cx-w/2,baseY);
          ctx.quadraticCurveTo(cx-w*0.42,baseY-h*0.7, cx-w*0.12,baseY-h);
          ctx.quadraticCurveTo(cx,baseY-h*1.04, cx+w*0.12,baseY-h);
          ctx.quadraticCurveTo(cx+w*0.42,baseY-h*0.7, cx+w/2,baseY);
          ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
          if(line){ ctx.strokeStyle=line; ctx.lineWidth=1; ctx.stroke(); }
        }
        const cols=[[0.10,0.08,0.50,.3],[0.20,0.11,0.66,.55],[0.30,0.07,0.42,.34],[0.42,0.13,0.80,.85],
                    [0.54,0.08,0.54,.5],[0.64,0.11,0.70,.72],[0.75,0.07,0.46,.38],[0.86,0.10,0.60,.62],[0.95,0.06,0.40,.32]];
        cols.slice().sort((a,b)=>a[3]-b[3]).forEach(p=>{
          const deep=p[3]>0.5;
          const fill=deep?mix('#2c4f3b','#173524',p[3],.96):mix('#86ab90','#cfe0d5',1-p[3],.9);
          spire(W*p[0],H*0.86,W*p[1],H*p[2],fill, deep?'rgba(16,40,28,.35)':null);
          if(deep){ ctx.save(); ctx.strokeStyle='rgba(16,40,28,.22)'; ctx.lineWidth=1;
            for(let s=0;s<5;s++){ const x=W*p[0]+(rng()-0.5)*W*p[1]*0.6; ctx.globalAlpha=rng()*0.3+0.1;
              ctx.beginPath(); ctx.moveTo(x,H*0.86-H*p[2]*0.72); ctx.lineTo(x,H*0.84); ctx.stroke(); } ctx.restore(); }
        });
        pineTree(ctx,W*0.42,H*0.06+0,30,'#123020');
        // 羽化云海漫涌于峰腰，藏住柱脚
        for(let i=0;i<7;i++){ cloudPuff(ctx,W*(0.08+i*0.14),H*(0.6+(i%2)*0.035),140,46,'rgba(250,253,251,.92)'); }
        for(let i=0;i<6;i++){ cloudPuff(ctx,W*(0.14+i*0.15),H*0.72,160,40,'rgba(246,251,248,.86)'); }
        for(let i=0;i<5;i++){ cloudPuff(ctx,W*(0.2+i*0.16),H*0.82,170,36,'rgba(248,252,250,.8)'); }
        const tb=title(ctx,W,H,this.name,'#16402b'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'damo', name:'大漠孤烟', seal:'大漠', poem:'大漠孤烟直，长河落日圆',
      color:'沙黄', swatch:'#d9a441', seed:110557,
      draw(ctx,rng){
        paper(ctx,W,H,'#f0e6cc','#caa24a',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.5); sky.addColorStop(0,'#f3e7c6'); sky.addColorStop(1,'#f0cd86');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.5);
        orb(ctx,W*0.66,H*0.34,54,'#fff0c2','rgba(245,196,110,.7)');
        dunes(ctx,W,H*0.46,H,'#eccd7e','#a8762b',rngOf(this.seed+1));
        // 烽火台 + 孤烟
        ctx.fillStyle='#8a5e28'; ctx.fillRect(W*0.24,H*0.5,W*0.05,H*0.1);
        ctx.save(); ctx.strokeStyle='rgba(90,70,50,.5)'; ctx.lineWidth=4; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(W*0.265,H*0.5);
        ctx.bezierCurveTo(W*0.27,H*0.36,W*0.255,H*0.28,W*0.272,H*0.18); ctx.stroke(); ctx.restore();
        camel(ctx,W*0.52,H*0.74,2.4,'#6e4a1e'); camel(ctx,W*0.6,H*0.76,2.0,'#6e4a1e'); camel(ctx,W*0.66,H*0.775,1.7,'#6e4a1e');
        const tb=title(ctx,W,H,this.name,'#7a521f'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'jiangxue', name:'江雪独钓', seal:'江雪', poem:'孤舟蓑笠翁，独钓寒江雪',
      color:'素白', swatch:'#dfe7ea', seed:120667,
      draw(ctx,rng){
        paper(ctx,W,H,'#eef3f4','#aebfc6',rng);
        const sky=ctx.createLinearGradient(0,0,0,H); sky.addColorStop(0,'#f3f6f7'); sky.addColorStop(.6,'#e7eef0'); sky.addColorStop(1,'#dde6e9');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        mountainBand(ctx,W,H*0.34,H*0.56, 70,0.6, rgba('#cdd8dd',.9), rgba('#aebbc2',.95), rngOf(this.seed+1));
        // 雪峰留白顶
        ctx.save(); ctx.globalCompositeOperation='lighter';
        mistBand(ctx,W,H*0.4,50,'rgba(255,255,255,.7)',rngOf(this.seed+8)); ctx.restore();
        const horizon=H*0.6;
        water(ctx,W,horizon,H*0.98,'rgba(214,226,230,.95)','#9fb2ba',rngOf(this.seed+3));
        // 枯树
        ctx.save(); ctx.strokeStyle='rgba(70,82,88,.7)'; ctx.lineWidth=2; ctx.lineCap='round';
        for(let t=0;t<2;t++){ const bx=W*(0.14+t*0.74), by=horizon-4;
          ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx,by-70); ctx.stroke();
          for(let b=0;b<5;b++){ const yy=by-30-b*9; ctx.beginPath(); ctx.moveTo(bx,yy);
            ctx.lineTo(bx+(rng()<.5?-1:1)*(rng()*26+8),yy-(rng()*16+6)); ctx.stroke(); } }
        ctx.restore();
        fisherBoat(ctx,W*0.46,H*0.74,'rgba(64,76,82,.85)');
        snowFall(ctx,W,H,rngOf(this.seed+6),150);
        const tb=title(ctx,W,H,this.name,'#4a5c64'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'fengqiao', name:'枫桥夜泊', seal:'枫桥', poem:'江枫渔火对愁眠',
      color:'绀紫', swatch:'#3b3a5a', seed:130777,
      draw(ctx,rng){
        paper(ctx,W,H,'#272640','#15142a',rng);
        const sky=ctx.createLinearGradient(0,0,0,H); sky.addColorStop(0,'#1b1a33'); sky.addColorStop(.55,'#3b3a5a'); sky.addColorStop(1,'#222138');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        const horizon=H*0.62;
        orb(ctx,W*0.24,H*0.2,30,'#e8ecf5','rgba(170,180,210,.5)');
        mountainBand(ctx,W,H*0.42,horizon, 50,0.6, rgba('#2c2b48',.85), rgba('#1c1b32',.95), rngOf(this.seed+1));
        // 寒山寺塔
        pagoda(ctx,W*0.74,horizon-4,5,46,30,'#14132a');
        // 枫树
        mapleTree(ctx,W*0.16,horizon+6,150,'rgba(196,72,58,.85)','#241f2e',rngOf(this.seed+2));
        water(ctx,W,horizon,H*0.98,'#262544','#12111f',rngOf(this.seed+3));
        archBridge(ctx,W*0.5,horizon+6,40,'#14132a');
        // 渔火
        ctx.save(); ctx.globalCompositeOperation='lighter';
        [[0.42,0.72],[0.55,0.78],[0.62,0.7]].forEach(p=> orb(ctx,W*p[0],H*p[1],4,'#ffce7a','rgba(232,150,50,.5)'));
        for(let i=0;i<16;i++){ const y=lerp(horizon+6,H*0.86,rng());
          ctx.globalAlpha=rng()*0.3+0.08; ctx.fillStyle='rgba(232,163,61,.8)'; ctx.fillRect(W*0.42-4,y,8,rng()*1.4+0.5);} ctx.restore();
        mistBand(ctx,W,H*0.5,50,'rgba(150,150,180,.12)',rngOf(this.seed+5));
        const tb=title(ctx,W,H,this.name,'#cfd0e2'); seal(ctx,W,H,this.seal,'#c0392b',tb);
      }
    },
    {
      id:'shuanglin', name:'霜林秋色', seal:'秋山', poem:'霜叶红于二月花',
      color:'枫丹', swatch:'#c75b34', seed:140887,
      draw(ctx,rng){
        paper(ctx,W,H,'#f1e3cf','#c0612f',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.5); sky.addColorStop(0,'#f4e7cc'); sky.addColorStop(1,'#ecd2a8');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.6);
        mountainBand(ctx,W,H*0.24,H*0.56, 80,0.58, mix('#d98b50','#ecd2a8',.4,.85), mix('#b5602e','#8a4420',.3,.92), rngOf(this.seed+1));
        mistBand(ctx,W,H*0.42,70,'rgba(250,240,222,.8)',rngOf(this.seed+5));
        const near=mountainBand(ctx,W,H*0.5,H*0.98, 120,0.56,'#a85429','#5e2c14',rngOf(this.seed+2));
        cunStrokes(ctx,W*0.05,H*0.56,W*0.95,H*0.95,'#4a2010',rngOf(this.seed+3),300);
        // 红叶林
        for(let i=0;i<7;i++){ const x=W*(0.1+i*0.13)+ (rng()-0.5)*30, by=H*(0.6+rng()*0.22);
          mapleTree(ctx,x,by, 80+rng()*40, 'rgba('+(190+rng()*40|0)+',70,40,.85)','#3a1d10',rngOf(this.seed+10+i)); }
        // 山径
        ctx.save(); ctx.strokeStyle='rgba(240,228,206,.6)'; ctx.lineWidth=8; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(W*0.5,H); ctx.quadraticCurveTo(W*0.42,H*0.78,W*0.6,H*0.62); ctx.stroke(); ctx.restore();
        const tb=title(ctx,W,H,this.name,'#6e3318'); seal(ctx,W,H,this.seal,'#7a1f1a',tb);
      }
    },
    {
      id:'shuixiang', name:'江南水乡', seal:'水乡', poem:'小桥流水人家',
      color:'黛瓦', swatch:'#34424b', seed:150997,
      draw(ctx,rng){
        paper(ctx,W,H,'#eef0ed','#4a5560',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.5); sky.addColorStop(0,'#eef1f0'); sky.addColorStop(1,'#dde3e2');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        const horizon=H*0.58;
        function house(x,baseY,w,h){ ctx.fillStyle='#eef0ec'; ctx.fillRect(x,baseY-h,w,h);
          ctx.fillStyle='#34424b'; ctx.beginPath();
          ctx.moveTo(x-5,baseY-h); ctx.lineTo(x+w+5,baseY-h); ctx.lineTo(x+w-3,baseY-h-13); ctx.lineTo(x+3,baseY-h-13); ctx.closePath(); ctx.fill();
          ctx.fillStyle='rgba(40,52,62,.5)'; ctx.fillRect(x+w*0.3,baseY-h*0.6,w*0.18,h*0.4); }
        mistBand(ctx,W,H*0.34,70,'rgba(248,250,249,.85)',rngOf(this.seed+5));
        let x=W*0.06; for(let i=0;i<6;i++){ const w=W*(0.1+rng()*0.05), h=H*(0.14+rng()*0.08); house(x,horizon-2,w,h); x+=w+W*0.02; }
        // 倒影 + 河面
        water(ctx,W,horizon,H*0.98,'rgba(206,216,216,.95)','#9fb0b2',rngOf(this.seed+3));
        ctx.save(); ctx.globalAlpha=0.18; ctx.scale(1,-1); ctx.translate(0,-2*horizon);
        let rx=W*0.06; for(let i=0;i<6;i++){ const w=W*0.12; ctx.fillStyle='#5a6b72'; ctx.fillRect(rx,horizon-H*0.16,w,H*0.16); rx+=w+W*0.02; } ctx.restore();
        archBridge(ctx,W*0.72,horizon+10,46,'#2c3942');
        // 乌篷船
        ctx.save(); ctx.fillStyle='#2c3942'; ctx.strokeStyle='#2c3942'; ctx.lineWidth=2;
        const bx=W*0.34, by=H*0.74; ctx.beginPath(); ctx.moveTo(bx-26,by); ctx.quadraticCurveTo(bx,by+8,bx+26,by); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx,by-4,9,Math.PI,0); ctx.fill(); ctx.restore();
        const tb=title(ctx,W,H,this.name,'#2c3942'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'fuchun', name:'富春山居', seal:'富春', poem:'山居图里水云閒',
      color:'浅绛', swatch:'#b5764f', seed:161103,
      draw(ctx,rng){
        paper(ctx,W,H,'#efe6d4','#b9824f',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.5); sky.addColorStop(0,'#f2ead9'); sky.addColorStop(1,'#e6d5ba');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        mountainBand(ctx,W,H*0.26,H*0.5, 70,0.6, mix('#cda577','#e6d5ba',.4,.85), mix('#b5764f','#9c6038',.3,.9), rngOf(this.seed+1));
        mistBand(ctx,W,H*0.4,70,'rgba(244,236,222,.8)',rngOf(this.seed+5));
        mountainBand(ctx,W,H*0.44,H*0.7, 100,0.58, '#b97f4e','#7c4e29', rngOf(this.seed+2));
        cunStrokes(ctx,W*0.05,H*0.46,W*0.95,H*0.7,'#5c361a',rngOf(this.seed+3),240);
        const horizon=H*0.7;
        water(ctx,W,horizon,H*0.98,'rgba(220,206,184,.95)','#bda57f',rngOf(this.seed+4));
        // 茅屋 + 疏树
        ctx.save(); ctx.fillStyle='#6e4422';
        ctx.beginPath(); ctx.moveTo(W*0.2,horizon); ctx.lineTo(W*0.2,horizon-30); ctx.lineTo(W*0.28,horizon-30); ctx.lineTo(W*0.28,horizon); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(W*0.18,horizon-30); ctx.lineTo(W*0.3,horizon-30); ctx.lineTo(W*0.24,horizon-46); ctx.closePath(); ctx.fill(); ctx.restore();
        pineTree(ctx,W*0.34,horizon,60,'#5c361a'); pineTree(ctx,W*0.4,horizon+6,46,'#5c361a');
        sailBoat(ctx,W*0.7,horizon+30,1,'#6e4422','#efe6d4');
        const tb=title(ctx,W,H,this.name,'#5c361a'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'zhongnan', name:'终南积雪', seal:'终南', poem:'终南阴岭秀，积雪浮云端',
      color:'雪青', swatch:'#aac0d4', seed:171213,
      draw(ctx,rng){
        paper(ctx,W,H,'#eef2f6','#9fb6cc',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.6); sky.addColorStop(0,'#e9eff5'); sky.addColorStop(1,'#cdd9e6');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.7);
        orb(ctx,W*0.7,H*0.18,34,'rgba(255,252,244,.9)','rgba(230,224,210,.4)');
        mountainBand(ctx,W,H*0.3,H*0.56, 90,0.58, rgba('#cdd9e6',.9), rgba('#a9bccf',.95), rngOf(this.seed+1));
        const near=mountainBand(ctx,W,H*0.46,H*0.98, 150,0.56,'#bcccdb','#7e98b0',rngOf(this.seed+2));
        // 雪线阴影皴
        cunStrokes(ctx,W*0.05,H*0.5,W*0.95,H*0.92,'rgba(90,116,142,.5)',rngOf(this.seed+3),260);
        // 雪峰留白
        ctx.save(); ctx.globalCompositeOperation='lighter';
        mistBand(ctx,W,H*0.5,60,'rgba(255,255,255,.55)',rngOf(this.seed+7)); ctx.restore();
        pineTree(ctx,W*0.26,H*0.66,70,'#5e7588'); pineTree(ctx,W*0.74,H*0.7,56,'#5e7588');
        snowFall(ctx,W,H,rngOf(this.seed+6),90);
        const tb=title(ctx,W,H,this.name,'#46627c'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'chile', name:'敕勒草原', seal:'敕勒', poem:'风吹草低见牛羊',
      color:'草青', swatch:'#8a9a3c', seed:181321,
      draw(ctx,rng){
        paper(ctx,W,H,'#eef0db','#8f9a3e',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.6); sky.addColorStop(0,'#bcd6e6'); sky.addColorStop(1,'#dfe9e0');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.62);
        cloudPuff(ctx,W*0.3,H*0.2,170,60,'rgba(255,255,255,.85)');
        cloudPuff(ctx,W*0.68,H*0.3,200,70,'rgba(255,255,255,.8)');
        cloudPuff(ctx,W*0.5,H*0.12,140,46,'rgba(255,255,255,.7)');
        mountainBand(ctx,W,H*0.5,H*0.62, 30,0.6, rgba('#9cb27a',.7), rgba('#7f9a5a',.8), rngOf(this.seed+1));
        // 草原
        const g=ctx.createLinearGradient(0,H*0.6,0,H); g.addColorStop(0,'#9aab48'); g.addColorStop(1,'#6f8233');
        ctx.fillStyle=g; ctx.fillRect(0,H*0.6,W,H*0.4);
        // 草纹
        ctx.save(); ctx.strokeStyle='rgba(60,80,30,.3)'; ctx.lineWidth=1;
        for(let i=0;i<160;i++){ const x=rng()*W, y=H*0.62+rng()*H*0.36; ctx.globalAlpha=rng()*0.4+0.1;
          ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+(rng()-0.5)*4,y-rng()*10-4); ctx.stroke(); } ctx.restore();
        yurt(ctx,W*0.3,H*0.74,30,'#e8ead8'); yurt(ctx,W*0.4,H*0.76,22,'#e0e2cf');
        // 羊群
        ctx.fillStyle='rgba(245,246,236,.9)';
        for(let i=0;i<10;i++){ ctx.beginPath(); ctx.ellipse(W*(0.55+rng()*0.3),H*(0.78+rng()*0.12),5,3.4,0,0,Math.PI*2); ctx.fill(); }
        const tb=title(ctx,W,H,this.name,'#4c5a22'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'hukou', name:'壶口黄河', seal:'壶口', poem:'黄河之水天上来',
      color:'土金', swatch:'#c2812b', seed:191433,
      draw(ctx,rng){
        paper(ctx,W,H,'#efe1c4','#b87f2a',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.4); sky.addColorStop(0,'#efe2c2'); sky.addColorStop(1,'#e4c98c');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.4);
        // 两岸赭崖
        ctx.fillStyle='#8a5a23';
        ctx.fillRect(0,H*0.32,W*0.22,H); ctx.fillRect(W*0.78,H*0.32,W*0.22,H);
        cunStrokes(ctx,0,H*0.34,W*0.22,H,'#5e3c14',rngOf(this.seed+1),180);
        cunStrokes(ctx,W*0.78,H*0.34,W,H,'#5e3c14',rngOf(this.seed+2),180);
        // 黄河奔流（上游窄）
        const g=ctx.createLinearGradient(0,H*0.32,0,H*0.6); g.addColorStop(0,'#e8c878'); g.addColorStop(1,'#c2862f');
        ctx.fillStyle=g; ctx.fillRect(W*0.22,H*0.32,W*0.56,H*0.3);
        // 壶口跌瀑
        waterfall(ctx,W*0.5,H*0.58,H*0.86,W*0.5,rngOf(this.seed+3),'rgba(236,200,120,.95)');
        // 翻涌水雾
        mistBand(ctx,W,H*0.86,90,'rgba(244,228,190,.9)',rngOf(this.seed+4));
        water(ctx,W,H*0.9,H*0.99,'#cba055','#9c6f24',rngOf(this.seed+5));
        const tb=title(ctx,W,H,this.name,'#6e4715'); seal(ctx,W,H,this.seal,'#7a1f1a',tb);
      }
    },
    {
      id:'shudao', name:'蜀道剑门', seal:'剑门', poem:'蜀道之难，难于上青天',
      color:'苍绛', swatch:'#7a4a3a', seed:201541,
      draw(ctx,rng){
        paper(ctx,W,H,'#ece2d6','#7c4d3c',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.5); sky.addColorStop(0,'#e8ddcd'); sky.addColorStop(1,'#d3c2ac');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        mistBand(ctx,W,H*0.34,80,'rgba(244,238,228,.9)',rngOf(this.seed+5));
        // 层叠险峰
        mountainBand(ctx,W,H*0.2,H*0.5, 110,0.6, rgba('#a07c66',.8), rgba('#7a4a3a',.9), rngOf(this.seed+1));
        mistBand(ctx,W,H*0.5,70,'rgba(244,238,228,.82)',rngOf(this.seed+6));
        ctx.fillStyle='#5e3829';
        ctx.beginPath(); ctx.moveTo(W*0.1,H); ctx.lineTo(W*0.2,H*0.4); ctx.lineTo(W*0.34,H*0.56); ctx.lineTo(W*0.4,H); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(W*0.6,H); ctx.lineTo(W*0.72,H*0.36); ctx.lineTo(W*0.86,H*0.54); ctx.lineTo(W*0.94,H); ctx.closePath(); ctx.fill();
        cunStrokes(ctx,W*0.1,H*0.42,W*0.42,H,'#3a2014',rngOf(this.seed+2),220);
        cunStrokes(ctx,W*0.6,H*0.38,W*0.94,H,'#3a2014',rngOf(this.seed+3),220);
        // 栈道
        ctx.save(); ctx.strokeStyle='rgba(60,32,20,.8)'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(W*0.34,H*0.66); ctx.lineTo(W*0.6,H*0.62); ctx.stroke();
        for(let i=0;i<8;i++){ const t=i/7, x=lerp(W*0.34,W*0.6,t), y=lerp(H*0.66,H*0.62,t);
          ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+12); ctx.stroke(); } ctx.restore();
        pineTree(ctx,W*0.5,H*0.5,40,'#2e1810');
        const tb=title(ctx,W,H,this.name,'#4a2616'); seal(ctx,W,H,this.seal,'#7a1f1a',tb);
      }
    },
    {
      id:'chibi', name:'赤壁怀古', seal:'赤壁', poem:'大江东去，浪淘尽',
      color:'绛赤', swatch:'#6e2a24', seed:211653,
      draw(ctx,rng){
        paper(ctx,W,H,'#2c1714','#160a08',rng);
        const sky=ctx.createLinearGradient(0,0,0,H); sky.addColorStop(0,'#1e0f0c'); sky.addColorStop(.5,'#3a1712'); sky.addColorStop(1,'#160a08');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        orb(ctx,W*0.7,H*0.2,40,'#f0e0b8','rgba(210,150,80,.4)');
        const horizon=H*0.66;
        // 赤壁巨崖
        ctx.fillStyle='#5a221c';
        ctx.beginPath(); ctx.moveTo(0,H*0.16); ctx.lineTo(W*0.46,H*0.3); ctx.lineTo(W*0.46,horizon); ctx.lineTo(0,horizon); ctx.closePath(); ctx.fill();
        cunStrokes(ctx,0,H*0.2,W*0.46,horizon,'#2e110d',rngOf(this.seed+1),300);
        // 江
        water(ctx,W,horizon,H*0.98,'#3a201c','#180c0a',rngOf(this.seed+2));
        // 月影 + 泛舟
        ctx.save(); ctx.globalCompositeOperation='lighter';
        for(let i=0;i<40;i++){ const y=lerp(horizon+4,H*0.92,rng()); const w=(1-(y-horizon)/(H-horizon))*W*0.18+10;
          ctx.globalAlpha=rng()*0.3+0.06; ctx.fillStyle='rgba(232,200,140,.8)'; ctx.fillRect(W*0.7-w/2,y,w,rng()*1.4+0.5);} ctx.restore();
        sailBoat(ctx,W*0.6,H*0.78,1.1,'#e0c9a0','#b08a52');
        mistBand(ctx,W,H*0.62,60,'rgba(200,150,100,.12)',rngOf(this.seed+4));
        const tb=title(ctx,W,H,this.name,'#e0b483'); seal(ctx,W,H,this.seal,'#c0392b',tb);
      }
    },
    {
      id:'cangshan', name:'苍山洱海', seal:'洱海', poem:'苍山雪，洱海月',
      color:'湖蓝', swatch:'#2e8b9e', seed:221767,
      draw(ctx,rng){
        paper(ctx,W,H,'#e7f0f0','#2f8a9d',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.5); sky.addColorStop(0,'#dceef0'); sky.addColorStop(1,'#bfe0e2');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        // 苍山雪岭
        const r=mountainBand(ctx,W,H*0.28,H*0.56, 90,0.56, mix('#7fb6c0','#bfe0e2',.4,.9), mix('#2e8b9e','#1f6f80',.3,.95), rngOf(this.seed+1));
        // 雪顶留白
        ctx.save(); ctx.globalCompositeOperation='lighter';
        mistBand(ctx,W,H*0.3,40,'rgba(255,255,255,.6)',rngOf(this.seed+7)); ctx.restore();
        // 玉带云
        mistBand(ctx,W,H*0.44,46,'rgba(252,255,255,.95)',rngOf(this.seed+2));
        const horizon=H*0.56;
        water(ctx,W,horizon,H*0.98,'#3a9fb0','#1c6273',rngOf(this.seed+3));
        sailBoat(ctx,W*0.34,H*0.72,1.1,'#13525f','#eaf5f5');
        sailBoat(ctx,W*0.62,H*0.78,0.9,'#13525f','#eaf5f5');
        birds(ctx,W*0.7,H*0.2,1,'rgba(20,82,95,.6)',rngOf(this.seed+5),5);
        const tb=title(ctx,W,H,this.name,'#155460'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    },
    {
      id:'qiantang', name:'钱塘江潮', seal:'钱塘', poem:'八月涛声吼地来',
      color:'潮青', swatch:'#4a7c8c', seed:231879,
      draw(ctx,rng){
        paper(ctx,W,H,'#e6eef0','#47798a',rng);
        const sky=ctx.createLinearGradient(0,0,0,H*0.5); sky.addColorStop(0,'#dde9ec'); sky.addColorStop(1,'#c2d6da');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.55);
        // 远岸 + 六和塔
        mountainBand(ctx,W,H*0.4,H*0.5, 26,0.6, rgba('#8fb0b8',.6), rgba('#6f96a0',.7), rngOf(this.seed+1));
        pagoda(ctx,W*0.82,H*0.5,7,40,24,'rgba(60,90,98,.8)');
        // 海面
        const horizon=H*0.5;
        water(ctx,W,horizon,H*0.98,'#6f9aa6','#2e5c69',rngOf(this.seed+2));
        // 一线潮：横贯的立浪白练
        ctx.save();
        const wy=H*0.62;
        const wg=ctx.createLinearGradient(0,wy-28,0,wy+20);
        wg.addColorStop(0,'rgba(255,255,255,.97)'); wg.addColorStop(1,'rgba(150,186,196,.55)');
        ctx.fillStyle=wg; ctx.beginPath(); ctx.moveTo(0,wy+20);
        for(let i=0;i<=18;i++){ const x=W*i/18; const y=wy-15+Math.sin(i*0.85)*8; ctx.lineTo(x,y); }
        ctx.lineTo(W,wy+20); ctx.closePath(); ctx.fill();
        // 浪顶卷沫
        ctx.fillStyle='rgba(255,255,255,.96)';
        for(let i=0;i<220;i++){ const x=rng()*W; const crest=wy-15+Math.sin(x/W*18*0.85)*8;
          ctx.globalAlpha=rng()*0.7+0.2; ctx.beginPath(); ctx.arc(x,crest-rng()*18,rng()*2.6+0.6,0,Math.PI*2); ctx.fill(); }
        ctx.restore();
        // 下方涌浪线
        ctx.save(); ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=2;
        for(let k=0;k<5;k++){ const yy=H*(0.7+k*0.05); ctx.globalAlpha=0.4-k*0.05; ctx.beginPath();
          for(let i=0;i<=14;i++){ const x=W*i/14, y=yy+Math.sin(i*0.9+k)*6; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke(); } ctx.restore();
        const tb=title(ctx,W,H,this.name,'#274c57'); seal(ctx,W,H,this.seal,'#b5402f',tb);
      }
    }
  ];

  /* ============ 对外接口 ============ */
  function renderTo(index, canvas){
    var n = SCENES.length;
    index = ((index % n) + n) % n;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d");
    try { SCENES[index].draw(ctx, rngOf(SCENES[index].seed)); }
    catch(e){ ctx.fillStyle="#dad6c8"; ctx.fillRect(0,0,W,H); }
    return canvas;
  }
  function meta(index){ var s=SCENES[((index%SCENES.length)+SCENES.length)%SCENES.length]; return {name:s.name, color:s.color, swatch:s.swatch}; }
  return { count: SCENES.length, renderTo: renderTo, meta: meta, W: W, H: H };
})();
