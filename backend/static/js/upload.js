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
        if (window.updateSystemReadyStatus) window.updateSystemReadyStatus();
        const url = URL.createObjectURL(file);
        imgEl.src = url;
        nameEl.textContent = truncate(file.name, truncateLen);
        emptyEl.classList.add('hidden');
        previewEl.classList.remove('hidden');

        // Auto-trigger detection ONLY when pattern image is loaded
        if (fileKey === 'patternFile') {
            console.log('[AutoDetect] Pattern image loaded, triggering inference...');
            if (window.runDetection) window.runDetection(true);
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

        if (fileKey === 'patternFile') {
            const tabsContainer = document.getElementById('image-view-tabs');
            if (tabsContainer) tabsContainer.classList.add('hidden');
            
            const emptyState = document.getElementById('result-empty');
            const resultContent = document.getElementById('result-content');
            if (emptyState) emptyState.classList.remove('hidden');
            if (resultContent) resultContent.classList.add('hidden');
        } else if (fileKey === 'drawingFile') {
            const tabFiltered = document.getElementById('view-tab-filtered');
            if (tabFiltered) tabFiltered.classList.add('hidden');
            if (window.selectTab) window.selectTab('all');
        }
        if (window.updateSystemReadyStatus) window.updateSystemReadyStatus();
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

// All detection logic is now unified in detection.js (runDetection)

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

