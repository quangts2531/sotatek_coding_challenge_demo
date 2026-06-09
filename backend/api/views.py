from django.shortcuts import render
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
import time

def index(request):
    return render(request, 'index.html')

@api_view(['POST'])
@parser_classes([MultiPartParser])
def detect(request):
    pattern_image = request.FILES.get('pattern')
    drawing_image = request.FILES.get('drawing')

    if not pattern_image or not drawing_image:
        return Response({'error': 'Missing images'}, status=400)

    # Placeholder — sẽ thay bằng model thật sau
    time.sleep(1)

    return Response({
        'detections': [
            {'id': 1, 'bbox': [120, 340, 48, 52], 'confidence': 0.94},
            {'id': 2, 'bbox': [450, 210, 50, 49], 'confidence': 0.88},
        ],
        'total_found': 2,
        'inference_time_ms': 1000
    })