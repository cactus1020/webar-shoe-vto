import { inferenceGeometry, modelPointToVideo } from './FrameGeometry.js';
import { scanFootRegions } from './FootRegionScanner.js';

export class OpticalFootDetector {
  constructor() {
    this.canvas=document.createElement('canvas');
    this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});
    this.reset();
  }
  reset() {this.seeds=[];this.lastScan=-Infinity;this.lastResult=null;}
  capture(video,width,height) {
    const w=Math.max(32,Math.round(192*Math.min(1,width/height)));
    const h=Math.max(32,Math.round(192*Math.min(1,height/width)));
    this.canvas.width=w;this.canvas.height=h;
    const g=inferenceGeometry(video.videoWidth,video.videoHeight,width,height,192);
    this.ctx.drawImage(video,g.sx,g.sy,g.cropWidth,g.cropHeight,0,0,w,h);
    return {data:this.ctx.getImageData(0,0,w,h).data,w,h,g};
  }
  lock(video,x,y,width,height,mirrored=false) {
    if(!video?.videoWidth||video.readyState<2) return false;
    const f=this.capture(video,width,height),u=mirrored?1-x/width:x/width,v=y/height;
    if(u<0||u>1||v<0||v>1) return false;
    const i=(Math.min(f.h-1,Math.floor(v*f.h))*f.w+Math.min(f.w-1,Math.floor(u*f.w)))*4;
    const seed={id:x<width/2?'left':'right',u,v,color:Array.from(f.data.slice(i,i+3))};
    this.seeds=this.seeds.filter(s=>s.id!==seed.id);this.seeds.push(seed);
    this.lastScan=-Infinity;this.lastResult=null;
    return true;
  }
  detect(video,width=video?.videoWidth,height=video?.videoHeight,mirrored=false) {
    if(!video?.videoWidth||!video.videoHeight||video.readyState<2||!width||!height) return null;
    const now=performance.now();
    if(now-this.lastScan<80) return this.lastResult;
    this.lastScan=now;
    const f=this.capture(video,width,height);
    const regions=scanFootRegions(f.data,f.w,f.h,this.seeds);
    const landmarks=Array(33).fill(null);
    for(const [index,r] of regions.entries()) {
      const seed=this.seeds.find(s=>s.id===r.seedId);
      if(seed) {seed.u=r.center.u;seed.v=r.center.v;seed.direction=r.direction;}
      const screenU=mirrored?1-r.center.u:r.center.u;
      const right=r.seedId?r.seedId==='right':regions.length===2?(mirrored?index===0:index===1):screenU>=0.5;
      const convert=p=>({...modelPointToVideo(f.g.padX+p.u*f.g.drawWidth,f.g.padY+p.v*f.g.drawHeight,f.g),z:0,visibility:0.5,estimated:true});
      const heel=convert(r.heel),toe=convert(r.toe);
      landmarks[right?30:29]=heel;landmarks[right?32:31]=toe;
      landmarks[right?28:27]={x:heel.x+(toe.x-heel.x)*0.12,y:heel.y+(toe.y-heel.y)*0.12,z:0,visibility:0.5,estimated:true};
    }
    // 0.5 represents geometric acceptance, NOT an AI probability.
    this.lastResult=regions.length?{landmarks,worldLandmarks:null,isOpticalFallback:true,capturedAt:now,source:this.seeds.length?'Tap-assisted tracking':'Contrast estimate'}:null;
    return this.lastResult;
  }
}
