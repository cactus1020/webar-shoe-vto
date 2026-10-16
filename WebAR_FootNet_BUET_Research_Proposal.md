# Research Proposal & Concept Note

**Project Title:**  
### **WebAR-FootNet: Edge-Accelerated Mobile Augmented Reality Virtual Shoe Try-On and Biometric Sizing via High-Density Anatomical Landmark Detection and Non-Rigid 3D Thin-Plate Splines**

**Proposed Research Supervisors:**  
* **Dr. S. M. Mahbubur Rahman**, Professor, Department of EEE, BUET *(Specialization: Computer Vision, AR/VR Applications, Generative AI)*  
* **Dr. Sukarna Barua**, Associate Professor, Department of CSE, BUET *(Specialization: Deep Learning, Multimodal Representation Learning, Edge AI)*  

---

### 1. Motivation & Problem Statement
In modern fashion e-commerce, apparel and footwear experience an alarming **30% to 40% product return rate**, incurring hundreds of billions of dollars in reverse logistics and environmental waste. Behavioral consumer psychology reveals that the primary bottleneck is the lack of **"Pseudo-Ownership"** and the persistent hesitation: *"Will this shoe fit my foot dimensions and look good on me?"*

While 2D generative diffusion models (e.g., IDM-VTON) produce static images, they require heavy cloud GPUs (10–30s latency) and cannot offer interactive spatial inspection. Conversely, existing mobile WebAR solutions rely on general whole-body pose estimators (such as Google MediaPipe Pose), which provide only **3 sparse landmarks** per foot (heel, ankle, and toe tip). Under typical steep top-down camera viewing angles (40°–75° pitch), these sparse points cause severe depth ambiguity, floating artifacts on the shin/calf, lack of instep curvature, and zero adaptability to wide or high-arched feet.

---

### 2. Proposed System Architecture & Research Contributions

We propose **WebAR-FootNet**, an end-to-end client-side framework running at **60 FPS** in mobile web browsers (iOS Safari and Android Chrome) without native app installations or paid third-party SDKs.

```
       Camera Feed (RGB Video)
                 │
                 ▼
  ┌───────────────────────────────┐
  │   FootNet-24 Deep Network     │ ◄── MobileNetV3-Small Backbone
  │ (24 Anatomical 3D Keypoints)  │ ◄── Wing Loss for Sub-Millimeter Precision
  └──────────────┬────────────────┘
                 │ (x, y, z, conf)
                 ▼
  ┌───────────────────────────────┐
  │ 3D Camera Ray Unprojection    │ ◄── Pinhole Camera Matrix & FOV Calibration
  │   & Gram-Schmidt Frames       │ ◄── Orthonormal Vectors (Forward, Up, Right)
  └──────────────┬────────────────┘
                 │
                 ▼
  ┌───────────────────────────────┐
  │ 30-Frame Temporal Foot Memory │ ◄── Adaptive 1-Euro Low-Pass Filter
  │   & SLERP Interpolation       │ ◄── Zero Sensor Jitter & Flicker Elimination
  └──────────────┬────────────────┘
                 │
                 ▼
  ┌───────────────────────────────┐
  │ Non-Rigid 3D Thin-Plate Spline│ ◄── "Rubber Sheet & Digital Pins"
  │     (TPS 3D Deformer)         │ ◄── Local Footwear Mesh Morphing (Width/Arch)
  └──────────────┬────────────────┘
                 │
                 ▼
  ┌───────────────────────────────┐
  │ Ground Contact Shadow Receiver│ ◄── Floor Level Locking (THREE.ShadowMaterial)
  │  & Biometric Size Telemetry   │ ◄── Live EU/US Sizing (ISO/TS 19407)
  └───────────────────────────────┘
```

#### Key Technical Contributions:
1. **24-Point Anatomical Foot Schema (FootNet-24):** Replacing sparse 3-point models with a customized MobileNetV3-Small network predicting 24 high-density landmarks covering the heel counter, medial/lateral malleoli, 1st & 5th metatarsal heads, instep apex, and individual toe joints.
2. **Non-Rigid 3D Thin-Plate Spline (TPS) Mesh Deformation:** Formulating real-time local mesh warping using 3D radial basis functions ($U(r) = r$), morphing the canonical 3D sneaker mesh to dynamically contour to high arches or wide feet.
3. **Temporal Stability via Speed-Adaptive 1-Euro Filtering & SLERP:** Eliminating camera sensor noise and tracking flicker during foot movement while maintaining instantaneous step response.
4. **Physical Ground Contact Shadow & Anatomical Occlusion:** Dynamically locking a shadow receiver plane to the lowest detected sole point and applying tapered depth occluders to ensure pants and ankles naturally clip into the shoe collar.
5. **Real-Time Biometric Sizing Telemetry:** Calculating metric Euclidean foot length and width in centimeters directly from camera intrinsics, recommending exact international shoe sizes (EU / US).

---

### 3. Experimental Benchmarks & Evaluation Plan

| Metric Category | Target Evaluation Criteria | Benchmark Baselines |
| :--- | :--- | :--- |
| **Landmark Accuracy** | Mean Per Joint Position Error (MPJPE < 8mm), PCK@10mm > 92% | MediaPipe Pose, OpenPose Foot |
| **Inference Efficiency** | Latency < 25ms, Sustained 55–60 FPS on iPhone / Snapdragon | Native WebAssembly vs. WebGL |
| **Deformation Quality** | Mesh surface distortion error < 2.5mm against 3D ground-truth scans | Rigid 6-DOF vs. Non-Rigid 3D TPS |
| **Sizing Accuracy** | Absolute foot length error $\le 3.5\text{ mm}$ ($\pm 0.5$ shoe size) | Brannock Device / Metric Ruler |

**Proposed Datasets:**
* Synthetic 3D Foot Renderings with diverse skin tones, sock conditions, and lighting angles.
* Real-world annotated foot keypoint datasets (Stanford 3D Foot / FreiHAND extension).

---

### 4. Current Prototype Status
A fully functional prototype is already operational in our local environment:
* **Engine:** Three.js + WebGL, ES6, Vite build system with HTTPS mobile network debugging.
* **Tested:** 17/17 automated simulation tests passing (TPS non-singularity, temporal convergence, and metric sizing validation).
* **Source Code:** Available locally with turnkey deployment readiness.

---

### 5. Target Publication Venues
* **Conferences:** IEEE International Conference on Image Processing (ICIP), IEEE VR / ISMAR, IEEE ICCIT.
* **Journals:** IEEE Transactions on Multimedia, Computers & Graphics (Elsevier).

---

**Applicant / Researcher:**  
*Name:* [Your Name]  
*Institution:* [Your Department / Affiliation]  
*GitHub / Portfolio:* [Project Link]  
*Email / Phone:* [Your Contact Details]  
