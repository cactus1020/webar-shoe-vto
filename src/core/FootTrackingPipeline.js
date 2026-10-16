import { usableFeet } from './TrackingSelection.js';

export class FootTrackingPipeline {
  constructor(footNet, optical, pose = null) {
    this.footNet=footNet; this.optical=optical; this.pose=pose;
    this.busy=false; this.generation=0; this.reset();
  }
  reset() {
    this.generation++; this.latest=null; this.lastStart=-Infinity;
    this.videoTime=-1;this.lastVideoAdvance=0;
    this.lastPose=-Infinity; this.poseResult=null; this.optical.reset();
    if(this.pose) {this.pose.lastResult=null;this.pose.lastVideoTime=-1;}
  }
  detect(video,w,h,mirrored=false,now=performance.now()) {
    if(video.currentTime!==this.videoTime) {this.videoTime=video.currentTime;this.lastVideoAdvance=now;}
    if(now-this.lastVideoAdvance>800)return null;
    const validate=(lm,min=0.4)=>usableFeet(lm,w,h,video.videoWidth,video.videoHeight,mirrored,min);
    if(this.optical.seeds.length) {
      const result=this.optical.detect(video,w,h,mirrored);
      const landmarks=validate(result?.landmarks);
      return landmarks?{...result,landmarks}:null;
    }
    if(this.footNet.canDetect()&&!this.busy&&now-this.lastStart>=180) {
      this.busy=true;this.lastStart=now;const generation=this.generation;
      this.footNet.detect(video,w,h,mirrored).then(result=>{if(generation===this.generation)this.latest=result;})
        .catch(()=>{if(generation===this.generation)this.latest=null;}).finally(()=>{this.busy=false;});
    }
    if(this.pose?.isLoaded&&now-this.lastPose>=150) {
      this.lastPose=now;
      this.poseResult=this.pose.detect(video,now);
    }
    const trained=this.latest&&now-this.latest.capturedAt<800?validate(this.latest.landmarks):null;
    const pose=validate(this.poseResult?.landmarks,0.5);
    const optical=this.optical.detect(video,w,h,mirrored);
    const contrast=validate(optical?.landmarks);
    const landmarks=Array(33).fill(null),sources=new Set();
    for(const ids of [[27,29,31],[28,30,32]]) {
      for(const [lm,source] of [[trained,'FootNet'],[pose,'Pose'],[contrast,'Contrast estimate']]) {
        if(!lm?.[ids[1]])continue;
        for(const id of ids)landmarks[id]=lm[id];
        sources.add(source);break;
      }
    }
    return sources.size?{landmarks,worldLandmarks:null,source:[...sources].join(' + '),capturedAt:now}:null;
  }
}
