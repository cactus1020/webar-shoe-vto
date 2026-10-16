from pathlib import Path
fixture='''<script>
const qc=document.createElement('canvas');qc.width=640;qc.height=960;const qx=qc.getContext('2d');let blank=false;
function frame(t){qx.fillStyle='#dcdcdc';qx.fillRect(0,0,640,960);if(!blank){qx.fillStyle='#965541';for(const x of [190,450]){qx.beginPath();qx.ellipse(x+Math.sin(t/700)*20,550,46,145,0,0,Math.PI*2);qx.fill();}}requestAnimationFrame(frame)}requestAnimationFrame(frame);
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>qc.captureStream(30)});
window.addEventListener('DOMContentLoaded',()=>{const b=document.createElement('button');b.textContent='QA: Blank frame';b.style.cssText='position:fixed;bottom:10px;left:10px;z-index:99999;background:#fff;color:#000;padding:10px';b.onclick=()=>{blank=!blank;b.textContent=blank?'QA: Restore shapes':'QA: Blank frame'};document.body.appendChild(b);});
</script>'''
for source,target in [('index.html','qa-tracking.html'),('studio.html','qa-studio.html')]:
 s=Path('dist/shoe_vto/'+source).read_text(encoding='utf-8').replace('<head>','<head>'+fixture)
 Path('dist/shoe_vto/'+target).write_text(s,encoding='utf-8')
