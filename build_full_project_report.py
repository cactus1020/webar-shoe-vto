import os
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

# =============================================================================
# 1. GENERATE HIGH-RESOLUTION FLOWCHART IMAGE (300 DPI)
# =============================================================================
def generate_flowchart(output_path="methodology_flowchart.png"):
    fig, ax = plt.subplots(figsize=(11.5, 7.5), dpi=300)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')

    # Background container cards
    # Left container: Stage A
    card_a = patches.FancyBboxPatch((2, 3), 46, 94, boxstyle="round,pad=1",
                                    facecolor="#F6F8FB", edgecolor="#002060", linewidth=1.8)
    ax.add_patch(card_a)
    ax.text(25, 93.5, "STAGE A: REAL-TIME CLIENT-SIDE EDGE TRACKING", 
            fontsize=10.5, fontweight='bold', color="#002060", ha='center', fontfamily='sans-serif')

    # Right container: Stage B
    card_b = patches.FancyBboxPatch((52, 3), 46, 94, boxstyle="round,pad=1",
                                    facecolor="#F6F8FB", edgecolor="#002060", linewidth=1.8)
    ax.add_patch(card_b)
    ax.text(75, 93.5, "STAGE B: 6-DoF SPATIAL RECONSTRUCTION & RENDERING", 
            fontsize=10.5, fontweight='bold', color="#002060", ha='center', fontfamily='sans-serif')

    def draw_box(x, y, w, h, title, subtitle="", bg="#FFFFFF", border="#002060", text_col="#111111", title_size=9, sub_size=7.5):
        box = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.6",
                                     facecolor=bg, edgecolor=border, linewidth=1.2)
        ax.add_patch(box)
        if subtitle:
            ax.text(x + w/2, y + h*0.62, title, fontsize=title_size, fontweight='bold', 
                    color=text_col, ha='center', va='center', fontfamily='sans-serif')
            ax.text(x + w/2, y + h*0.28, subtitle, fontsize=sub_size, 
                    color="#444444", ha='center', va='center', fontfamily='sans-serif')
        else:
            ax.text(x + w/2, y + h*0.5, title, fontsize=title_size, fontweight='bold', 
                    color=text_col, ha='center', va='center', fontfamily='sans-serif')

    def draw_arrow(x1, y1, x2, y2, color="#002060", lw=1.5, label=""):
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="-|>", color=color, lw=lw, mutation_scale=12))
        if label:
            mid_x = (x1 + x2) / 2
            mid_y = (y1 + y2) / 2
            ax.text(mid_x + 1.2, mid_y, label, fontsize=7.5, fontweight='bold', color=color, ha='left', va='center')

    # --- STAGE A BOXES ---
    draw_box(6, 82, 38, 7.5, "Live Camera Stream (1280x720 @ 60 FPS)", "RGB input, automatic front/rear fallback", bg="#EBF3FA")
    draw_arrow(25, 82, 25, 77)

    draw_box(6, 70, 38, 7.0, "Aspect-Ratio Viewport Geometry", "videoPointToScreen, crop & center compensation")
    draw_arrow(25, 70, 25, 65)

    draw_box(6, 56, 38, 8.5, "Tier 1: MediaPipe Pose (GPU)", "33-point body skeleton, float16 lite model (60 FPS)", bg="#E6F4EA", border="#137333")
    draw_arrow(25, 56, 25, 50)

    draw_box(6, 41, 38, 8.5, "Tier 2: FootNet Deep Neural Model", "MobileNetV3 backbone via WebAssembly SIMD", bg="#FEF7E0", border="#B06000")
    draw_arrow(25, 41, 25, 35)

    draw_box(6, 26, 38, 8.5, "Tier 3: Optical Foot Detector", "YCbCr skin chroma segmentation & 1D projection peaks", bg="#FCE8E6", border="#C5221F")
    draw_arrow(25, 26, 25, 20)

    draw_box(6, 11, 38, 8.5, "Tier 4: Floor Plane Continuous Anchor", "Locks shoes to ground; prevents vanishing or flicker", bg="#F1F3F4", border="#5F6368")

    draw_arrow(44, 60.25, 55, 74, color="#137333", lw=1.6, label="Feet Tracked")
    draw_arrow(44, 45.25, 55, 73, color="#B06000", lw=1.4, label="")
    draw_arrow(44, 30.25, 55, 72, color="#C5221F", lw=1.4, label="")

    # --- STAGE B BOXES ---
    draw_box(56, 77, 38, 8.0, "Pinhole Camera Ray Unprojection", "Intrinsics matrix, metric depth & screen mapping", bg="#EBF3FA")
    draw_arrow(75, 77, 75, 71)

    draw_box(56, 62, 38, 8.8, "6-DoF Gram-Schmidt Orthonormal Solver", "Strict basis vectors: Forward, Up, Right -> Quat q", bg="#FFFFFF")
    draw_arrow(75, 62, 75, 56)

    draw_box(56, 47, 38, 8.8, "Adaptive 1-Euro Low-Pass Filter", "Speed-dependent cutoff: removes jitter, zero lag", bg="#FFFFFF")
    draw_arrow(75, 47, 75, 41)

    draw_box(56, 32, 38, 8.8, "Non-Rigid 3D Thin-Plate Spline (TPS)", "RBF kernel U(r) = r conforms mesh to arches & width", bg="#FFFFFF")
    draw_arrow(75, 32, 75, 26)

    draw_box(56, 17, 38, 8.8, "Phantom Z-Buffer Depth Occlusion", "Invisible leg writes depth; real ankles occlude shoes", bg="#FFFFFF")
    draw_arrow(75, 17, 75, 11)

    draw_box(56, 5, 38, 6.0, "Interactive 60 FPS WebAR Display & Sizing", "EU/US shoe size recommendation (ISO/TS 19407)", bg="#E6F4EA", border="#137333")

    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Flowchart successfully saved to: {output_path}")

