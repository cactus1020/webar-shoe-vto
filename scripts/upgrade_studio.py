from pathlib import Path
import re
p=Path('studio.html');s=p.read_text(encoding='utf-8')
s=re.sub(r'  <script type="importmap">.*?</script>', '', s, flags=re.S)
s=s.replace('WANNA + Meta LISA Tier','Interactive preview').replace('WANNA-Grade','Reference').replace('WANNA-grade','reference').replace('WANNA Shoe + Meta LISA Eyeglass','Shoe + Eyewear Studio').replace('Meta LISA','Designer').replace('(WANNA)','').replace('true millimeter sizing.','visual scale estimate; not a measurement.').replace('11.7mm Iris Calibration','Illustrative Landmarks').replace('478-Pt Face + 11.7mm Iris Calibration','Illustrative Face Landmarks')
s=s.replace('  <!-- Main Workspace -->', '''  <nav class="px-4 py-2 text-sm text-sky-300"><a href="/shoe_vto/">← Shoe try-on & calibrated size scan</a><span class="text-slate-400"> · Studio preview / experimental live AR · Scale is estimated.</span></nav>
  <!-- Main Workspace -->''')
s=s.replace('</main>', '''</main><footer class="p-4 text-xs text-slate-400">Shoe model © 2021 Shopify · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> via Khronos glTF Sample Assets. Display normalization, mirroring and toe deformation applied. Eyewear is a procedural concept, not a branded product.</footer>''')
a=s.index('  <script type="module">');b=s.index('</script>',a)
js=s[a+len('  <script type="module">'):b]
js=js.replace("from 'three/addons/", "from 'three/examples/jsm/")
js="import { videoPointToScreen } from './core/FrameGeometry.js';\n"+js
start=js.index('    const SHOE_GLB_URLS = [');end=js.index('    ];',start)+6
js=js[:start]+"    const SHOE_GLB_URLS = [import.meta.env.BASE_URL + 'models/showcase-shoe.glb'];"+js[end:]
js=js.replace('      activeEngine = targetMode;', '''      if (cameraStarting) return;
      if (isWebcamActive) stopStudioCamera();
      activeEngine = targetMode;
      headAnchor.visible = true;''')
js=js.replace('    let isWebcamActive = false;', '''    let isWebcamActive = false;
    let cameraStarting = false;
    function stopStudioCamera() {
      isWebcamActive = false;
      video.srcObject?.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      video.classList.add('hidden');
      controls.enabled = true;
      document.getElementById('webcam-btn-text').textContent = 'Start Live AR';
      lastVideoTime = -1;
    }
    window.addEventListener('pagehide', stopStudioCamera);''')
js=js.replace("        const mode = btn.dataset.cam;", "        if (isWebcamActive) return;\n        const mode = btn.dataset.cam;").replace("        const mode = btn.dataset.gcam;", "        if (isWebcamActive) return;\n        const mode = btn.dataset.gcam;")
js=js.replace("      const gltf = await gltfLoader.loadAsync(url);\n\n      if", "      try {\n      const gltf = await gltfLoader.loadAsync(url);\n\n      if")
js=js.replace("      loadingOverlay.classList.add('opacity-0', 'pointer-events-none');\n    });", "      } catch (error) { alert('Model could not be loaded: ' + error.message); }\n      finally { URL.revokeObjectURL(url); loadingOverlay.classList.add('opacity-0', 'pointer-events-none'); }\n    });")
js=js.replace("      const btnText = document.getElementById('webcam-btn-text');", "      if (cameraStarting) return;\n      const btnText = document.getElementById('webcam-btn-text');")
js=js.replace("      try {\n        btnText.textContent = 'Loading GPU AI...';", "      cameraStarting = true;\n      try {\n        btnText.textContent = 'Loading AI...';")
js=js.replace("@0.10.17/wasm", "@0.10.35/wasm")
js=js.replace("        isWebcamActive = true;", "        lastVideoTime = -1;\n        rightFootAnchor.visible = leftFootAnchor.visible = headAnchor.visible = false;\n        isWebcamActive = true;")
js=js.replace("        alert('Camera error: ' + err.message);", "        stopStudioCamera();\n        switchEngineMode(activeEngine);\n        alert('Camera error: ' + err.message);")
js=js.replace("        btnText.textContent = 'Start Live AR';\n      }\n    });", "        btnText.textContent = 'Start Live AR';\n      } finally { cameraStarting = false; }\n    });")
# Map normalized video landmarks into the actual object-cover viewport, for both modes.
js=js.replace("          const W = video.videoWidth || 1280;\n          const H = video.videoHeight || 720;", "          const W = container.clientWidth;\n          const H = container.clientHeight;")
js=js.replace("            const lm = res.landmarks[0];", "            const lm = viewportLandmarks(res.landmarks[0]);")
js=js.replace("solveFaceEyeglass6DoF(res.faceLandmarks[0],", "solveFaceEyeglass6DoF(viewportLandmarks(res.faceLandmarks[0]),")
js=js.replace('    function solveFoot6DoF', '''    function viewportLandmarks(points) {
      return points.map(point => {
        const p = videoPointToScreen(point, container.clientWidth, container.clientHeight, video.videoWidth, video.videoHeight);
        return { ...point, x: p.screenX / container.clientWidth, y: p.screenY / container.clientHeight };
      });
    }

    function solveFoot6DoF''')
