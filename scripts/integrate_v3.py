from pathlib import Path
p=Path('src/main.js');s=p.read_text(encoding='utf-8-sig');s="import { FootTrackingPipeline } from './core/FootTrackingPipeline.js';\nimport { FootTrackingOverlay } from './ui/FootTrackingOverlay.js';\n"+s
s=s.replace('    this.footNetEngine = new FootNetInferenceEngine();','    this.footNetEngine = new FootNetInferenceEngine();\n    this.trackingPipeline = new FootTrackingPipeline(this.footNetEngine, this.opticalFootDetector, this.poseDetector);')
s=s.replace("    const appContainer = document.getElementById('app-container');", "    const appContainer = document.getElementById('app-container');\n    this.trackingOverlay = new FootTrackingOverlay(appContainer, this.opticalFootDetector, () => {this.stopManualAlignment();this.trackingPipeline.reset();});")
s=s.replace('        // Placement is explicit through Align; incidental camera taps do not\n        // create a synthetic floor anchor that competes with detected feet.', '''        if (this.cameraManager.isReady && !this.manualPlacement) {
          const rect=appContainer.getBoundingClientRect();
          this.trackingOverlay.tap(videoElement,e.clientX-rect.left,e.clientY-rect.top,rect.width,rect.height,this.cameraManager.isFacingUser());
        }''')
s=s.replace('        this.footTracker.initDefaultAnchors(this.viewWidth, this.viewHeight);', '        this.footTracker.clearManualAnchors();\n        this.trackingPipeline.reset();')
a=s.index('      let detectedLandmarks = null;',s.index('  loop('));b=s.index('      // Phantom Z-Buffer',a)
s=s[:a]+'''      const result = this.manualPlacement ? null : this.trackingPipeline.detect(video,cWidth,cHeight,this.cameraManager.isFacingUser(),timestamp);
      this.trackingOverlay.draw(result,video,cWidth,cHeight,this.cameraManager.isFacingUser());
      const feet = this.footTracker.update(result?.landmarks || null,null,
        cWidth,cHeight,vWidth,vHeight,this.cameraManager.isFacingUser());
      const tracked = feet.left.isTracked || feet.right.isTracked;
      this.ui.updateAIEngineStatus(this.manualPlacement ? 'Manual placement' :
        result && tracked ? result.source : this.trackingOverlay.enabled ? 'Tap foot centre • use a contrasting floor' : 'Feet not found • try Tap to track or Align',
        result && tracked ? 'active' : 'scanning');
''' +s[b:]
s=s.replace('    this.viewWidth = cWidth;', '    if (this.viewWidth !== cWidth || this.viewHeight !== cHeight) this.trackingPipeline.reset();\n    this.viewWidth = cWidth;')
p.write_text(s,encoding='utf-8')
# Clear stale Pose result immediately after a miss.
p=Path('src/core/PoseDetector.js');s=p.read_text(encoding='utf-8');s=s.replace('    return null;\n  }\n}', '    this.lastResult = null;\n    return null;\n  }\n}');p.write_text(s,encoding='utf-8')
p=Path('src/studio.js');s=p.read_text(encoding='utf-8-sig');s="import { FootTrackingPipeline } from './core/FootTrackingPipeline.js';\nimport { FootTrackingOverlay } from './ui/FootTrackingOverlay.js';\nimport { PoseDetector } from './core/PoseDetector.js';\n"+s
s=s.replace('    const opticalFootDetector = new OpticalFootDetector();', '''    const opticalFootDetector = new OpticalFootDetector();
    const poseDetector = new PoseDetector();
    const trackingPipeline = new FootTrackingPipeline(footNet,opticalFootDetector,poseDetector);
    const trackingOverlay = new FootTrackingOverlay(container,opticalFootDetector,()=>trackingPipeline.reset());
    trackingOverlay.bar.style.bottom='64px';
    canvas.addEventListener('pointerdown', e=>{
      if(!isWebcamActive || activeEngine!=='shoe')return;
      const r=canvas.getBoundingClientRect();
      trackingOverlay.tap(video,e.clientX-r.left,e.clientY-r.top,r.width,r.height);
    });''')
# Model loading must not block getting camera frames / assisted tracking.
s=s.replace("        if (!visionResolver) {", "        if (activeEngine === 'glass' && !visionResolver) {")
a=s.index("        if (activeEngine === 'shoe') {",s.index("btnText.textContent = 'Loading AI...';"));b=s.index("        } else if (!faceLandmarker) {",a)
s=s[:a]+'''        if (activeEngine === 'shoe') {
          footNet.init().catch(e=>console.warn('FootNet warmup:',e));
          if(!poseDetector.isLoaded) poseDetector.init().catch(e=>console.warn('Pose warmup:',e));
''' +s[b:]
a=s.index("        if (activeEngine === 'shoe') {",s.index('        headAnchor.visible = false;',s.index("btnText.textContent = 'Loading AI...';")));b=s.index('        isWebcamActive = true;',a)
s=s[:a]+'''        rightFootAnchor.visible = leftFootAnchor.visible = false;
        trackingPipeline.reset();
''' +s[b:]
a=s.index('          let detectedLandmarks = null;');b=s.index('          // Reset toe flex',a)
s=s[:a]+'''          const result=trackingPipeline.detect(video,W,H,false,nowMs);
          trackingOverlay.draw(result,video,W,H);
          for(const [root,heelIndex,toeIndex,filter,enabled] of [
            [leftFootAnchor,29,31,leftFilter,toggleDualFoot.checked],[rightFootAnchor,30,32,rightFilter,true]
          ]) {
            const wasVisible=root.visible;root.visible=false;
            const heel=result?.landmarks[heelIndex],toe=result?.landmarks[toeIndex];
            if(!enabled||!heel||!toe)continue;
            const map=p=>videoPointToScreen(p,W,H,video.videoWidth,video.videoHeight);
            const fit=fitScreenFoot(map(heel),map(toe),W,H,45,shoeRenderBounds);
            if(!fit)continue;
            if(!wasVisible) {
              for(const axis of [filter.fx,filter.fy,filter.fz]) {axis.x=new LowPassFilter();axis.dx=new LowPassFilter();axis.lastTime=null;}
              filter.lastQuat=null;
            }
            root.position.copy(filter.filterPos(fit.position,nowMs));root.quaternion.copy(filter.filterQuat(fit.quaternion));
            root.scale.setScalar(fit.scale);root.visible=true;
          }
          groundShadowPlane.visible=false;
          document.getElementById('hud-pose').textContent=result ? result.source+' • visual estimate' : 'Feet not found • Tap to track, then tap foot centre';
''' +s[b:]
s=s.replace('      renderer.render(scene, camera);', '''      trackingOverlay.bar.hidden = !isWebcamActive || activeEngine !== 'shoe';
      trackingOverlay.canvas.hidden = !isWebcamActive || activeEngine !== 'shoe';
      renderer.render(scene, camera);''')
s=s.replace('      lastVideoTime = -1;\n    }','      lastVideoTime = -1;\n      trackingPipeline.reset();\n    }')
s=s.replace('      camera.aspect = w / h;', '      trackingPipeline.reset();\n      camera.aspect = w / h;')
p.write_text(s,encoding='utf-8')
