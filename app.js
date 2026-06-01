if (window.audioInterval) clearInterval(window.audioInterval);
window.isWritingLock = false;

// ==========================================
// 💡 1️⃣ 全域記憶體大腦池初始化
// ==========================================
window.currentSampleRate = 20000;
window.currentSinFreq = 3000; 
window.filteredDataLog = [];
window.bufferIndex = 0;
window.nextPlayTime = 0;
window.isSpeakerOn = false;
window.isSimulating = false;
window.simPhase = 0;
window.FFT_SIZE = 1024;
window.analysisBuffer = new Float32Array(window.FFT_SIZE);
window.simWorker = null;

let renderFrameCounter = 0;
window.currentFilterMode = 'RAW';
window.f1 = 1000; window.f2 = 3000;
window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0;
let xv = new Float32Array(3), yv = new Float32Array(3);

// 💡 2️⃣ 數位濾波器核心係數計算公式（100% 正確的工業級 BP 帶通實裝！）
window.updateFilterCoefficients = function() {
    let fr = window.currentSampleRate / window.f1; if (fr < 2.01) fr = 2.01;
    let o = Math.tan(Math.PI / fr), q = Math.sqrt(2), c = 1 + q * o + o * o;
    
    if (window.currentFilterMode === 'LP') { window.b0 = o * o / c; window.b1 = 2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
    else if (window.currentFilterMode === 'HP') { window.b0 = 1 / c; window.b1 = -2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
    else if (window.currentFilterMode === 'BP') { 
        // 💡 工業級標準帶通公式：中心頻率為 F1，頻寬為 F2，Q 值 100% 鋼性比例對齊，絕不偏擺！
        let qVal = window.f1 / (window.f2 > 0 ? window.f2 : 1); if (qVal < 0.1) qVal = 0.1;
        let cBP = 1 + (o / qVal) + o * o; 
        window.b0 = (o / qVal) / cBP; window.b1 = 0; window.b2 = -window.b0; 
        window.a1 = 2 * (o * o - 1) / cBP; window.a2 = (1 - (o / qVal) + o * o) / cBP;
    }
};

// 💡 3️⃣ 獨立二階濾波執行水管
window.applyFilter = function(x) { 
    if (window.currentFilterMode === 'RAW') return x;
    xv = xv; xv = xv; xv = x;
    yv = yv; yv = yv;
    yv = (window.b0 * xv) + (window.b1 * xv) + (window.b2 * xv) - (window.a1 * yv) - (window.a2 * yv);
    if (isNaN(yv) || !isFinite(yv)) { yv=0; yv=0; yv=0; xv=0; xv=0; xv=0; }
    return yv;
};

window.addEventListener('DOMContentLoaded', () => {
    window.tCanvas = document.getElementById('timeCanvas'); window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d'); window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400; window.fCanvas.width = 800; window.fCanvas.height = 400;
});
window.oscNode = null;
window.scriptNode = null;

// ==========================================
// 💡 4️⃣ 聲學直通車：標準 44.1kHz 隔離發聲引擎
// ==========================================
window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode.disconnect(); window.oscNode = null; }
    if (window.scriptNode) window.scriptNode.disconnect();
    
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain();
        window.gainNode.connect(window.audioCtx.destination);
    }
    
    if (window.audioCtx.state === 'suspended') { window.audioCtx.resume(); }
    window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? 0.3 : 0.0, window.audioCtx.currentTime);

    window.oscNode = window.audioCtx.createOscillator();
    window.oscNode.type = 'sine';
    window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime);

    window.scriptNode = window.audioCtx.createScriptProcessor(1024, 1, 1);
    window.scriptNode.onaudioprocess = function(audioProcessingEvent) {
        let inputBuffer = audioProcessingEvent.inputBuffer;
        let outputBuffer = audioProcessingEvent.outputBuffer;
        let inputData = inputBuffer.getChannelData(0);
        let outputData = outputBuffer.getChannelData(0);

        for (let sample = 0; sample < inputBuffer.length; sample++) {
            let rawVal = inputData[sample];
            let fVal = window.applyFilter ? window.applyFilter(rawVal) : rawVal; 
            
            outputData[sample] = fVal; 
            
            if (window.isSimulating) {
                window.filteredDataLog.push(fVal);
                window.analysisBuffer[window.bufferIndex] = fVal;
                window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
            }
        }
        if (window.filteredDataLog.length > 4000) window.filteredDataLog = window.filteredDataLog.slice(-3000);
    };

    if (window.isSimulating) {
        window.oscNode.connect(window.scriptNode);
        window.scriptNode.connect(window.gainNode);
        window.oscNode.start();
    }
};

