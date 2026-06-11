window.AppState = window.AppState || {};

window.renderProgress = function (value) {
    const progressBar = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-label');
    const progressPercent = document.getElementById('progress-pct');
    const progressDot = document.getElementById('progress-dot');

    if (!progressBar || !progressText || !progressPercent || !progressDot) return;

    const pct = Math.round(Math.max(0, Math.min(100, value)));

    progressBar.style.setProperty('width', pct + '%', 'important');
    progressBar.style.setProperty('transition', 'width 150ms linear', 'important');

    if (pct === 0) {
        progressText.textContent = 'ĐANG XỬ LÝ...';
        progressText.style.color = '#8892A4';
        progressPercent.textContent = '0%';
        progressPercent.style.color = '#8892A4';
        progressDot.style.background = '#8892A4';
        progressDot.style.boxShadow = 'none';
        progressDot.style.animation = 'none';
        progressBar.style.setProperty('background-color', '#4F8EF7', 'important');
    } else if (pct < 100) {
        progressText.textContent = 'ĐANG XỬ LÝ...';
        progressText.style.color = '#acc7ff';
        progressPercent.textContent = pct + '%';
        progressPercent.style.color = '#acc7ff';
        progressDot.style.background = '#4F8EF7';
        progressDot.style.boxShadow = '0 0 8px rgba(79,142,247,0.8)';
        progressDot.style.animation = 'zmPulse 1s infinite';
        progressBar.style.setProperty('background-color', '#4F8EF7', 'important');
    } else {
        progressText.textContent = 'HOÀN THÀNH';
        progressText.style.color = '#00C48C';
        progressPercent.textContent = '100%';
        progressPercent.style.color = '#00C48C';
        progressDot.style.background = '#00C48C';
        progressDot.style.boxShadow = '0 0 8px rgba(0,196,140,0.8)';
        progressDot.style.animation = 'none';
        progressBar.style.setProperty('background-color', '#00C48C', 'important');
    }
};

window.stopProgress = function () {
    if (window.AppState.progressInterval) {
        clearInterval(window.AppState.progressInterval);
        window.AppState.progressInterval = null;
    }
};

window.startProgress = function () {
    window.stopProgress();
    window.AppState.progress = 0;
    window.renderProgress(0);

    window.AppState.progressInterval = setInterval(() => {
        const p = window.AppState.progress;
        if (p >= 95) return;

        const inc = p < 30 ? 2
            : p < 60 ? 1
                : p < 85 ? 0.5
                    : 0.2;

        window.AppState.progress = Math.min(95, p + inc);
        window.renderProgress(window.AppState.progress);
    }, 100);
};

window.completeProgress = function () {
    window.stopProgress();
    window.AppState.progress = 100;
    window.renderProgress(100);
    setTimeout(() => {
        window.renderProgress(0);
        window.AppState.progress = 0;
    }, 2000);
};

document.addEventListener('DOMContentLoaded', () => {
    window.renderProgress(0);
});
