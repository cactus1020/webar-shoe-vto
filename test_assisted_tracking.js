import assert from 'node:assert/strict';
import {scanFootRegions} from './src/core/FootRegionScanner.js';
import {FootTrackingPipeline} from './src/core/FootTrackingPipeline.js';
import {usableFeet} from './src/core/TrackingSelection.js';
import {OpticalFootDetector} from './src/core/OpticalFootDetector.js';
import {videoPointToScreen} from './src/core/FrameGeometry.js';
import {OcclusionManager} from './src/tracking/OcclusionManager.js';
import * as THREE from 'three';
const w=128,h=192;
function frame(shapes=[]) {
 const d=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
  const hit=shapes.some(s=>((x-s.x)/s.rx)**2+((y-s.y)/s.ry)**2<=1);
  d.set(hit?[150,85,65,255]:[220,220,220,255],(y*w+x)*4);
 }
 return d;
}
assert.equal(scanFootRegions(frame(),w,h).length,0,'Blank floor must not create a foot');
const feet=[{x:35,y:110,rx:12,ry:35},{x:94,y:110,rx:12,ry:35}];
let regions=scanFootRegions(frame(feet),w,h);
assert.equal(regions.length,2,'Separate feet must have separate PCA axes');
assert.ok(regions[0].toe.v<regions[0].heel.v);
const seed={id:'left',u:35/w,v:110/h,color:[150,85,65]};
regions=scanFootRegions(frame(feet),w,h,[seed]);
assert.equal(regions.length,1);
assert.ok(Math.abs(regions[0].center.u-35/w)<0.02);
regions=scanFootRegions(frame([{...feet[0],x:45}]),w,h,[seed]);
assert.ok(regions[0].center.u>seed.u,'Tapped component must follow movement');
assert.equal(scanFootRegions(frame(),w,h,[seed]).length,0,'Lost tap must not manufacture default endpoints');
assert.equal(scanFootRegions(frame([{x:64,y:96,rx:60,ry:92}]),w,h).length,0,'Large foreground must be rejected');
const lm=Array(33).fill(null);
for(const [i,x,y] of [[27,.3,.7],[29,.3,.8],[31,.3,.3]])lm[i]={x,y,visibility:.2};
assert.equal(usableFeet(lm,390,700,390,700),null,'Weak pose must not block fallback');
const strong=lm.map(p=>p?{...p,visibility:.8}:null);
const optical={seeds:[],reset(){this.seeds=[]},detect(){return {landmarks:strong,source:'Contrast estimate'}}};
const pipeline=new FootTrackingPipeline({canDetect:()=>false},optical,{isLoaded:true,detect:()=>({landmarks:lm})});
const video={videoWidth:390,videoHeight:700,currentTime:1,readyState:4};
assert.match(pipeline.detect(video,390,700,false,1000).source,/Contrast/);
optical.seeds=[seed];optical.detect=()=>null;
assert.equal(pipeline.detect(video,390,700,false,1100),null,'Tap loss must not jump to another detector');
const occlusion=new OcclusionManager({add(){}});
occlusion.updateSingleOccluder(occlusion.leftAssembly,{isTracked:true,opacity:1,trackingSource:'image-landmarks',position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),scale:new THREE.Vector3(1,1,1)});
assert.equal(occlusion.leftAssembly.group.visible,false,'Guessed foot volume must not cut holes in a screen-fitted shoe');
// Exercise real crop conversion and mirrored side assignment without a DOM.
const pixels=frame([feet[0]]);
globalThis.document={createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:pixels})})})};
const detector=new OpticalFootDetector();
detector.capture=()=>({data:pixels,w,h,g:{videoWidth:1920,videoHeight:1080,size:192,sx:600,sy:0,cropWidth:720,cropHeight:1080,drawWidth:128,drawHeight:192,padX:32,padY:0}});
const camera={videoWidth:1920,videoHeight:1080,readyState:4};
const normal=detector.detect(camera,400,600,false);
detector.lastScan=-Infinity;
const mirrored=detector.detect(camera,400,600,true);
const a=videoPointToScreen(normal.landmarks[29],400,600,1920,1080,false);
const b=videoPointToScreen(mirrored.landmarks[30],400,600,1920,1080,true);
assert.ok(Math.abs(a.screenX+b.screenX-400)<1e-6,'Front mirror must match the visible crop');
console.log('V3 regression checks passed: blank floor, two regions, tap movement/loss, weak-source fallback, crop/mirror.');
