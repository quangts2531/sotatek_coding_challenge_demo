// Global AppState
window.AppState = window.AppState || {};
window.AppState.progress = 0;
window.AppState.progressInterval = null;
window.AppState.isProcessing = false;
window.AppState.confidence = 0.50;
window.AppState.multiScale = true;
window.AppState.rotationInvariant = false;
window.AppState.selectedExample = null;

// Global file state
window.patternFile = null;
window.drawingFile = null;

// ── Micro-interactions ──────────────────────────────────────────────
document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.97)'; });
    btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
});

// ── Toggles ─────────────────────────────────────────────────────────
function bindToggle(labelId, stateKey) {
    const labelEl = document.getElementById(labelId);
    if (!labelEl) return;
    const container = labelEl.querySelector('div');
    const circle = labelEl.querySelector('div > span');
    labelEl.addEventListener('click', (e) => {
        e.preventDefault();
        window.AppState[stateKey] = !window.AppState[stateKey];
        const isActive = window.AppState[stateKey];
        if (isActive) {
            container.classList.remove('bg-border-deep');
            container.classList.add('bg-primary-container');
            circle.classList.remove('translate-x-1', 'bg-on-surface-variant');
            circle.classList.add('translate-x-4', 'bg-white');
        } else {
            container.classList.remove('bg-primary-container');
            container.classList.add('bg-border-deep');
            circle.classList.remove('translate-x-4', 'bg-white');
            circle.classList.add('translate-x-1', 'bg-on-surface-variant');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindToggle('toggle-multiscale', 'multiScale');
    bindToggle('toggle-rotation', 'rotationInvariant');
});

window.switchTab = function(tab) {
    console.log("Switching to tab:", tab);
};

window.logMessage = function(level, message) {
    console.log(`[${level}] ${message}`);
};

window.showToast = function(message, type = 'error') {
    const container = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    const bg = type === 'error' ? '#c0392b' : '#27ae60';
    toast.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        `background:${bg}`, 'color:#fff',
        'padding:10px 16px', 'border-radius:8px',
        'font-family:JetBrains Mono,monospace', 'font-size:12px',
        'box-shadow:0 4px 20px rgba(0,0,0,0.4)',
        'transform:translateX(120%)', 'transition:transform 0.3s cubic-bezier(.22,1,.36,1)',
        'max-width:320px', 'pointer-events:auto'
    ].join(';');
    const icon = type === 'error' ? 'error' : 'check_circle';
    toast.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0">${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
    });
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3000);
};

function createToastContainer() {
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.style.cssText = [
        'position:fixed', 'bottom:24px', 'right:24px', 'z-index:9999',
        'display:flex', 'flex-direction:column', 'gap:10px',
        'pointer-events:none'
    ].join(';');
    document.body.appendChild(el);
    return el;
}

window.updateConfidence = function(value) {
    const v = parseFloat(value);
    if (isNaN(v)) return;
    window.AppState.confidence = parseFloat(v.toFixed(2));
    const display = document.getElementById('confidence-display');
    if (!display) return;
    display.textContent = v.toFixed(2);
    if (v < 0.3) {
        display.style.color = '#FF4444';
    } else if (v <= 0.6) {
        display.style.color = '#FFB800';
    } else {
        display.style.color = '#00C48C';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('confidence-slider');
    if (!slider) return;
    slider.addEventListener('input', function () { window.updateConfidence(this.value); });
    slider.addEventListener('change', function () { window.updateConfidence(this.value); });
});

const exampleData = {
    'Điện trở': { color: '#4F8EF7' },
    'Tụ điện': { color: '#7B5FFF' },
};

function createExampleImage(label, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1C1E26';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (label === 'Điện trở') {
        ctx.beginPath();
        ctx.moveTo(20, 64); ctx.lineTo(40, 64);
        ctx.lineTo(45, 44); ctx.lineTo(55, 84);
        ctx.lineTo(65, 44); ctx.lineTo(75, 84);
        ctx.lineTo(85, 44); ctx.lineTo(90, 64);
        ctx.lineTo(108, 64);
        ctx.stroke();
    } else if (label === 'Tụ điện') {
        ctx.beginPath();
        ctx.moveTo(20, 64); ctx.lineTo(55, 64);
        ctx.moveTo(55, 44); ctx.lineTo(55, 84);
        ctx.moveTo(73, 44); ctx.lineTo(73, 84);
        ctx.moveTo(73, 64); ctx.lineTo(108, 64);
        ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, 64, 115);
    return canvas.toDataURL('image/png');
}

window.resetExampleButtons = function() {
    document.querySelectorAll('button.bg-viewport-dark.border.border-border-deep').forEach(b => {
        b.style.removeProperty('border');
        b.style.removeProperty('background-color');
        b.style.removeProperty('box-shadow');
        const p = b.querySelector('p');
        if (p) {
            p.style.removeProperty('color');
        }
    });
};

function showDrawingPreview(src, filename) {
    const emptyEl = document.getElementById('drawing-empty');
    const previewEl = document.getElementById('drawing-preview');
    const imgEl = document.getElementById('drawing-img');
    const nameEl = document.getElementById('drawing-filename');

    if (emptyEl) emptyEl.classList.add('hidden');
    if (previewEl) previewEl.classList.remove('hidden');
    if (imgEl) imgEl.src = src;
    if (nameEl) nameEl.textContent = filename;
}

function resetDrawingUpload() {
    window.drawingFile = null;
    const emptyEl = document.getElementById('drawing-empty');
    const previewEl = document.getElementById('drawing-preview');
    const imgEl = document.getElementById('drawing-img');
    const nameEl = document.getElementById('drawing-filename');
    const input = document.getElementById('drawing-input');

    if (emptyEl) emptyEl.classList.remove('hidden');
    if (previewEl) previewEl.classList.add('hidden');
    if (imgEl) imgEl.src = '';
    if (nameEl) nameEl.textContent = '';
    if (input) input.value = '';
}

function setExampleActive(el, label) {
    window.resetExampleButtons();
    if (window.AppState.selectedExample === label) {
        window.AppState.selectedExample = null;
        resetDrawingUpload();
        return;
    }
    window.AppState.selectedExample = label;
    el.style.setProperty('border', '1px solid #4F8EF7', 'important');
    el.style.setProperty('background-color', '#1C1E26', 'important');
    el.style.setProperty('box-shadow', '0 0 8px #4F8EF740', 'important');
    const p = el.querySelector('p');
    if (p) {
        p.style.setProperty('color', '#ffffff', 'important');
    }
    const dataUrl = createExampleImage(label, exampleData[label].color);
    fetch(dataUrl)
        .then(r => r.blob())
        .then(blob => {
            const file = new File([blob], label + '.png', { type: 'image/png' });
            window.drawingFile = file;
            showDrawingPreview(dataUrl, label + '.png');
            window.showToast(label + ' đã được tải lên', 'success');
        });
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('button.bg-viewport-dark.border.border-border-deep').forEach(btn => {
        const txt = btn.textContent.trim();
        if (txt === 'Điện trở' || txt === 'Tụ điện') {
            btn.style.cursor = 'pointer';
            btn.style.pointerEvents = 'auto';
            btn.addEventListener('click', function (e) {
                setExampleActive(this, txt);
            });
        }
    });
});
