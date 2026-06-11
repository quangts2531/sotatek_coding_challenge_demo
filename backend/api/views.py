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
from onnx_inference import onnx_inference

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

@api_view(['POST'])
@parser_classes([MultiPartParser])
def detect(request):
    try:
        start_time = time.time()

        # Get image file — accept 'pattern' or 'drawing' field
        drawing_file = request.FILES.get('pattern') or request.FILES.get('drawing')
        if not drawing_file:
            return Response({'success': False, 'error': 'Missing image'}, status=400)

        # Save drawing to temp file
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            for chunk in drawing_file.chunks():
                f.write(chunk)
            drawing_path = f.name

        print(f'[detect] Drawing saved to: {drawing_path}')
        print(f'[detect] ONNX path: {ONNX_PATH}')
        print(f'[detect] ONNX exists: {os.path.exists(ONNX_PATH)}')

        # Load image with cv2 — same as onnx_inference.py does
        image = cv2.imread(drawing_path)
        
        if image is None:
            os.unlink(drawing_path)
            raise ValueError(f'cv2.imread failed for: {drawing_path}')
        
        print(f'[detect] Image shape: {image.shape}')

        # Call onnx_inference — returns (image, targets_dict)
        result_image, targets_raw = onnx_inference(image, ONNX_PATH)

        print(f'[detect] Result image shape: {result_image.shape}')

        # Convert result image to base64
        _, buffer = cv2.imencode('.png', result_image)
        result_b64 = base64.b64encode(buffer).decode('utf-8')

        # Cleanup
        os.unlink(drawing_path)

        inference_time = int((time.time() - start_time) * 1000)

        # Build serializable targets list from the dict
        # targets_raw = {"boxes": [...], "labels": np.array, "scores": np.array}
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

        print(f'[detect] Found {len(targets_list)} targets')

        return Response({
            'success': True,
            'result_image': 'data:image/png;base64,' + result_b64,
            'targets': targets_list,
            'total_found': len(targets_list),
            'inference_time_ms': inference_time,
        })

    except Exception as e:
        print(f'[detect] ERROR: {e}')
        import traceback
        traceback.print_exc()
        # Cleanup if temp file exists
        try: os.unlink(drawing_path)
        except: pass
        return Response({'success': False, 'error': str(e)}, status=500)