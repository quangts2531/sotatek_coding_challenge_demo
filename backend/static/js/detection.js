window.getCookie = function(name) {
    const value = '; ' + document.cookie;
    const parts = value.split('; ' + name + '=');
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
};

window.runDetection = async function() {
    // Only need the pattern (board) image
    if (!window.patternFile) {
        window.showToast('Vui lòng tải lên ảnh bảng mạch', 'error');
        return;
    }

    if (window.AppState && window.AppState.isProcessing) return;
    if (window.AppState) window.AppState.isProcessing = true;

    window.startProgress();

    // Send only the board image
    const formData = new FormData();
    formData.append('pattern', window.patternFile);
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

        // ── Show result in the RIGHT panel ──────────────────────────
        const emptyState = document.getElementById('result-empty');
        const resultContent = document.getElementById('result-content');
        const resultImage = document.getElementById('result-image');
        const resultTargets = document.getElementById('result-targets');
        const resultCount = document.getElementById('result-count');

        // Hide empty state, show result
        if (emptyState) emptyState.classList.add('hidden');
        if (resultContent) resultContent.classList.remove('hidden');

        // Display the result image with bounding boxes
        if (resultImage) {
            resultImage.src = data.result_image;
        }

        // Display targets list
        if (resultTargets) {
            resultTargets.innerHTML = '';
            if (data.targets && data.targets.length > 0) {
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

        // Update count
        if (resultCount) {
            resultCount.textContent = data.total_found + ' found';
        }

        // Print targets to console (as requested)
        console.log('=== Detection Targets ===');
        console.log(JSON.stringify(data.targets, null, 2));
        console.log('Total found:', data.total_found);

        window.logMessage('SUCCESS', 'Detection complete');
        window.logMessage('INFO', 'Total found: ' + data.total_found);
        if (data.targets) {
            data.targets.forEach(t => {
                window.logMessage('INFO', `${t.label} (${(t.score * 100).toFixed(1)}%) at [${t.box.join(', ')}]`);
            });
        }

        window.showToast('Phát hiện ' + data.total_found + ' linh kiện', 'success');

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
});