window.consumeRawBuffer = function(rawDataView) {
    let byteLength = rawDataView.byteLength;
    for (let i = 0; i < byteLength; i++) {
        let byteVal = rawDataView.getUint8(i); let val = (byteVal / 127.5) - 1.0;
        let fVal = window.applyFilter ? window.applyFilter(val) : val; window.filteredDataLog.push(fVal);
        if (window.filteredDataLog.length > 5000) window.filteredDataLog.shift(); 
        window.analysisBuffer[window.bufferIndex] = fVal; window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
    }
};
function localFFT(re, im) {
    const n = re.length; let bits = 0; while ((1 << bits) < n) bits++;
    for (let i = 0; i < n; i++) {
        let rev = 0; for (let j = 0; j < bits; j++) { if ((i & (1 << j)) !== 0) rev |= (1 << (bits - 1 - j)); }
        if (rev > i) { let tr = re[i]; re[i] = re[rev]; re[rev] = tr; let ti = im[i]; im[i] = im[rev]; im[rev] = ti; }
    }
    for (let len = 2; len <= n; len <<= 1) {
        let ang = 2 * Math.PI / len * -1, wlen_r = Math.cos(ang), wlen_i = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let w_r = 1, w_i = 0;
            for (let j = 0; j < len / 2; j++) {
                let u_r = re[i + j], u_i = im[i + j]; let v_r = re[i + j + len / 2] * w_r - im[i + j + len / 2] * w_i;
                let v_i = re[i + j + len / 2] * w_i + im[i + j + len / 2] * w_r;
                re[i + j] = u_r + v_r; im[i + j] = u_i + v_i; re[i + j + len / 2] = u_r - v_r; im[i + j + len / 2] = u_i - v_i;
                let next_w_r = w_r * wlen_r - w_i * wlen_i; w_i = w_r * wlen_i + w_i * wlen_r; w_r = next_w_r;
            }
        }
    }
}

