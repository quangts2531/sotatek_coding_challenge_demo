window.AppState = window.AppState || {};

window.showPatternPreview = function(src, filename) {
    const emptyEl = document.getElementById('pattern-empty');
    const previewEl = document.getElementById('pattern-preview');
    const imgEl = document.getElementById('pattern-img');
    const nameEl = document.getElementById('pattern-filename');

    if (emptyEl) emptyEl.classList.add('hidden');
    if (previewEl) previewEl.classList.remove('hidden');
    if (imgEl) imgEl.src = src;
    if (nameEl) nameEl.textContent = filename;
};

window.resetPatternUpload = function() {
    window.patternFile = null;
    const emptyEl = document.getElementById('pattern-empty');
    const previewEl = document.getElementById('pattern-preview');
    const imgEl = document.getElementById('pattern-img');
    const nameEl = document.getElementById('pattern-filename');
    const input = document.getElementById('pattern-input');

    if (emptyEl) emptyEl.classList.remove('hidden');
    if (previewEl) previewEl.classList.add('hidden');
    if (imgEl) imgEl.src = '';
    if (nameEl) nameEl.textContent = '';
    if (input) input.value = '';
};

// ── Upload zone factory ─────────────────────────────────────────────
function setupUploadZone({ zoneId, inputId, emptyId, previewId, imgId, filenameId, removeId, fileKey, truncateLen }) {
    const zone = document.getElementById(zoneId);
    if (!zone) return;
    const input = document.getElementById(inputId);
    const emptyEl = document.getElementById(emptyId);
    const previewEl = document.getElementById(previewId);
    const imgEl = document.getElementById(imgId);
    const nameEl = document.getElementById(filenameId);
    const removeBtn = document.getElementById(removeId);

    function truncate(name, max) {
        return name.length > max ? name.slice(0, max - 1) + '…' : name;
    }

    function applyFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            window.showToast('Vui lòng chọn file ảnh hợp lệ (PNG, JPG...).');
            return;
        }
        window[fileKey] = file;
        const url = URL.createObjectURL(file);
        imgEl.src = url;
        nameEl.textContent = truncate(file.name, truncateLen);
        emptyEl.classList.add('hidden');
        previewEl.classList.remove('hidden');

        // Auto-trigger detection when pattern (bảng mạch) image is loaded
        if (fileKey === 'patternFile' && window.patternFile) {
            console.log('[AutoDetect] Pattern image updated, triggering inference...');
            if (window.autoDetect) window.autoDetect();
        }
    }

    function resetZone() {
        window[fileKey] = null;
        imgEl.src = '';
        input.value = '';
        previewEl.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        zone.style.borderColor = '';
        zone.style.boxShadow = '';
    }

    // Click zone → open file picker
    zone.addEventListener('click', (e) => {
        if (e.target.closest('#' + removeId)) return; // don't bubble from X
        input.click();
    });

    // File input change
    input.addEventListener('change', () => {
        if (input.files && input.files[0]) applyFile(input.files[0]);
    });

    // Remove button — stop propagation so click doesn't reopen picker
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetZone();
    });

    // Drag & drop
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.style.borderColor = '#4F8EF7';
        zone.style.boxShadow = '0 0 0 3px rgba(79,142,247,0.25)';
    });
    zone.addEventListener('dragleave', () => {
        zone.style.borderColor = '';
        zone.style.boxShadow = '';
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.style.borderColor = '';
        zone.style.boxShadow = '';
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) applyFile(file);
    });
}

// ── Init both zones ─────────────────────────────────────────────────
setupUploadZone({
    zoneId: 'pattern-zone', inputId: 'pattern-input',
    emptyId: 'pattern-empty', previewId: 'pattern-preview',
    imgId: 'pattern-img', filenameId: 'pattern-filename',
    removeId: 'pattern-remove', fileKey: 'patternFile', truncateLen: 22
});

setupUploadZone({
    zoneId: 'drawing-zone', inputId: 'drawing-input',
    emptyId: 'drawing-empty', previewId: 'drawing-preview',
    imgId: 'drawing-img', filenameId: 'drawing-filename',
    removeId: 'drawing-remove', fileKey: 'drawingFile', truncateLen: 14
});

// Also deselect example if the manual close button of pattern-preview is clicked
const patternRemoveBtn = document.getElementById('pattern-remove');
if (patternRemoveBtn) {
    patternRemoveBtn.addEventListener('click', () => {
        window.AppState.selectedExample = null;
        if(window.resetExampleButtons) window.resetExampleButtons();
    });
}

// Deselect example if a file is uploaded manually
const patternInput = document.getElementById('pattern-input');
if (patternInput) {
    patternInput.addEventListener('change', () => {
        if (patternInput.files && patternInput.files[0]) {
            window.AppState.selectedExample = null;
            if(window.resetExampleButtons) window.resetExampleButtons();
        }
    });
}
const patternZone = document.getElementById('pattern-zone');
if (patternZone) {
    patternZone.addEventListener('drop', () => {
        window.AppState.selectedExample = null;
        if(window.resetExampleButtons) window.resetExampleButtons();
    });
}

