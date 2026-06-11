window.getCookie = function(name) {
    const value = '; ' + document.cookie;
    const parts = value.split('; ' + name + '=');
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
};

window.runDetection = async function(isAutoTrigger = false) {
    if (isAutoTrigger instanceof Event) {
        isAutoTrigger = false;
    }

    if (isAutoTrigger) {
        // Auto-trigger on board upload: only require board
        if (!window.patternFile) return;
    } else {
        // Manual search click: require BOTH board and component
        if (!window.patternFile || !window.drawingFile) {
            window.showToast('Đang thiếu ảnh', 'error');
            return;
        }
    }

    if (window.AppState && window.AppState.isProcessing) return;
    if (window.AppState) window.AppState.isProcessing = true;

    window.startProgress();

    // Send pattern and optional drawing images
    const formData = new FormData();
    formData.append('pattern', window.patternFile);
    if (!isAutoTrigger && window.drawingFile) {
        formData.append('drawing', window.drawingFile);
    }
    formData.append('confidence_threshold', window.AppState?.confidence || 0.5);

    try {
        const response = await fetch('/api/detect/', {
            method: 'POST',
            body: formData,
            headers: {
                'X-CSRFToken': window.getCookie('csrftoken')
            }
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Server error');
        }

        window.completeProgress();

        // ── Show result ──────────────────────────────────────────
        const emptyState = document.getElementById('result-empty');
        const resultContent = document.getElementById('result-content');
        const resultImage = document.getElementById('result-image');
        
        const patternResultTargets = document.getElementById('result-targets');
        const patternResultCount = document.getElementById('pattern-result-count');
        
        const drawingResultTargets = document.getElementById('drawing-result-targets');
        const drawingResultCount = document.getElementById('drawing-result-count');

        // Hide empty state, show result
        if (emptyState) emptyState.classList.add('hidden');
        if (resultContent) resultContent.classList.remove('hidden');

        // Display the result image with bounding boxes via tabs
        if (data.pattern_image_all_boxes) {
            window.updateViewTabs(data.pattern_image_all_boxes, data.pattern_image_filtered);
        } else if (resultImage && data.pattern_image) {
            resultImage.src = data.pattern_image;
        }

        // Display Bảng mạch targets list
        if (patternResultTargets) {
            patternResultTargets.innerHTML = '';
            const patternList = data.pattern_targets || [];
            if (patternList.length > 0) {
                patternList.forEach((t, i) => {
                    const row = document.createElement('div');
                    row.className = 'flex items-center gap-2 py-1.5 px-1 rounded hover:bg-surface-variant/30';
                    row.innerHTML = `
                        <span class="text-[9px] text-industrial-gray w-4">#${i + 1}</span>
                        <span class="text-xs text-primary font-bold flex-1 truncate" title="${t.label}">${t.label}</span>
                        <span class="text-[9px] text-on-surface-variant">${(t.score * 100).toFixed(0)}%</span>
                        <span class="text-[9px] text-industrial-gray font-mono">[${t.box.slice(0, 2).join(',')}]</span>
                    `;
                    patternResultTargets.appendChild(row);
                });
            } else {
                patternResultTargets.innerHTML = '<div class="text-[11px] text-industrial-gray py-2">Không phát hiện mẫu nào</div>';
            }
            if (patternResultCount) {
                patternResultCount.textContent = patternList.length + ' found';
            }
        }

        // Display Linh kiện targets list
        if (drawingResultTargets) {
            drawingResultTargets.innerHTML = '';
            const drawingList = data.drawing_targets || [];
            if (drawingList.length > 0) {
                drawingList.forEach((t, i) => {
                    const row = document.createElement('div');
                    row.className = 'flex items-center gap-2 py-1.5 px-1 rounded hover:bg-surface-variant/30';
                    row.innerHTML = `
                        <span class="text-[9px] text-industrial-gray w-4">#${i + 1}</span>
                        <span class="text-xs text-secondary font-bold flex-1 truncate" title="${t.label}">${t.label}</span>
                        <span class="text-[9px] text-on-surface-variant">${(t.score * 100).toFixed(0)}%</span>
                        <span class="text-[9px] text-industrial-gray font-mono">[${t.box.slice(0, 2).join(',')}]</span>
                    `;
                    drawingResultTargets.appendChild(row);
                });
            } else {
                drawingResultTargets.innerHTML = '<div class="text-[11px] text-industrial-gray py-2">Không phát hiện mẫu nào</div>';
            }
            if (drawingResultCount) {
                drawingResultCount.textContent = drawingList.length + ' found';
            }
        }

        window.logMessage('SUCCESS', 'Detection complete');
        window.logMessage('INFO', `Pattern targets: ${data.pattern_total_found}, Drawing targets: ${data.drawing_total_found}`);

        window.showToast(`Phát hiện: Bảng mạch (${data.pattern_total_found}) | Linh kiện (${data.drawing_total_found})`, 'success');

    } catch (error) {
        window.stopProgress();
        window.showToast('Lỗi: ' + error.message, 'error');
        window.logMessage('ERROR', error.message);
        console.error('Detection error:', error);
    } finally {
        if (window.AppState) window.AppState.isProcessing = false;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('run-detection-btn');
    if (btn) {
        btn.addEventListener('click', window.runDetection);
    }

    const tabAll = document.getElementById('view-tab-all');
    const tabFiltered = document.getElementById('view-tab-filtered');
    if (tabAll) {
        tabAll.addEventListener('click', () => window.selectTab('all'));
    }
    if (tabFiltered) {
        tabFiltered.addEventListener('click', () => window.selectTab('filtered'));
    }
});

window.updateViewTabs = function(allBoxesB64, filteredB64) {
    const tabsContainer = document.getElementById('image-view-tabs');
    const tabAll = document.getElementById('view-tab-all');
    const tabFiltered = document.getElementById('view-tab-filtered');

    if (!allBoxesB64) {
        if (tabsContainer) tabsContainer.classList.add('hidden');
        return;
    }

    if (tabsContainer) tabsContainer.classList.remove('hidden');

    if (!window.AppState) window.AppState = {};
    window.AppState.allBoxesImage = allBoxesB64;
    window.AppState.filteredImage = filteredB64;

    if (filteredB64) {
        if (tabFiltered) tabFiltered.classList.remove('hidden');
        window.selectTab('filtered');
    } else {
        if (tabFiltered) tabFiltered.classList.add('hidden');
        window.selectTab('all');
    }
};

window.selectTab = function(mode) {
    const tabAll = document.getElementById('view-tab-all');
    const tabFiltered = document.getElementById('view-tab-filtered');
    const imgEl = document.getElementById('result-image');

    if (mode === 'all') {
        if (tabAll) {
            tabAll.className = "px-3 py-1.5 rounded text-xs font-semibold tracking-wider text-white bg-[#4F8EF7] shadow-[0_0_8px_rgba(79,142,247,0.4)] transition-all select-none flex items-center gap-1.5 cursor-pointer";
        }
        if (tabFiltered) {
            tabFiltered.className = "px-3 py-1.5 rounded text-xs font-semibold tracking-wider text-on-surface-variant hover:text-on-surface bg-transparent transition-all select-none flex items-center gap-1.5 cursor-pointer";
        }
        if (imgEl && window.AppState && window.AppState.allBoxesImage) {
            imgEl.src = window.AppState.allBoxesImage;
        }
    } else if (mode === 'filtered') {
        if (tabFiltered) {
            tabFiltered.className = "px-3 py-1.5 rounded text-xs font-semibold tracking-wider text-white bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.4)] transition-all select-none flex items-center gap-1.5 cursor-pointer";
        }
        if (tabAll) {
            tabAll.className = "px-3 py-1.5 rounded text-xs font-semibold tracking-wider text-on-surface-variant hover:text-on-surface bg-transparent transition-all select-none flex items-center gap-1.5 cursor-pointer";
        }
        if (imgEl && window.AppState && window.AppState.filteredImage) {
            imgEl.src = window.AppState.filteredImage;
        }
    }
};