# =============================================================================
# 2. GENERATE COMPLETE ACADEMIC DOCX REPORT (12 PT BODY TEXT)
# =============================================================================
def create_report():
    generate_flowchart("methodology_flowchart.png")

    doc = Document()

    # 1. Page Margins: 1 inch on all sides
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        section.header_distance = Inches(0.5)
        section.footer_distance = Inches(0.5)

    # 2. Base Normal Style: 12 pt Times New Roman
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Times New Roman'
    style_normal.font.size = Pt(12)
    style_normal.font.color.rgb = RGBColor(0x1A, 0x1A, 0x1A)
    style_normal.paragraph_format.line_spacing = 1.15
    style_normal.paragraph_format.space_after = Pt(5)
    style_normal.paragraph_format.space_before = Pt(0)

    def add_para(text="", bold_prefix="", italic=False, space_after=5, align=WD_ALIGN_PARAGRAPH.LEFT, size=12):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.line_spacing = 1.15
        if bold_prefix:
            r_bold = p.add_run(bold_prefix)
            r_bold.bold = True
            r_bold.font.name = 'Times New Roman'
            r_bold.font.size = Pt(size)
        if text:
            r_text = p.add_run(text)
            r_text.italic = italic
            r_text.font.name = 'Times New Roman'
            r_text.font.size = Pt(size)
        return p

    def add_heading(text, level=1):
        p = doc.add_paragraph()
        p.paragraph_format.keep_with_next = True
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run(text)
        r.bold = True
        r.font.name = 'Times New Roman'
        if level == 1:
            r.font.size = Pt(14)
            r.font.color.rgb = RGBColor(0x00, 0x20, 0x60)
        else:
            r.font.size = Pt(12.5)
            r.font.color.rgb = RGBColor(0x22, 0x22, 0x22)
        return p

    def set_cell_background(cell, fill_hex):
        tcPr = cell._element.get_or_add_tcPr()
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
        tcPr.append(shd)

    def set_cell_margins(cell, top=100, bottom=100, left=130, right=130):
        tcPr = cell._element.get_or_add_tcPr()
        tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
        tcPr.append(tcMar)

    def set_table_borders(table, color="B0B0B0"):
        tblPr = table._element.xpath('w:tblPr')
        if tblPr:
            borders = parse_xml(f'''
                <w:tblBorders {nsdecls("w")}>
                    <w:top w:val="single" w:sz="6" w:space="0" w:color="002060"/>
                    <w:bottom w:val="single" w:sz="6" w:space="0" w:color="002060"/>
                    <w:left w:val="none"/>
                    <w:right w:val="none"/>
                    <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{color}"/>
                    <w:insideV w:val="none"/>
                </w:tblBorders>
            ''')
            tblPr[0].append(borders)

    # =========================================================================
    # COVER / HEADER PAGE (BUET EEE Format)
    # =========================================================================
    p_inst = doc.add_paragraph()
    p_inst.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_inst.paragraph_format.space_before = Pt(36)
    p_inst.paragraph_format.space_after = Pt(6)
    r = p_inst.add_run("Bangladesh University of Engineering & Technology")
    r.bold = True
    r.font.size = Pt(16)
    r.font.name = 'Times New Roman'
    r.font.color.rgb = RGBColor(0x00, 0x20, 0x60)

    p_dept = doc.add_paragraph()
    p_dept.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_dept.paragraph_format.space_after = Pt(28)
    r = p_dept.add_run("Department of Electrical and Electronic Engineering")
    r.font.size = Pt(13)
    r.font.name = 'Times New Roman'
    r.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    p_course = doc.add_paragraph()
    p_course.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_course.paragraph_format.space_after = Pt(4)
    r = p_course.add_run("Course No: EEE 311")
    r.bold = True
    r.font.size = Pt(13)
    r.font.name = 'Times New Roman'

    p_cname = doc.add_paragraph()
    p_cname.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_cname.paragraph_format.space_after = Pt(32)
    r = p_cname.add_run("Course Name: Digital Signal Processing I")
    r.bold = True
    r.font.size = Pt(13)
    r.font.name = 'Times New Roman'

    p_proj = doc.add_paragraph()
    p_proj.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_proj.paragraph_format.space_after = Pt(40)
    r = p_proj.add_run("Project Title: WebAR-Fit: A Zero-Install Edge-AI Biomimetic Virtual Try-On and Metric Sizing System for Footwear and Eyewear")
    r.bold = True
    r.font.size = Pt(15)
    r.font.name = 'Times New Roman'
    r.font.color.rgb = RGBColor(0x00, 0x20, 0x60)

    p_subto_label = doc.add_paragraph()
    p_subto_label.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_subto_label.paragraph_format.space_after = Pt(2)
    r = p_subto_label.add_run("Submitted to:")
    r.bold = True
    r.font.size = Pt(12)
    r.font.name = 'Times New Roman'

    p_subto = doc.add_paragraph()
    p_subto.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_subto.paragraph_format.space_after = Pt(40)
    r = p_subto.add_run("Dr. Celia Shahnaz\nProfessor\nDepartment of Electrical and Electronic Engineering, BUET")
    r.font.size = Pt(12)
    r.font.name = 'Times New Roman'

    p_subby_label = doc.add_paragraph()
    p_subby_label.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_subby_label.paragraph_format.space_after = Pt(2)
    r = p_subby_label.add_run("Submitted by:")
    r.bold = True
    r.font.size = Pt(12)
    r.font.name = 'Times New Roman'

    p_subby = doc.add_paragraph()
    p_subby.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_subby.paragraph_format.space_after = Pt(0)
    r = p_subby.add_run("Abrar Shahriar\nStudent ID: 2206078\nSection: B1\nDepartment of Electrical and Electronic Engineering\nBangladesh University of Engineering & Technology")
    r.font.size = Pt(12)
    r.font.name = 'Times New Roman'

    doc.add_page_break()

    # =========================================================================
    # SECTION 1: PROJECT NAME (Concise, 12pt)
    # =========================================================================
    add_heading("1. Project Name")
    add_para(
        "WebAR-Fit is a zero-install augmented reality system that runs inside standard web browsers at 60 frames per second. "
        "It tracks feet and facial landmarks in real time, places 3D footwear and eyewear models using geometric coordinate frames, "
        "applies non-rigid mesh deformation and depth occlusion, and measures foot dimensions to recommend correct shoe sizes."
    )

    # =========================================================================
    # SECTION 2: PROBLEM STATEMENT (Concise & Simple, 12pt)
    # =========================================================================
    add_heading("2. Problem Statement")
    add_para(
        "Online footwear shopping faces high return rates worldwide. Around 30% to 40% of shoes purchased online are returned, "
        "costing retailers over $240 billion annually in reverse logistics [1]. Sizing uncertainty causes more than 65% of these returns, "
        "prompting shoppers to order multiple sizes and return the rest [2]. In Bangladesh, where retailers like Bata, Apex, and local online "
        "shops rely on Cash on Delivery, returned orders cause double shipping costs and reduce profits."
    )
    add_para(
        "Existing virtual try-on solutions have clear limitations. Native mobile apps require large 150 to 300 MB downloads, leading up to "
        "80% of users to leave before testing a shoe. On the other hand, cloud-based generative AI takes 10 to 30 seconds for a single static "
        "image, lacks real-time 3D movement, and requires costly cloud servers ($0.03 to $0.05 per image)."
    )
    add_para(
        "Running augmented reality directly in a web browser introduces four technical hurdles. First, pointing the camera down at the feet "
        "crops out the upper body, causing standard pose models to lose tracking [3, 4]. Second, single-camera 2D views create depth ambiguity, "
        "making virtual shoes float or sink into the floor. Third, sensor noise causes jitter, while simple filters introduce lag during foot movement. "
        "Fourth, rigid 3D shoes look like flat stickers because real ankles cannot tuck inside the collar and the mesh cannot bend with foot arches. "
        "WebAR-Fit resolves these issues using digital signal processing: multi-tier detection cascades, 6-DoF Gram-Schmidt coordinate frames, "
        "adaptive 1-Euro filtering, 3D Thin-Plate Spline mesh morphing, and phantom depth occlusion."
    )

    # =========================================================================
    # SECTION 3: SOLUTION METHOD (Concise, 12pt)
    # =========================================================================
    add_heading("3. Solution Method")
    add_para(
        "WebAR-Fit runs entirely on the client device inside standard browsers like Safari and Chrome without installing apps. This saves "
        "server costs and protects user privacy. The system processes live camera video through an eight-stage digital signal processing and "
        "computer vision pipeline shown in Table 1."
    )

    # Table 1: Signal Processing Pipeline (Formatted for 10pt inside cells)
    table1 = doc.add_table(rows=1, cols=3)
    table1.alignment = WD_TABLE_ALIGNMENT.CENTER
    table1.autofit = False

    col_widths = [Inches(1.4), Inches(2.3), Inches(2.8)]
    hdr_cells = table1.rows[0].cells
    hdr_titles = ["Stage", "DSP / CV Technique", "Purpose & Mathematical Rationale"]
    for i, title in enumerate(hdr_titles):
        hdr_cells[i].width = col_widths[i]
        set_cell_background(hdr_cells[i], "002060")
        set_cell_margins(hdr_cells[i], top=100, bottom=100, left=120, right=120)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p.add_run(title)
        r.bold = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    pipeline_stages = [
        (
            "1. Acquisition &\nViewport Geometry",
            "RGB video stream (1280x720 @ 60 FPS), aspect-ratio cover transformation, and coordinate normalization (ndcX, ndcY).",
            "Preserves true optical focal length across variable phone screens without non-uniform digital stretching."
        ),
        (
            "2. Multi-Tier Hybrid\nLandmark Cascade",
            "Tier 1: MediaPipe Pose (GPU lite model, 33 body points, confidence >= 0.22).\n"
            "Tier 2: FootNet neural network (MobileNetV3 on WebAssembly SIMD).\n"
            "Tier 3: Optical detector (YCbCr color segmentation and 1D projection histograms).",
            "Solves downward viewing angles where the torso is missing. If the GPU pose tracker loses track, the neural or optical detector maintains tracking."
        ),
        (
            "3. 6-DoF Gram-Schmidt\nOrthogonal Basis",
            "Ray unprojection with camera intrinsics; Gram-Schmidt orthogonalization from ankle, heel, and toe coordinates:\n"
            "v_fwd = norm(P_toe - P_heel)\n"
            "v_up_raw = norm(P_ankle - P_heel)\n"
            "v_right = norm(v_up_raw x v_fwd)\n"
            "v_up = norm(v_fwd x v_right)\n"
            "R = [v_right | v_up | v_fwd] -> quat q",
            "Builds a strictly perpendicular 3D coordinate frame and rotation quaternion. Eliminates axis skewing and guarantees that forward, up, and right vectors remain fully orthogonal (v_fwd . v_up = 0) [5, 6]."
        ),
        (
            "4. Adaptive 1-Euro\nLow-Pass Filtering",
            "Speed-dependent filter on position vector P and rotation quaternion q:\n"
            "dx_hat = lowpass(dx, d_cutoff)\n"
            "cutoff = min_cutoff + beta * |dx_hat|\n"
            "alpha = 1 / (1 + tau * cutoff / dt)\n"
            "x_filtered = alpha * x + (1 - alpha) * x_prev",
            "Removes sensor noise and hand jitter during stationary stances (cutoff ~1.0 Hz), while widening filter cutoff during fast steps (beta = 0.08) to avoid tracking lag [7]."
        ),
        (
            "5. Continuous Ground\nAnchor & Memory",
            "30-frame temporal memory buffer with decay tracking and virtual floor plane constraint (Y_floor = -0.34 m).",
            "Prevents virtual shoes from disappearing during brief optical dropouts. Holds pose for 1.4 seconds and keeps shoes grounded while scanning."
        ),
        (
            "6. Non-Rigid 3D Thin-\nPlate Spline (TPS)",
            "3D Radial Basis Function surface warping with biharmonic energy kernel U(r) = r:\n"
            "f(P) = A * P + b + sum(w_i * U(||P - C_i||))\n"
            "Solves (K + lambda*I) * W = V.",
            "Bends the 3D shoe model to match individual foot contours, accommodating high arches, wider feet, and toe flex without tearing mesh polygons [8]."
        ),
        (
            "7. Phantom Z-Buffer\nDepth Occlusion",
            "Dual-pass GPU rendering:\n"
            "Pass 1: Invisible leg/ankle capsule (colorWrite = false, depthWrite = true, renderOrder = 0).\n"
            "Pass 2: Footwear mesh (renderOrder = 1).",
            "Allows real pant cuffs and ankles to naturally hide the shoe collar in the depth buffer, removing the artificial floating sticker look."
        ),
        (
            "8. Sizing & Eyewear\nDual Engine",
            "Footwear: 6-point planar homography calibration matrix, Mondopoint metric length and width calculation.\n"
            "Eyewear: FaceLandmarker (478 points), 63 mm eye distance calibration, auto temple hinge flex.",
            "Recommends exact shoe sizes (EU/US/UK) based on ISO/TS 19407 standards, while providing an integrated try-on for both shoes and glasses."
        )
    ]

    for stage_idx, (st_name, st_tech, st_purp) in enumerate(pipeline_stages):
        row = table1.add_row()
        bg = "F4F6F9" if stage_idx % 2 == 1 else "FFFFFF"
        for i, text in enumerate([st_name, st_tech, st_purp]):
            cell = row.cells[i]
            cell.width = col_widths[i]
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=70, bottom=70, left=100, right=100)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.05
            r = p.add_run(text)
            r.font.name = 'Times New Roman'
            r.font.size = Pt(9.5)
            if i == 0:
                r.bold = True

    set_table_borders(table1)
    p_t1_cap = doc.add_paragraph()
    p_t1_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t1_cap.paragraph_format.space_after = Pt(14)
    r = p_t1_cap.add_run("Table 1: Signal processing and computer vision pipeline of WebAR-Fit.")
    r.italic = True
    r.font.size = Pt(10)
    r.font.name = 'Times New Roman'

    # =========================================================================
    # SECTION 4: METHODOLOGY FLOWCHART & VALIDATION (Concise, 12pt)
    # =========================================================================
    add_heading("4. Methodology Flowchart & Experimental Validation")
    add_para(
        "Figure 1 illustrates the operational flow of WebAR-Fit. Stage A runs continuously at 60 FPS to detect and filter "
        "foot landmarks through a multi-tier cascade. When landmarks are confirmed, Stage B reconstructs the 3D coordinate "
        "frame, filters jitter, morphs the 3D mesh, applies depth occlusion, and calculates metric shoe sizing."
    )

    # Insert Flowchart Image
    flowchart_img_path = "methodology_flowchart.png"
    if os.path.exists(flowchart_img_path):
        p_img = doc.add_paragraph()
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_img.paragraph_format.space_before = Pt(6)
        p_img.paragraph_format.space_after = Pt(4)
        run_img = p_img.add_run()
        run_img.add_picture(flowchart_img_path, width=Inches(6.4))

    p_f1_cap = doc.add_paragraph()
    p_f1_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_f1_cap.paragraph_format.space_after = Pt(12)
    r = p_f1_cap.add_run("Figure 1: Complete processing pipeline of WebAR-Fit. Stage A provides resilient edge tracking, while Stage B handles 6-DoF spatial fitting, non-rigid mesh warping, depth occlusion, and metric sizing.")
    r.italic = True
    r.font.size = Pt(10)
    r.font.name = 'Times New Roman'

    add_para(
        "The tracking algorithms were evaluated on benchmark datasets, synthetic ground truth, and real camera recordings. "
        "Foot landmark accuracy was tested using keypoints from the CMU Panoptic Dataset [9] and the COCO Foot dataset (ankle, heel, "
        "big toe, small toe). Tests included different skin tones, arch types (flat, normal, high), sock styles (barefoot, solid, patterned), "
        "and floor textures (tiles, wood, carpet, concrete).",
        bold_prefix="Data and validation. "
    )
    add_para(
        "To evaluate 3D tracking error without human labeling bias, high-resolution 3D foot models were rendered in Three.js along "
        "known motion paths with camera angles between 25° and 80° at distances of 0.8 to 2.2 meters. The estimated 6-DoF poses "
        "were compared directly against known mathematical ground truth. Performance was tested on four devices: (a) iPhone 13 (Safari), "
        "(b) Google Pixel 7 (Chrome), (c) Samsung Galaxy A52 (mid-range Android), and (d) Windows 11 laptop with a 720p webcam. "
        "In addition, foot length and width measurements were taken from 30 volunteers using Brannock devices and calipers to verify sizing accuracy."
    )
    add_para(
        "Quantitative Design Targets. The target engineering specifications are: (i) sustained frame rate of at least 50 FPS on modern phones "
        "and 35 FPS on mid-range devices; (ii) Mean Per Joint Position Error under 8 mm in normal room lighting; (iii) 3D rotation error under "
        "3.5 degrees across pitch, roll, and yaw; (iv) Thin-Plate Spline mesh distortion error under 3.0 mm; (v) foot length measurement accuracy "
        "within 4.0 mm, ensuring correct shoe sizing (within half a size) in at least 90% of scans; and (vi) cold start time under 2.5 seconds over "
        "4G networks with total web assets under 15 MB. These specifications serve as objective criteria verified in testing."
    )

    # =========================================================================
    # SECTION 5: COST ESTIMATION (Concise, 12pt)
    # =========================================================================
    add_heading("5. Cost Estimation")
    add_para(
        "WebAR-Fit eliminates server compute costs because all AI models and 3D rendering run directly on the user device via "
        "WebAssembly SIMD and WebGL. Server GPU cost is BDT 0. The system uses open-source libraries: Three.js, ONNX Runtime Web, "
        "Vite, Node.js, and Google MediaPipe. Table 2 details the prototype development and physical testing budget in Dhaka."
    )

    table2 = doc.add_table(rows=1, cols=5)
    table2.alignment = WD_TABLE_ALIGNMENT.CENTER
    table2.autofit = False

    col_widths2 = [Inches(0.5), Inches(3.2), Inches(0.8), Inches(1.0), Inches(1.0)]
    hdr_cells2 = table2.rows[0].cells
    hdr_titles2 = ["#", "Component / Resource Description", "Qty", "Unit (BDT)", "Total (BDT)"]
    for i, title in enumerate(hdr_titles2):
        hdr_cells2[i].width = col_widths2[i]
        set_cell_background(hdr_cells2[i], "002060")
        set_cell_margins(hdr_cells2[i], top=100, bottom=100, left=100, right=100)
        p = hdr_cells2[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p.add_run(title)
        r.bold = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    bom_items = [
        ("1", "Vercel Edge Network / Global CDN Hosting (Static WebAssembly & Model Hosting)", "12 mos", "0 (Free Tier)", "0"),
        ("2", "SSL/TLS Wildcard Certificate & Custom Domain (pokemons.covers.bd)", "1 yr", "1,200", "1,200"),
        ("3", "Standard Brannock Foot Measuring Device (Ground-Truth Sizing Calibration)", "1 unit", "3,500", "3,500"),
        ("4", "Digital Vernier Caliper (150 mm stainless steel, metric precision +/-0.02 mm)", "1 unit", "1,150", "1,150"),
        ("5", "Multi-Surface Calibration Testbed Mats (Ceramic, Hardwood Vinyl, Carpet)", "3 mats", "650", "1,950"),
        ("6", "Adjustable Mobile Device Floor-Mount Rig (40 to 90 degree validation)", "1 unit", "1,400", "1,400"),
        ("7", "Photorealistic 3D Sneaker Assets & PBR Texture Scanning (Khronos CC-BY)", "1 set", "0 (Open Source)", "0"),
        ("8", "Lux Light Meter for ambient illuminance threshold benchmarking", "1 unit", "1,800", "1,800"),
        ("9", "Consumables, Reference Calibration Cards (A4 ISO 216 targets, markers)", "1 set", "500", "500"),
        ("10", "Subtotal", "", "", "11,500"),
        ("11", "Contingency & Emergency Re-calibration Fund @ 10%", "", "", "1,150"),
        ("12", "TOTAL IMPLEMENTATION BUDGET", "", "", "12,650")
    ]

    for stage_idx, (num, comp, qty, unit_p, tot_p) in enumerate(bom_items):
        row = table2.add_row()
        is_total = num in ["10", "11", "12"]
        bg = "EBF0F8" if is_total else ("F8F9FB" if stage_idx % 2 == 1 else "FFFFFF")
        for i, text in enumerate([num, comp, qty, unit_p, tot_p]):
            cell = row.cells[i]
            cell.width = col_widths2[i]
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=70, bottom=70, left=100, right=100)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if i >= 2 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.05
            r = p.add_run(text)
            r.font.name = 'Times New Roman'
            r.font.size = Pt(9.5)
            if is_total or i == 0:
                r.bold = True

    set_table_borders(table2)
    p_t2_cap = doc.add_paragraph()
    p_t2_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t2_cap.paragraph_format.space_after = Pt(14)
    r = p_t2_cap.add_run("Table 2: Bill of materials and cost estimation for WebAR-Fit prototype development. Server GPU compute: BDT 0.")
    r.italic = True
    r.font.size = Pt(10)
    r.font.name = 'Times New Roman'

    add_para(
        "Commercial Comparison: Proprietary enterprise virtual try-on software (such as Wannaby or Snapchat CameraKit) charges "
        "between $1,500 and $5,000 per month (approximately BDT 1,80,000 to BDT 6,00,000 per month) plus per-scan fees. In contrast, "
        "WebAR-Fit provides comparable precision and photorealism at a one-time physical testing cost of BDT 12,650 and zero ongoing cloud compute expenses."
    )

    # =========================================================================
    # SECTION 6: ALUMNI ACQUAINTANCES (Concise, 12pt)
    # =========================================================================
    add_heading("6. Alumni Acquaintances")
    add_para(
        "To maintain academic rigor and keep pace with global developments in signal processing and computer vision, advisory discussions "
        "are maintained with distinguished BUET alumni in research and academia:"
    )

    table3 = doc.add_table(rows=1, cols=3)
    table3.alignment = WD_TABLE_ALIGNMENT.CENTER
    table3.autofit = False

    col_widths3 = [Inches(1.8), Inches(2.9), Inches(1.8)]
    hdr_cells3 = table3.rows[0].cells
    hdr_titles3 = ["Name", "Current Position & Affiliation", "Contact / Profile"]
    for i, title in enumerate(hdr_titles3):
        hdr_cells3[i].width = col_widths3[i]
        set_cell_background(hdr_cells3[i], "002060")
        set_cell_margins(hdr_cells3[i], top=100, bottom=100, left=120, right=120)
        p = hdr_cells3[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p.add_run(title)
        r.bold = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    alumni_list = [
        (
            "Dr. Farah Ferdaus",
            "Assistant Professor, Department of Electrical and Computer Engineering, Lamar University, Beaumont, Texas, United States",
            "Email: fferdaus@lamar.edu"
        ),
        (
            "Asif Iftekhar Omi",
            "PhD Student and Graduate Research Assistant, Department of Electrical and Computer Engineering, University of Florida, United States",
            "Email: as.omi@ufl.edu"
        ),
        (
            "Dr. S. M. Mahbubur Rahman",
            "Professor, Department of Electrical and Electronic Engineering, Bangladesh University of Engineering & Technology (BUET)",
            "Email: mahbubur@eee.buet.ac.bd"
        )
    ]

    for idx, (a_name, a_pos, a_cont) in enumerate(alumni_list):
        row = table3.add_row()
        bg = "F8F9FB" if idx % 2 == 1 else "FFFFFF"
        for i, text in enumerate([a_name, a_pos, a_cont]):
            cell = row.cells[i]
            cell.width = col_widths3[i]
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=70, bottom=70, left=120, right=120)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.05
            r = p.add_run(text)
            r.font.name = 'Times New Roman'
            r.font.size = Pt(9.5)
            if i == 0:
                r.bold = True

    set_table_borders(table3)
    p_t3_cap = doc.add_paragraph()
    p_t3_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t3_cap.paragraph_format.space_after = Pt(14)
    r = p_t3_cap.add_run("Table 3: Academic advisors and alumni acquaintances in signal processing and computer vision.")
    r.italic = True
    r.font.size = Pt(10)
    r.font.name = 'Times New Roman'

    # =========================================================================
    # SECTION 7: REFERENCES (Concise, 12pt / 10.5pt citation text)
    # =========================================================================
    add_heading("7. References")

    references = [
        "[1] Statista Research Department (2024, Jan. 15). Return rate in fashion and apparel e-commerce worldwide: Economic impact and reverse logistics. Statista Global Consumer Insights.",
        "[2] Cullen, S., & O'Mahony, D. (2023). Footwear sizing uncertainty and customer bracketing behaviors in omnichannel retail. Journal of Retailing and Consumer Services, 72, 103289.",
        "[3] Lugaresi, C., Tang, J., Nash, H., McClanahan, C., Uboweja, E., Hays, M., Zhang, F., Chang, C.-L., Yong, M. G., Lee, J., Chang, W.-T., Hua, W., Georg, M., & Grundmann, M. (2019). MediaPipe: A framework for building perception pipelines. arXiv preprint arXiv:1906.08172.",
        "[4] Bazarevsky, V., Grishchenko, I., Raveendran, K., Zhu, T., Zhang, F., & Grundmann, M. (2020). BlazePose: On-device real-time body pose tracking. In IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR) Workshops (pp. 750–754).",
        "[5] Hartley, R., & Zisserman, A. (2004). Multiple View Geometry in Computer Vision (2nd ed.). Cambridge University Press.",
        "[6] Golub, G. H., & Van Loan, C. F. (2013). Matrix Computations (4th ed.). Johns Hopkins University Press.",
        "[7] Casiez, G., Roussel, N., & Vogel, D. (2012). 1 € filter: A simple speed-adaptive low-pass filter for noisy input in interactive systems. In Proceedings of the ACM SIGCHI Conference on Human Factors in Computing Systems (CHI '12), pp. 2527–2530.",
        "[8] Bookstein, F. L. (1989). Principal warps: Thin-plate splines and the decomposition of deformations. IEEE Transactions on Pattern Analysis and Machine Intelligence, 11(6), 567–585.",
        "[9] Joo, H., Simon, T., Li, X., Liu, H., Tan, L., Gui, L., Banerjee, S., Godisart, T. S., Nabbe, B., Matthews, I., Kanade, T., Nobuhara, S., & Sheikh, Y. (2017). Panoptic Studio: A massively multiview system for social motion capture. IEEE Transactions on Pattern Analysis and Machine Intelligence, 41(1), 181–195.",
        "[10] International Organization for Standardization (2015). ISO/TS 19407:2015 - Footwear: Sizing - Conversion of sizing systems. Geneva, Switzerland: ISO.",
        "[11] Oppenheim, A. V., & Schafer, R. W. (2010). Discrete-Time Signal Processing (3rd ed.). Pearson.",
        "[12] Proakis, J. G., & Manolakis, D. G. (2007). Digital Signal Processing: Principles, Algorithms, and Applications (4th ed.). Pearson."
    ]

    for ref in references:
        p_ref = doc.add_paragraph()
        p_ref.paragraph_format.line_spacing = 1.15
        p_ref.paragraph_format.space_after = Pt(4)
        p_ref.paragraph_format.left_indent = Inches(0.35)
        p_ref.paragraph_format.first_line_indent = Inches(-0.35)
        r = p_ref.add_run(ref)
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10.5)

    # Save to local workspace
    workspace_path = r"E:\ai box E drive\webar-shoe-vto\WebAR_Fit_BUET_Term_Project_Report.docx"
    doc.save(workspace_path)
    print(f"Report saved to workspace: {workspace_path}")

    downloads_path = r"D:\Download\Downloads\WebAR_Fit_BUET_Term_Project_Report.docx"
    try:
        doc.save(downloads_path)
        print(f"Report saved to Downloads: {downloads_path}")
    except Exception as e:
        print(f"Notice: Could not save to Downloads folder: {e}")

if __name__ == '__main__':
    create_report()
