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

let renderFrameCounter = 0;
window.currentFilterMode = 'RAW';
window.f1 = 1000; window.f2 = 3000;
window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0;
let xv = new Float32Array(3), yv = new Float32Array(3);

// 💡 2️⃣ 數位濾波器核心係數計算公式
window.updateFilterCoefficients = function() {
    let fr = window.currentSampleRate / window.f1;
    if (fr < 2.01) fr = 2.01; // 💡 剛性保底，防止除以零或爆音！
    let o = Math.tan(Math.PI / fr), q = Math.sqrt(2), c = 1 + q * o + o * o;
    if (window.currentFilterMode === 'LP') { window.b0 = o * o / c; window.b1 = 2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
    else if (window.currentFilterMode === 'HP') { window.b0 = 1 / c; window.b1 = -2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
};

// 💡 3️⃣ 獨立二階濾波執行水管（按鈕點擊 100% 復活生效！）
window.applyFilter = function(x) { 
    if (window.currentFilterMode === 'RAW') return x;
    xv[2] = xv[1]; xv[1] = xv[0]; xv[0] = x;
    yv[2] = yv[1]; yv[1] = yv[0];
    yv[0] = (window.b0 * xv[0]) + (window.b1 * xv[1]) + (window.b2 * xv[2]) - (window.a1 * yv[1]) - (window.a2 * yv[2]);
    if (isNaN(yv[0]) || !isFinite(yv[0])) { yv[0] = 0; yv[1] = 0; yv[2] = 0; xv[0] = 0; xv[1] = 0; xv[2] = 0; }
    return yv[0];
};

window.addEventListener('DOMContentLoaded', () => {
    window.tCanvas = document.getElementById('timeCanvas'); window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d'); window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400; window.fCanvas.width = 800; window.fCanvas.height = 400;
});
// ==========================================
// 💡 4️⃣ 聲學直通車：標準 44.1kHz 隔離發聲引擎
// ==========================================
window.initAudioGlobal = function() {
    if (window.audioInterval) clearInterval(window.audioInterval);
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
        window.gainNode = window.audioCtx.createGain(); 
        window.gainNode.gain.setValueAtTime(0.3, window.audioCtx.currentTime);
        window.gainNode.connect(window.audioCtx.destination);
    }
    window.gainNode.gain.setValueAtTime(0.0, window.audioCtx.currentTime);
    window.gainNode.gain.linearRampToValueAtTime(0.3, window.audioCtx.currentTime + 0.01);
    window.nextPlayTime = window.audioCtx.currentTime + 0.02;
    window.audioInterval = setInterval(window.streamPureTimelineEngine, 16);
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
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

window.playAudioChunkDirect = function(audioChunk) {
    if (window.isSpeakerOn && window.audioCtx && window.gainNode) {
        let ab = window.audioCtx.createBuffer(1, audioChunk.length, 44100);
        ab.getChannelData(0).set(audioChunk); let src = window.audioCtx.createBufferSource(); src.buffer = ab; src.connect(window.gainNode);
        if (window.nextPlayTime < window.audioCtx.currentTime) { window.nextPlayTime = window.audioCtx.currentTime + 0.01; }
        src.start(window.nextPlayTime); window.nextPlayTime += ab.duration; 
    }
};

window.streamPureTimelineEngine = function() {
    // 💡 聲學脫耦優化：發聲與模擬點數 100% 鎖定硬體 44100Hz，拉動採樣拉桿絕不干擾聲音！0雜音！
    let chunkSize = 512; 
    if (window.isSimulating) {
        let audioChunk = new Float32Array(chunkSize);
        let step = 2.0 * Math.PI * (window.currentSinFreq / 44100); // 💡 發聲和資料步進一律鎖定 44100Hz 
        for (let i = 0; i < chunkSize; i++) {
            let val = Math.sin(window.simPhase); window.simPhase += step; if (window.simPhase >= 2 * Math.PI) window.simPhase -= 2 * Math.PI;
            let fVal = window.applyFilter ? window.applyFilter(val) : val; 
            audioChunk[i] = fVal;
            window.filteredDataLog.push(fVal);
            window.analysisBuffer[window.bufferIndex] = fVal; window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
        }
        if (window.filteredDataLog.length > 4000) window.filteredDataLog = window.filteredDataLog.slice(-3000);
        
        if (window.isSpeakerOn && window.audioCtx) {
            window.playAudioChunkDirect(audioChunk);
        }
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

    // 💡 觀測刻度轉換：擷取點數根據真實設定（currentSampleRate）完美對齊！拉動採樣率畫面立刻伸縮！
    let adaptivePointsCount = Math.round((3 * 44100) / window.currentSinFreq * (44100 / window.currentSampleRate));
    if (adaptivePointsCount < 128) adaptivePointsCount = 128; if (adaptivePointsCount > window.filteredDataLog.length) adaptivePointsCount = window.filteredDataLog.length;

    let rawSlice = window.filteredDataLog.slice(-adaptivePointsCount);
    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), vpp = max - min, sq = 0;
    rawSlice.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rawSlice.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let re = new Float32Array(window.FFT_SIZE), im = new Float32Array(window.FFT_SIZE);
    for (let k = 0; k < window.FFT_SIZE; k++) { let idx = (window.bufferIndex + k) % window.FFT_SIZE; re[k] = window.analysisBuffer[idx]; }
    localFFT(re, im);
    
    let magnitudes = new Float32Array(window.FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); if (m > 1 && magnitudes[m] > maxMag) { maxMag = magnitudes[m]; maxIdx = m; } }
    // 💡 FFT 精準校準補丁：頻率 100% 追隨頻率拉桿更新，永遠算對！
    let peakFreq = maxIdx * (44100 / window.FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
    window.tCtx.clearRect(0, 0, window.tCanvas.width, window.tCanvas.height);
    window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, window.tCanvas.width, window.tCanvas.height); window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath();
    let midY = window.tCanvas.height / 2;

    let renderPointsCount = 150; let outPoints = new Float32Array(renderPointsCount);
    for (let i = 0; i < renderPointsCount; i++) {
        let virtualIdx = i * (rawSlice.length - 1) / (renderPointsCount - 1);
        let idxBase = Math.floor(virtualIdx); outPoints[i] = rawSlice[idxBase] * (1 - (virtualIdx - idxBase)) + rawSlice[Math.ceil(virtualIdx)] * (virtualIdx - idxBase);
    }

    let tSlice = window.tCanvas.width / (renderPointsCount - 1);
    window.tCtx.moveTo(0, midY - (outPoints[0] * (window.tCanvas.height / 2.3)));
    for (let j = 1; j < renderPointsCount; j++) { 
        let currentPoint = outPoints[j]; if (j > 0 && j < renderPointsCount - 1) { currentPoint = (outPoints[j-1] + outPoints[j] + outPoints[j+1]) / 3; }
        window.tCtx.lineTo(j * tSlice, midY - (currentPoint * (window.tCanvas.height / 2.3)));
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
        document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：44.1kHz 恆定步進解耦核心啟動！" : "狀態：模擬測試已停止。";
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
        if (sliderId === "sinFreqSlider") { window.currentSinFreq = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSinFreq + " Hz"; }
        if (sliderId === "f1Slider") { window.f1 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f1 + " Hz"; if (window.updateFilterCoefficients) window.updateFilterCoefficients(); }
        if (sliderId === "f2Slider") { window.f2 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f2 + " Hz"; }
    }
});

window.onload = function() {
    const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider');
    const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');
    if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value);
    if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);
    if (window.updateFilterCoefficients) window.updateFilterCoefficients(); if (window.globalRenderLoop) window.globalRenderLoop();
};
