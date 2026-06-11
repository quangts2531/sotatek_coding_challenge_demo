---
title: ZeroMatch – Electronic Symbol Detection
emoji: 🔍
colorFrom: indigo
colorTo: green
sdk: docker
app_port: 7860
---

# ⚡ ZeroMatch – Phát Hiện Linh Kiện Điện Tử Trên Bảng Mạch

[![Hugging Face Space](https://img.shields.io/badge/🤗%20Live%20Demo-HuggingFace%20Spaces-blue)](https://huggingface.co/spaces/TangSan003/detect_symbols)

> **Ứng dụng web** sử dụng mô hình **Object Detection** chạy trên **ONNX Runtime** để nhận diện và định vị các ký hiệu linh kiện điện tử trên ảnh sơ đồ mạch in (PCB / schematic). Người dùng tải ảnh lên qua giao diện web, hệ thống sẽ phát hiện, phân loại và đánh dấu vị trí từng linh kiện bằng bounding box.

---

## 📋 Mục Lục

- [Tính Năng Chính](#-tính-năng-chính)
- [Kiến Trúc Hệ Thống](#-kiến-trúc-hệ-thống)
- [Cấu Hình](#-cấu-hình)
- [Chạy Bằng Docker](#-chạy-bằng-docker)
- [Cấu Trúc Thư Mục](#-cấu-trúc-thư-mục)
- [API Endpoint](#-api-endpoint)
- [Các Loại Linh Kiện Hỗ Trợ](#-các-loại-linh-kiện-hỗ-trợ)
- [Tech Stack](#-tech-stack)

---

## 🎯 Tính Năng Chính

### 1. Phát hiện tự động trên bảng mạch
Tải lên ảnh **bảng mạch** (pattern) → hệ thống tự động phát hiện **tất cả linh kiện** có trong mạch và vẽ bounding box kèm điểm tin cậy (confidence score) lên ảnh.

### 2. Nhận diện linh kiện riêng lẻ
Tải lên ảnh **một linh kiện** (drawing) → hệ thống nhận diện loại linh kiện đó (ví dụ: điện trở, tụ điện, diode…) và trả về nhãn + confidence score.

### 3. Tìm kiếm linh kiện trên bảng mạch
Tải lên **cả hai ảnh** (bảng mạch + linh kiện), nhấn **Tìm kiếm** → hệ thống sẽ tìm và đánh dấu tất cả vị trí của loại linh kiện đó trên bảng mạch gốc. Hỗ trợ chuyển đổi giữa chế độ xem **ALL** (toàn bộ linh kiện) và **Find** (chỉ linh kiện được tìm).

### 4. Giao diện trực quan
- **Sidebar trái**: Upload ảnh, cấu hình ngưỡng tin cậy (confidence threshold), bật/tắt phân tích đa quy mô và bất biến xoay.
- **Viewport phải**: Hiển thị kết quả phát hiện với bounding box, danh sách linh kiện phát hiện được (tên + score) chia theo hai cột: Bảng mạch và Linh kiện.
- **Thanh tiến trình**: Hiển thị trạng thái xử lý real-time.
- **Ảnh mẫu**: Có sẵn ảnh điện trở và tụ điện để test nhanh.

---

## 🏗 Kiến Trúc Hệ Thống

```
┌───────────────────────────────────────────────────────┐
│                   Browser (Frontend)                  │
│    TailwindCSS (CDN) + Vanilla JS                     │
│    upload.js · detection.js · progress.js · ui.js     │
└───────────────────┬───────────────────────────────────┘
                    │  POST /api/detect/
                    │  (multipart/form-data)
                    ▼
┌───────────────────────────────────────────────────────┐
│              Django 4.2 + DRF (Backend)               │
│         Gunicorn · WhiteNoise · CORS · SQLite         │
├───────────────────────────────────────────────────────┤
│                 onnx_inference.py                      │
│   ┌─────────────────────────────────────────────┐     │
│   │  Preprocessing: resize 512×512 → normalize  │     │
│   │  ONNX Runtime (CPU) → 55 class detection    │     │
│   │  Postprocessing: NMS (OpenCV DNN)            │     │
│   │  Output: boxes + labels + scores             │     │
│   └─────────────────────────────────────────────┘     │
│   Model: keypoints_onnx_32.onnx (~230 MB, Git LFS)   │
└───────────────────────────────────────────────────────┘
```

### Luồng xử lý Inference

1. Ảnh đầu vào được resize về **512 × 512**, chuyển sang RGB, normalize `[0, 1]`.
2. ONNX model trả về 3 tensor: **bounding boxes**, **class labels**, **confidence scores**.
3. Bounding boxes được scale ngược về kích thước ảnh gốc.
4. **Non-Maximum Suppression** (NMS) qua `cv2.dnn.NMSBoxes` với IoU threshold `0.3` để loại bỏ boxes trùng.
5. Kết quả được vẽ lên ảnh và encode base64 trả về client.

---

## ⚙ Cấu Hình

### Biến Môi Trường (`.env`)

Ứng dụng sử dụng file **`.env`** tại thư mục gốc. Các biến được hỗ trợ:

| Biến | Mô tả | Giá trị mặc định |
|------|--------|-------------------|
| `DEBUG` | Bật/tắt chế độ debug của Django | `True` |
| `SECRET_KEY` | Django secret key — **bắt buộc thay đổi khi deploy production** | `django-insecure-...` |
| `ALLOWED_HOSTS` | Danh sách host được phép truy cập, phân cách bằng `,` | `*` |

**File `.env` mẫu:**

```env
DEBUG=True
SECRET_KEY=django-insecure-zeromatch-dev-key-change-in-production
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
```

### Cấu hình Django (`settings.py`)

| Tham số | Giá trị | Ghi chú |
|---------|---------|---------|
| Database | SQLite | File `db.sqlite3` tại thư mục backend |
| Timezone | `Asia/Ho_Chi_Minh` | |
| Static files | WhiteNoise | Tự động serve sau `collectstatic` |
| CORS | `CORS_ALLOW_ALL_ORIGINS = True` | Cho phép mọi origin |
| CSRF Trusted | `https://*.hf.space` | Để hoạt động trên Hugging Face |
| X-Frame-Options | `ALLOWALL` | Cho phép nhúng trong iframe (HF Spaces) |
| Max upload size | **50 MB** | `DATA_UPLOAD_MAX_MEMORY_SIZE` |

### ONNX Model

File model **`keypoints_onnx_32.onnx`** (~230 MB) được lưu tại `backend/trained_models_fs/` và theo dõi bởi **Git LFS**. Khi chạy trong Docker, ứng dụng tự động tìm model theo thứ tự ưu tiên:

1. `/models/keypoints_onnx_32.onnx` (Docker — được copy trong Dockerfile)
2. `/app/trained_models_fs/keypoints_onnx_32.onnx`
3. Đường dẫn tương đối `trained_models_fs/keypoints_onnx_32.onnx`

---

## 🐳 Chạy Bằng Docker

### Yêu Cầu

- [Docker](https://docs.docker.com/get-docker/) ≥ 20.10
- [Docker Compose](https://docs.docker.com/compose/install/) ≥ 1.29 *(tuỳ chọn)*
- [Git LFS](https://git-lfs.com/) (để pull file model `.onnx`)

### Cách 1: Docker Compose (Development)

```bash
# 1. Clone repository
git clone https://huggingface.co/spaces/TangSan003/detect_symbols
cd detect_symbols

# 2. Pull model từ LFS
git lfs pull

# 3. Chỉnh sửa file .env nếu cần
nano .env

# 4. Khởi chạy
docker compose up --build
```

Ứng dụng sẽ chạy tại **http://localhost:8000**

> **Lưu ý:** Chế độ Docker Compose sử dụng Django `runserver` với volume mount, phù hợp cho phát triển (hot-reload khi thay đổi code).

### Cách 2: Dockerfile (Production / Hugging Face Spaces)

```bash
# 1. Build image
docker build -t zeromatch .

# 2. Chạy container
docker run -p 7860:7860 \
  -e DEBUG=False \
  -e SECRET_KEY=your-secure-secret-key \
  -e ALLOWED_HOSTS=* \
  zeromatch
```

Ứng dụng sẽ chạy tại **http://localhost:7860**

> Dockerfile gốc (root) tự động chạy `migrate` + `collectstatic` trong quá trình build và sử dụng **Gunicorn** (2 workers) làm WSGI server.

### So sánh hai chế độ

| | Docker Compose | Dockerfile (root) |
|---|---|---|
| Server | Django `runserver` | Gunicorn (2 workers) |
| Port | `8000` | `7860` |
| Volume mount | ✅ (hot-reload) | ❌ |
| Static files | Django serve | WhiteNoise + `collectstatic` |
| DB migration | Thủ công | Tự động khi build |
| Mục đích | **Development** | **Production / HF Spaces** |

---

## 📁 Cấu Trúc Thư Mục

```
.
├── Dockerfile                  # Production Dockerfile (Hugging Face Spaces)
├── docker-compose.yml          # Development Docker Compose
├── .env                        # Biến môi trường
├── .gitattributes              # Git LFS tracking cho file .onnx
├── .gitignore
│
└── backend/
    ├── manage.py               # Django CLI
    ├── requirements.txt        # Python dependencies
    ├── onnx_inference.py       # ONNX inference + NMS pipeline
    ├── dockerfile              # Backend-only Dockerfile (dùng bởi docker-compose)
    │
    ├── trained_models_fs/      # Model ONNX (~230 MB, Git LFS)
    │   └── keypoints_onnx_32.onnx
    │
    ├── core/                   # Django project config
    │   ├── settings.py         # Cấu hình chính (DB, CORS, static, upload...)
    │   ├── urls.py             # Root URL routing
    │   └── wsgi.py             # WSGI entry point
    │
    ├── api/                    # Django REST API
    │   ├── views.py            # Logic: index, detect (single/dual mode)
    │   └── urls.py             # API URL routing
    │
    ├── templates/              # Django HTML templates
    │   ├── base.html           # Layout chính (sidebar + viewport + scripts)
    │   └── index.html          # Trang kết quả detection
    │
    ├── static/
    │   ├── css/main.css        # Custom CSS bổ sung
    │   ├── js/
    │   │   ├── ui.js           # Sidebar interactions, system status
    │   │   ├── upload.js       # Drag-drop & file upload handling
    │   │   ├── progress.js     # Progress bar animation
    │   │   └── detection.js    # API call, result rendering, tab switching
    │   └── image/              # Ảnh mẫu tĩnh
    │
    └── image/                  # Ảnh test (điện trở, tụ điện)
```

---

## 🔌 API Endpoint

### `POST /api/detect/`

Nhận ảnh và trả về kết quả phát hiện linh kiện.

**Content-Type:** `multipart/form-data`

| Field | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `pattern` | file (image) | Không* | Ảnh bảng mạch gốc |
| `drawing` | file (image) | Không* | Ảnh linh kiện cần tìm |

> \* Ít nhất một trong hai field phải có giá trị.

**Ba chế độ hoạt động:**

| Chế độ | Input | Hành vi |
|--------|-------|---------|
| Chỉ bảng mạch | `pattern` only | Phát hiện tất cả linh kiện trên bảng mạch |
| Chỉ linh kiện | `drawing` only | Nhận diện loại linh kiện (giữ best score) |
| Tìm kiếm | `pattern` + `drawing` | Phát hiện linh kiện trên bảng mạch, lọc theo loại linh kiện đã nhận diện |

**Response mẫu (JSON):**

```json
{
  "success": true,
  "pattern_image": "data:image/png;base64,...",
  "pattern_image_all_boxes": "data:image/png;base64,...",
  "pattern_image_filtered": "data:image/png;base64,...",
  "pattern_targets": [
    { "label": "resistor", "score": 0.952, "box": [120, 45, 280, 110] }
  ],
  "pattern_total_found": 5,
  "drawing_image": "data:image/png;base64,...",
  "drawing_targets": [
    { "label": "resistor", "score": 0.987, "box": [10, 8, 150, 95] }
  ],
  "drawing_total_found": 1,
  "inference_time_ms": 320
}
```

---

## 🔧 Các Loại Linh Kiện Hỗ Trợ

Mô hình nhận diện **55 loại linh kiện điện tử**, bao gồm:

| Nhóm | Linh kiện |
|------|-----------|
| **Thụ động** | `resistor`, `capacitor`, `capacitor_polarized`, `variable_capacitor`, `inductor`, `iron_core_inductor`, `variable_resistor`, `potentiometer`, `thermistor` |
| **Bán dẫn** | `diode`, `led`, `schottky_zener_diode`, `transistor`, `npn_transistor`, `pnp_transistor`, `mosfet` |
| **Nguồn** | `voltage_source`, `current_source`, `ac_current`, `dependant_current`, `dependant_voltage`, `ground` |
| **Cổng logic** | `and_gate`, `or_gate`, `not_gate`, `nand_gate`, `nor_gate`, `xor_gate`, `xnor_gate` |
| **Khuếch đại** | `operational_amplifier`, `amplifier` |
| **Chuyển mạch** | `switch`, `connector` |
| **Biến áp / Cuộn** | `transformer` |
| **Bảo vệ** | `fuse` |
| **Đo lường** | `amperimeter`, `voltimeter`, `wattimeter`, `ohmmeter`, `galvanometer`, `frequency_meter` |
| **Hiển thị / Âm thanh** | `light`, `speaker`, `buzzer`, `electric_bell`, `7_segments`, `microphone` |
| **Khác** | `antenna`, `crystal`, `generator`, `motor`, `ldr`, `heating_element`, `magnetron`, `clock`, `box`, `volt`, `unknown`, `not_duplicate` |

---

## 🛠 Tech Stack

| Layer | Công nghệ | Phiên bản |
|-------|-----------|-----------|
| Frontend | HTML + TailwindCSS (CDN) + Vanilla JavaScript | — |
| Typography | Space Grotesk + JetBrains Mono (Google Fonts) | — |
| Backend | Django + Django REST Framework | 4.2.9 / 3.14.0 |
| Inference | ONNX Runtime (CPU) | 1.17.1 |
| Image Processing | OpenCV (headless) + NumPy + Pillow | 4.9.0 / 1.26.4 / 10.2.0 |
| WSGI Server | Gunicorn | 21.2.0 |
| Static Files | WhiteNoise | 6.6.0 |
| CORS | django-cors-headers | 4.3.1 |
| Containerization | Docker + Docker Compose | — |
| Model Storage | Git LFS | — |
| Hosting | Hugging Face Spaces (Docker SDK) | — |

---

## 📜 License

*(Sẽ được bổ sung.)*

---

*Được phát triển phục vụ Sotatek Coding Challenge.*
