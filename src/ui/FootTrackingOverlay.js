import { videoPointToScreen } from '../core/FrameGeometry.js';

export class FootTrackingOverlay {
  constructor(container,detector,onReset) {
    this.detector=detector;this.enabled=false;
    this.canvas=document.createElement('canvas');
    this.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:8';
    container.appendChild(this.canvas);
    const bar=document.createElement('div');
    bar.className='interactive foot-tracking-controls';
    bar.style.cssText='position:absolute;left:12px;bottom:100px;z-index:20;display:flex;gap:6px;flex-wrap:wrap;max-width:calc(100% - 24px)';
    this.button=document.createElement('button');this.button.textContent='Tap to track';
    const reset=document.createElement('button');reset.textContent='Auto / Reset';
    for(const button of [this.button,reset]) {button.type='button';button.style.cssText='background:#102638;color:#b6f4ff;border:1px solid #3b8799;border-radius:9px;padding:9px;font:600 12px system-ui;cursor:pointer';bar.appendChild(button);}
    this.button.onclick=()=>{onReset();this.enabled=true;this.button.textContent='Tap centre of each foot';};
    reset.onclick=()=>{onReset();this.enabled=false;this.button.textContent='Tap to track';};
    container.appendChild(bar);this.bar=bar;
  }
  tap(video,x,y,w,h,mirrored=false) {
    if(!this.enabled)return false;
    if(this.detector.lock(video,x,y,w,h,mirrored))this.button.textContent='Colour selected • tap again to adjust';
    return true;
  }
  draw(result,video,w,h,mirrored=false) {
    const c=this.canvas;c.width=w;c.height=h;const ctx=c.getContext('2d');
    if(!result)return;
    ctx.lineWidth=2;ctx.font='12px system-ui';
    for(const [heel,toe] of [[29,31],[30,32]]) {
      if(!result.landmarks[heel]||!result.landmarks[toe])continue;
      const points=[heel,toe].map(i=>videoPointToScreen(result.landmarks[i],w,h,video.videoWidth,video.videoHeight,mirrored));
      ctx.strokeStyle=result.source.includes('estimate')||result.source.includes('Tap')?'#fbbf24':'#67e8f9';ctx.fillStyle=ctx.strokeStyle;
      ctx.beginPath();ctx.moveTo(points[0].screenX,points[0].screenY);ctx.lineTo(points[1].screenX,points[1].screenY);ctx.stroke();
      for(const [i,p] of points.entries()) {ctx.beginPath();ctx.arc(p.screenX,p.screenY,5,0,Math.PI*2);ctx.stroke();ctx.fillText(i?'Toe':'Heel',p.screenX+8,p.screenY);}
    }
  }
}