window.globalRenderLoop = function() {
    requestAnimationFrame(window.globalRenderLoop); renderFrameCounter++; if (renderFrameCounter % 2 !== 0) return;
    if (window.filteredDataLog.length < 50) return;

    let adaptivePointsCount = Math.round((3 * (window.audioCtx ? window.audioCtx.sampleRate : 44100)) / window.currentSinFreq * (44100 / window.currentSampleRate));
    if (adaptivePointsCount < 64) adaptivePointsCount = 64; if (adaptivePointsCount > window.filteredDataLog.length) adaptivePointsCount = window.filteredDataLog.length;

    let rawSlice = window.filteredDataLog.slice(-adaptivePointsCount);
    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), vpp = max - min, sq = 0;
    rawSlice.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rawSlice.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let re = new Float32Array(window.FFT_SIZE), im = new Float32Array(window.FFT_SIZE);
    for (let k = 0; k < window.FFT_SIZE; k++) { let idx = (window.bufferIndex + k) % window.FFT_SIZE; re[k] = window.analysisBuffer[idx]; }
    localFFT(re, im);
    
    let magnitudes = new Float32Array(window.FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); if (m > 1 && magnitudes[m] > maxMag) { maxMag = magnitudes[m]; maxIdx = m; } }
    let peakFreq = maxIdx * ((window.audioCtx ? window.audioCtx.sampleRate : 44100) / window.FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
    window.tCtx.clearRect(0, 0, window.tCanvas.width, window.tCanvas.height);
    window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, window.tCanvas.width, window.tCanvas.height); window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath();
    let midY = window.tCanvas.height / 2;

    let tSlice = window.tCanvas.width / (rawSlice.length - 1);
    let firstY = midY - ((rawSlice || 0) * (window.tCanvas.height / 2.3)); window.tCtx.moveTo(0, firstY);
    
    for (let j = 0; j < rawSlice.length - 1; j++) {
        let x1 = j * tSlice; let y1 = midY - ((rawSlice[j] || 0) * (window.tCanvas.height / 2.3));
        let x2 = (j + 1) * tSlice; let y2 = midY - ((rawSlice[j + 1] || 0) * (window.tCanvas.height / 2.3));
        let xc = (x1 + x2) / 2; let yc = (y1 + y2) / 2;
        window.tCtx.quadraticCurveTo(x1, y1, xc, yc); 
    }
    window.tCtx.stroke();
    
    window.fCtx.clearRect(0, 0, window.fCanvas.width, window.fCanvas.height);
    window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, window.fCanvas.width, window.fCanvas.height); window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 1.5; window.fCtx.beginPath();
    let fSlice = window.fCanvas.width / (window.FFT_SIZE / 4);
    for (let n = 0; n < window.FFT_SIZE / 4; n++) { let curX = n * fSlice, y = window.fCanvas.height - (magnitudes[n] * window.fCanvas.height * 200); if (n == 0) window.fCtx.moveTo(curX, y); else window.fCtx.lineTo(curX, y); }
    window.fCtx.stroke();
};

document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return;
    const clickId = e.target.id;
    if (clickId === 'simBtn') {
        window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn');
        window.initAudioGlobal();
        if (btn) { btn.innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試"; btn.className = window.isSimulating ? "btn-sim active" : "btn-sim"; }
        document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：恆定比值 BP 核心啟動！" : "狀態：模擬測試已停止。";
    }
    if (clickId === 'speakerBtn') {
        window.isSpeakerOn = !window.isSpeakerOn; const sBtn = document.getElementById('speakerBtn');
        if (sBtn) { sBtn.innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉"; sBtn.className = window.isSpeakerOn ? "btn-speaker" : "btn-speaker muted"; }
        window.initAudioGlobal();
    }
    const fModes = { filterRaw: 'RAW', filterLP: 'LP', filterHP: 'HP', filterBP: 'BP' };
    if (fModes[clickId]) {
        Object.keys(fModes).forEach(k => { const tBtn = document.getElementById(k); if (tBtn) tBtn.classList.remove('active'); });
        e.target.classList.add('active'); window.currentFilterMode = fModes[clickId];
        const f2View = document.getElementById('f2Container'); if (f2View) f2View.style.display = window.currentFilterMode === 'BP' ? 'flex' : 'none';
        if (window.updateFilterCoefficients) window.updateFilterCoefficients();
    }
});

document.addEventListener('input', (e) => {
    if (e.target && e.target.type === 'range') {
        let sliderId = e.target.id; let curVal = parseFloat(e.target.value); let nextSpan = e.target.nextElementSibling;
        if (sliderId === "sampleRateSlider") { window.currentSampleRate = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSampleRate + " Hz"; if (window.updateFilterCoefficients) window.updateFilterCoefficients(); }
        if (sliderId === "sinFreqSlider") { window.currentSinFreq = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSinFreq + " Hz"; if (window.oscNode && window.audioCtx) window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime); }
        if (sliderId === "f1Slider") { window.f1 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f1 + " Hz"; if (window.updateFilterCoefficients) window.updateFilterCoefficients(); }
        if (sliderId === "f2Slider") { window.f2 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f2 + " Hz"; if (window.updateFilterCoefficients) window.updateFilterCoefficients(); }
    }
});

window.onload = function() {
    const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider');
    const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');
    if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value);
    if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);
    if (window.updateFilterCoefficients) window.updateFilterCoefficients(); if (window.globalRenderLoop) window.globalRenderLoop();
};