window.autoDetect = async function() {
  // Only run if pattern (bảng mạch) image exists
  if (!window.patternFile) return;

  console.log('[AutoDetect] Starting...');
  
  // Start progress animation
  if (window.startProgress) window.startProgress();
  
  // Update status
  updateInferenceState('PROCESSING');

  // Build FormData — send pattern image
  const formData = new FormData();
  formData.append('pattern', window.patternFile);

  try {
    const response = await fetch('/api/detect/', {
      method: 'POST',
      body: formData,
      headers: {
        'X-CSRFToken': window.getCookie ? window.getCookie('csrftoken') : ''
      }
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Inference failed');
    }

    // Complete progress
    if (window.completeProgress) window.completeProgress();
    updateInferenceState('COMPLETE');

    // Display result image in VIEW panel (right side)
    showResultImage(data.result_image);

    // Update targets/detections info
    showDetectionResults(data);

    // Log results
    if (window.logMessage) {
        window.logMessage('SUCCESS', 'Phát hiện xong: ' + data.total_found + ' kết quả');
        window.logMessage('INFO', 'Targets: ' + JSON.stringify(data.targets));
        window.logMessage('INFO', 'Inference time: ' + data.inference_time_ms + 'ms');
    }

    // Switch to VIEW tab
    if (window.switchTab) window.switchTab('view');

    if (window.showToast) window.showToast('Phát hiện ' + data.total_found + ' kết quả', 'success');

  } catch (error) {
    if (window.stopProgress) window.stopProgress();
    updateInferenceState('ERROR');
    if (window.showToast) window.showToast('Lỗi: ' + error.message, 'error');
    if (window.logMessage) window.logMessage('ERROR', 'AutoDetect failed: ' + error.message);
    console.error('[AutoDetect] Error:', error);
  }
}

function showResultImage(base64Image) {
  // Find or create result display area in VIEW tab
  const viewPanel = document.getElementById('view-panel') 
                 || document.querySelector('[data-tab="view"]')
                 || document.querySelector('.view-content')
                 || document.getElementById('result-content');
  
  if (!viewPanel) return;

  // Hide empty state
  const emptyState = viewPanel.querySelector('[id*="empty"], [class*="empty"]')
                  || document.getElementById('result-empty');
  if (emptyState) {
      emptyState.style.display = 'none';
      emptyState.classList.add('hidden');
  }

  // Show result image
  let resultImg = document.getElementById('result-image');
  if (!resultImg) {
    resultImg = document.createElement('img');
    resultImg.id = 'result-image';
    resultImg.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 8px;
    `;
    viewPanel.appendChild(resultImg);
  }

  resultImg.src = base64Image;
  resultImg.style.display = 'block';
  viewPanel.classList.remove('hidden');
}

function showDetectionResults(data) {
  // Update total found badge if exists
  const badge = document.getElementById('detection-count')
             || document.querySelector('[id*="total"], [class*="count"]')
             || document.getElementById('result-count');
  if (badge) {
      badge.textContent = data.total_found + ' kết quả';
  }

  // Update LIST tab if exists
  const listPanel = document.getElementById('list-panel')
                 || document.querySelector('[data-tab="list"]');
  if (listPanel && data.targets) {
    listPanel.innerHTML = `
      <div style="padding:16px;font-family:monospace;color:#e2e8f0">
        <p style="color:#8892A4;margin-bottom:8px">Total: ${data.total_found}</p>
        <pre style="color:#4F8EF7;font-size:12px;overflow:auto">
${JSON.stringify(data.targets, null, 2)}
        </pre>
      </div>
    `;
  }

  // Update result-targets (for current index.html layout compatibility)
  const resultTargets = document.getElementById('result-targets');
  if (resultTargets && data.targets) {
      resultTargets.innerHTML = '';
      if (data.targets.length > 0) {
          data.targets.forEach((t, i) => {
              const row = document.createElement('div');
              row.className = 'flex items-center gap-3 py-1.5 px-2 rounded hover:bg-surface-variant/30';
              row.innerHTML = `
                  <span class="text-[10px] text-industrial-gray w-5">#${i + 1}</span>
                  <span class="text-xs text-primary font-bold flex-1">${t.label}</span>
                  <span class="text-[10px] text-on-surface-variant">${(t.score * 100).toFixed(1)}%</span>
                  <span class="text-[10px] text-industrial-gray">[${t.box.join(', ')}]</span>
              `;
              resultTargets.appendChild(row);
          });
      } else {
          resultTargets.innerHTML = '<div class="text-xs text-industrial-gray py-2">Không phát hiện linh kiện nào</div>';
      }
  }
}

function updateInferenceState(state) {
  const stateEl = document.querySelector('[id*="inference-state"], [class*="inference-state"]')
               || document.getElementById('inference-state');
  if (!stateEl) return;
  
  const colors = {
    'READY_TO_INFER': '#8892A4',
    'PROCESSING': '#4F8EF7',
    'COMPLETE': '#00C48C',
    'ERROR': '#FF4444'
  };
  
  stateEl.textContent = state;
  stateEl.style.color = colors[state] || '#8892A4';
}

