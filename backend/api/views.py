import os
import sys
import cv2
import numpy as np
import base64
import tempfile
import time
from django.shortcuts import render
from django.conf import settings
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

def index(request):
    return render(request, 'index.html')

# onnx_inference.py lives at /app/onnx_inference.py (same level as manage.py)
from onnx_inference import onnx_inference, detect_symbols_with_onnx, rectangle_result

# Auto-detect ONNX model path — search multiple locations
_ONNX_CANDIDATES = [
    '/models/keypoints_onnx_32.onnx',
    '/app/trained_models_fs/keypoints_onnx_32.onnx',
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'trained_models_fs', 'keypoints_onnx_32.onnx'),
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'trained_models_fs', 'keypoints_onnx_32.onnx'),
    'trained_models_fs/keypoints_onnx_32.onnx',
]
ONNX_PATH = None
for _p in _ONNX_CANDIDATES:
    if os.path.isfile(_p):
        ONNX_PATH = _p
        break
print(f'[detect] ONNX_PATH resolved to: {ONNX_PATH}')
if ONNX_PATH is None:
    print(f'[detect] WARNING: ONNX model not found! Searched: {_ONNX_CANDIDATES}')
    # List directories to help debug
    for d in ['/models', '/app', '/app/trained_models_fs']:
        if os.path.isdir(d):
            print(f'[detect]   {d}/ contains: {os.listdir(d)}')
# Auto-copy images from backend/image to backend/static/image at startup
import shutil
try:
    src_dir = os.path.join(settings.BASE_DIR, 'image')
    dst_dir = os.path.join(settings.BASE_DIR, 'static', 'image')
    if os.path.exists(src_dir):
        os.makedirs(dst_dir, exist_ok=True)
        for fname in os.listdir(src_dir):
            src_file = os.path.join(src_dir, fname)
            dst_file = os.path.join(dst_dir, fname)
            if os.path.isfile(src_file) and not os.path.exists(dst_file):
                shutil.copy(src_file, dst_file)
                print(f'[Startup] Copied {src_file} to {dst_file}')
except Exception as e:
    print(f'[Startup] Failed to copy images: {e}')
# Class labels matching the ONNX model output
CLASSES = [
    "capacitor", "current_source", "ac_current", "voltage_source", "inductor",
    "resistor", "ground", "dependant_current", "dependant_voltage", "transistor",
    "diode", "mosfet", "switch", "transformer", "led", "potentiometer",
    "schottky_zener_diode", "thermistor", "variable_resistor", "motor",
    "operational_amplifier", "amplifier", "crystal", "fuse", "generator",
    "ldr", "light", "microphone", "nand_gate", "nor_gate", "and_gate",
    "or_gate", "xnor_gate", "xor_gate", "not_gate", "npn_transistor",
    "pnp_transistor", "capacitor_polarized", "iron_core_inductor", "antenna",
    "speaker", "buzzer", "variable_capacitor", "connector", "heating_element",
    "unknown", "7_segments", "amperimeter", "galvanometer", "volt",
    "voltimeter", "wattimeter", "box", "clock", "electric_bell",
    "frequency_meter", "magnetron", "not_duplicate", "ohmmeter",
]

def serialize_targets(targets_raw):
    targets_list = []
    if isinstance(targets_raw, dict):
        raw_boxes = targets_raw.get('boxes', [])
        raw_labels = targets_raw.get('labels', [])
        raw_scores = targets_raw.get('scores', [])
        for i in range(len(raw_boxes)):
            label_idx = int(raw_labels[i]) if i < len(raw_labels) else 0
            label_name = CLASSES[label_idx] if label_idx < len(CLASSES) else 'unknown'
            targets_list.append({
                'label': label_name,
                'score': round(float(raw_scores[i]), 3) if i < len(raw_scores) else 0,
                'box': [int(x) for x in raw_boxes[i]],
            })
    elif isinstance(targets_raw, list):
        targets_list = targets_raw
    return targets_list

def process_single_image(file_obj, onnx_path, keep_best=False):
    if not file_obj:
        return None, []
    
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        for chunk in file_obj.chunks():
            f.write(chunk)
        temp_path = f.name

    try:
        image = cv2.imread(temp_path)
        if image is None:
            raise ValueError(f'cv2.imread failed for: {temp_path}')
        
        result_image, targets_raw = detect_symbols_with_onnx(image, onnx_path)
        
        if keep_best and targets_raw and len(targets_raw.get("scores", [])) > 0:
            best_idx = int(np.argmax(targets_raw["scores"]))
            targets_raw = {
                "boxes": [targets_raw["boxes"][best_idx]],
                "labels": [targets_raw["labels"][best_idx]],
                "scores": [targets_raw["scores"][best_idx]],
            }
            
        result_image_drawn = rectangle_result(result_image, targets_raw, isfind=False)
        
        _, buffer = cv2.imencode('.png', result_image_drawn)
        result_b64 = base64.b64encode(buffer).decode('utf-8')
        
        targets_list = serialize_targets(targets_raw)
            
        return 'data:image/png;base64,' + result_b64, targets_list
    finally:
        try:
            os.unlink(temp_path)
        except:
            pass