js=js.replace("      if (!ankleLm || !toeLm || ankleLm.visibility < 0.55 || toeLm.visibility < 0.55) return null;", "      if (![ankleLm, heelLm, toeLm].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.visibility >= 0.55)) return null;")
js=js.replace("      const vRight = new THREE.Vector3().crossVectors(vShinUp, vFwd).normalize();", "      const vRight = new THREE.Vector3().crossVectors(vShinUp, vFwd);\n      if (vRight.lengthSq() < 1e-6) return null;\n      vRight.normalize();")
js=js.replace("          const res = poseLandmarker.detectForVideo(video, nowMs);", "          rightFootAnchor.visible = leftFootAnchor.visible = false;\n          const res = poseLandmarker.detectForVideo(video, nowMs);")
js=js.replace("          const res = faceLandmarker.detectForVideo(video, nowMs);", "          headAnchor.visible = false;\n          const res = faceLandmarker.detectForVideo(video, nowMs);")
js=js.replace('Iris Calibrated PD: 63.0mm', 'Demo eye spacing: 63mm (assumed)').replace('Head Width:', 'Visual width estimate:')
# Correct arbitrary transformed mesh toe deformation using an inverse transform.
js=js.replace('          child.userData.basePositions = basePositions;', '          child.userData.localToMetric = child.matrixWorld.clone();\n          child.userData.metricToLocal = child.matrixWorld.clone().invert();\n          child.userData.basePositions = basePositions;')
js=js.replace("          const soleY = -0.088;", "          const soleY = -0.088;\n          const local = new THREE.Vector3();")
js=js.replace('              posAttr.setXYZ(i, bx + (newZ - mz) * scaleInv, by + (newY - my) * scaleInv, bz);', '              local.set(normCoords[i * 3], newY, newZ).applyMatrix4(child.userData.metricToLocal);\n              posAttr.setXYZ(i, local.x, local.y, local.z);')
js=js.replace('          posAttr.needsUpdate = true;', '          posAttr.needsUpdate = true;\n          child.geometry.computeVertexNormals();')
js=js.replace('            child.userData.metricToLocalScale = srcMesh[0].userData.metricToLocalScale;', '            child.userData.metricToLocalScale = srcMesh[0].userData.metricToLocalScale;\n            child.userData.metricToLocal = srcMesh[0].userData.metricToLocal.clone();')
# Skip expensive unchanged mesh deformation.
js=js.replace('      shoeRoot.traverse((child) => {', '      if (shoeRoot.userData.lastToeBend === toeBendRad) return;\n      shoeRoot.userData.lastToeBend = toeBendRad;\n      shoeRoot.traverse((child) => {')
js=js.replace("    updateShoeOccluderMaterials();\n    animate();", "    updateShoeOccluderMaterials();\n    rightRig.kpGroup.visible = leftRig.kpGroup.visible = toggleKeypoints.checked;\n    animate();")
Path('src/studio.js').write_text(js,encoding='utf-8')
s=s[:a]+'  <script type="module" src="/src/studio.js"></script>'+s[b+len('</script>'):]
p.write_text(s,encoding='utf-8')
p=Path('vite.config.js');s=p.read_text();s=s.replace("  base: '/shoe_vto/',", "  base: '/shoe_vto/',\n  build: { rollupOptions: { input: { main: 'index.html', studio: 'studio.html' } } },");p.write_text(s)
# Built studio is now owned by Vite instead of an unbundled duplicate.
Path('public/studio.html').unlink()