@api_view(['POST'])
@parser_classes([MultiPartParser])
def detect(request):
    try:
        start_time = time.time()

        pattern_file = request.FILES.get('pattern')
        drawing_file = request.FILES.get('drawing')

        if not pattern_file and not drawing_file:
            return Response({'success': False, 'error': 'Missing pattern or drawing image'}, status=400)

        pattern_b64, pattern_targets = None, []
        drawing_b64, drawing_targets = None, []

        pattern_all_boxes_b64 = None
        pattern_filtered_b64 = None

        if pattern_file and drawing_file:
            # Mode 3: Both pattern and drawing are present (Search clicked)
            print(f'[detect] Processing BOTH pattern and drawing (Search Mode)...')
            
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f_pat:
                for chunk in pattern_file.chunks():
                    f_pat.write(chunk)
                pat_path = f_pat.name
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f_drw:
                for chunk in drawing_file.chunks():
                    f_drw.write(chunk)
                drw_path = f_drw.name

            try:
                pattern_img = cv2.imread(pat_path)
                drawing_img = cv2.imread(drw_path)

                if pattern_img is None or drawing_img is None:
                    raise ValueError("Failed to read pattern or drawing image")

                # 1. Run detection on Bảng mạch
                pat_res_img, first_targets = detect_symbols_with_onnx(pattern_img, ONNX_PATH)
                # 2. Run detection on Linh kiện
                drw_res_img, second_targets = detect_symbols_with_onnx(drawing_img, ONNX_PATH)

                # Keep only the best target (highest score) for Linh kiện
                if second_targets and len(second_targets.get("scores", [])) > 0:
                    best_idx = int(np.argmax(second_targets["scores"]))
                    second_targets = {
                        "boxes": [second_targets["boxes"][best_idx]],
                        "labels": [second_targets["labels"][best_idx]],
                        "scores": [second_targets["scores"][best_idx]],
                    }

                # 3. Draw ALL boxes on a copy for the "ALL" tab
                all_boxes_img = rectangle_result(pat_res_img.copy(), first_targets, isfind=False)
                _, all_buf = cv2.imencode('.png', all_boxes_img)
                pattern_all_boxes_b64 = 'data:image/png;base64,' + base64.b64encode(all_buf).decode('utf-8')

                # 4. Draw FILTERED boxes on the original for the "Find" tab
                rectangle_image = rectangle_result(pat_res_img, first_targets, second_targets)
                _, pat_buffer = cv2.imencode('.png', rectangle_image)
                pattern_filtered_b64 = 'data:image/png;base64,' + base64.b64encode(pat_buffer).decode('utf-8')

                # Use filtered as the primary display
                pattern_b64 = pattern_filtered_b64

                # 5. Draw boxes on component drawing for display
                drw_rectangle_image = rectangle_result(drw_res_img, second_targets, isfind=False)
                _, drw_buffer = cv2.imencode('.png', drw_rectangle_image)
                drawing_b64 = 'data:image/png;base64,' + base64.b64encode(drw_buffer).decode('utf-8')

                # 6. Filter targets to match the drawn rectangles
                filtered_pat_targets = {
                    "boxes": [],
                    "labels": [],
                    "scores": []
                }
                if len(second_targets.get("labels", [])) > 0:
                    label = int(second_targets["labels"][0])
                    for i in range(len(first_targets.get("boxes", []))):
                        if int(first_targets["labels"][i]) == label:
                            filtered_pat_targets["boxes"].append(first_targets["boxes"][i])
                            filtered_pat_targets["labels"].append(first_targets["labels"][i])
                            filtered_pat_targets["scores"].append(first_targets["scores"][i])

                pattern_targets = serialize_targets(filtered_pat_targets)
                drawing_targets = serialize_targets(second_targets)

            finally:
                for path in [pat_path, drw_path]:
                    try:
                        os.unlink(path)
                    except:
                        pass
        else:
            # Mode 1: Only pattern_file or only drawing_file is present
            if pattern_file:
                print(f'[detect] Processing pattern (circuit board) image only...')
                pattern_b64, pattern_targets = process_single_image(pattern_file, ONNX_PATH, keep_best=False)
                pattern_all_boxes_b64 = pattern_b64
            if drawing_file:
                print(f'[detect] Processing drawing (component) image only...')
                drawing_b64, drawing_targets = process_single_image(drawing_file, ONNX_PATH, keep_best=True)

        inference_time = int((time.time() - start_time) * 1000)

        print(f'[detect] Done! Pattern targets: {len(pattern_targets)}, Drawing targets: {len(drawing_targets)}')

        return Response({
            'success': True,
            'pattern_image': pattern_b64,
            'pattern_image_all_boxes': pattern_all_boxes_b64,
            'pattern_image_filtered': pattern_filtered_b64,
            'pattern_targets': pattern_targets,
            'pattern_total_found': len(pattern_targets),
            'drawing_image': drawing_b64,
            'drawing_targets': drawing_targets,
            'drawing_total_found': len(drawing_targets),
            # Backwards compatibility
            'result_image': pattern_b64 or drawing_b64,
            'targets': pattern_targets or drawing_targets,
            'total_found': len(pattern_targets) if pattern_file else len(drawing_targets),
            'inference_time_ms': inference_time,
        })

    except Exception as e:
        print(f'[detect] ERROR: {e}')
        import traceback
        traceback.print_exc()
        return Response({'success': False, 'error': str(e)}, status=500)