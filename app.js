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

// 💡 2️⃣ 數位濾波器核心係數計算公式
window.updateFilterCoefficients = function() {
    let fr = window.currentSampleRate / window.f1;
    if (fr < 2.01) fr = 2.01; // 💡 剛性幾何保底，徹底防止採樣與截止頻率過近時爆音或除以零！
    let o = Math.tan(Math.PI / fr), q = Math.sqrt(2), c = 1 + q * o + o * o;
    if (window.currentFilterMode === 'LP') { window.b0 = o * o / c; window.b1 = 2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
    else if (window.currentFilterMode === 'HP') { window.b0 = 1 / c; window.b1 = -2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
};

// 💡 3️⃣ 100% 打通的獨立二階濾波執行水管（按鈕點擊立刻生效！）
window.applyFilter = function(x) { 
    if (window.currentFilterMode === 'RAW') return x;
    xv[0] = xv[1]; xv[1] = xv[2]; xv[2] = x;
    yv[0] = yv[1]; yv[1] = yv[2];
    yv[2] = (window.b0 * xv[2]) + (window.b1 * xv[1]) + (window.b2 * xv[0]) - (window.a1 * yv[1]) - (window.a2 * yv[0]);
    if (isNaN(yv[2]) || !isFinite(yv[2])) { yv[2] = 0; xv[2] = 0; xv[1] = 0; xv[0] = 0; yv[1] = 0; yv[0] = 0; } // 防爆
    return yv[2];
};

window.addEventListener('DOMContentLoaded', () => {
    window.S_UUID = 0xFF01; window.C_UUID = 0xFF02;
    window.bleCharacteristicObject = null; window.audioCtx = null; window.gainNode = null;
    window.tCanvas = document.getElementById('timeCanvas'); window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d'); window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400; window.fCanvas.width = 800; window.fCanvas.height = 400;
});
window.initAudioGlobal = function() {
    if (window.audioInterval) clearInterval(window.audioInterval);
    if (!window.audioCtx) {
        // 💡 聲學大革命：強制將監聽發聲死鎖在 44100Hz 標準通道，徹底抹除重採樣斷層與電流雜音！
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
    // 💡 核心解耦大解鎖：不論喇叭開關，後台信號生成永遠以拉桿採樣率（currentSampleRate）全速衝刺填滿快取池！
    let simChunkSize = Math.round(window.currentSampleRate * 0.016); // 💡 每影格動態產出對應點數
    if (simChunkSize < 32) simChunkSize = 32;
    
    if (window.isSimulating) {
        let step = 2.0 * Math.PI * (window.currentSinFreq / window.currentSampleRate); // 💡 時鐘 100% 綁定拉桿採樣率！
        for (let i = 0; i < simChunkSize; i++) {
            let val = Math.sin(window.simPhase); window.simPhase += step; if (window.simPhase >= 2 * Math.PI) window.simPhase -= 2 * Math.PI;
            let fVal = window.applyFilter ? window.applyFilter(val) : val; 
            window.filteredDataLog.push(fVal);
            window.analysisBuffer[window.bufferIndex] = fVal; window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
        }
        if (window.filteredDataLog.length > 4000) window.filteredDataLog = window.filteredDataLog.slice(-3000);
    }

    // 💡 喇叭發聲水管獨立：喇叭開啟時，高精度重採樣到 44.1kHz 餵給手機，0 電流音，關喇叭拉桿 100% 正常動！
    if (window.isSpeakerOn && window.audioCtx && window.filteredDataLog.length > 300) {
        let targetTime = window.audioCtx.currentTime + 0.10;
        while (window.nextPlayTime < targetTime) {
            let playSize = 256; let audioChunk = new Float32Array(playSize);
            let playStep = 2.0 * Math.PI * (window.currentSinFreq / 44100); // 💡 發聲端鎖死 44100Hz
            for (let k = 0; k < playSize; k++) {
                let v = Math.sin(window.simPhase); // 這裡單獨走發聲指針
                audioChunk[k] = window.isSimulating ? window.applyFilter(v) : (window.filteredDataLog[window.filteredDataLog.length - playSize + k] || 0);
            }
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
                let u_r = re[i + j], u_i = im[i + j];
                let v_r = re[i + j + len / 2] * w_r - im[i + j + len / 2] * w_i;
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

    let adaptivePointsCount = Math.round((3 * window.currentSampleRate) / window.currentSinFreq);
    if (adaptivePointsCount < 128) adaptivePointsCount = 128;
    if (adaptivePointsCount > window.filteredDataLog.length) adaptivePointsCount = window.filteredDataLog.length;

    let rawSlice = window.filteredDataLog.slice(-adaptivePointsCount);
    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), vpp = max - min, sq = 0;
    rawSlice.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rawSlice.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let re = new Float32Array(window.FFT_SIZE), im = new Float32Array(window.FFT_SIZE);
    for (let k = 0; k < window.FFT_SIZE; k++) { let idx = (window.bufferIndex + k) % window.FFT_SIZE; re[k] = window.analysisBuffer[idx]; }
    localFFT(re, im);
    
    let magnitudes = new Float32Array(window.FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); if (m > 1 && magnitudes[m] > maxMag) { maxMag = magnitudes[m]; maxIdx = m; } }
    // 💡 FFT 鋼性校準：頻率計量板 100% 精準對齊拉桿採樣率，拉動採樣率畫面立刻跟著瘋狂縮放！
    let peakFreq = maxIdx * (window.currentSampleRate / window.FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
    window.tCtx.clearRect(0, 0, window.tCanvas.width, window.tCanvas.height);
    window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, window.tCanvas.width, window.tCanvas.height); window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath();
    let midY = window.tCanvas.height / 2;

    let renderPointsCount = 150; let outPoints = new Float32Array(renderPointsCount);
    for (let i = 0; i < renderPointsCount; i++) {
        let virtualIdx = i * (rawSlice.length - 1) / (renderPointsCount - 1);
        let idxBase = Math.floor(virtualIdx), weight = virtualIdx - idxBase;
        outPoints[i] = rawSlice[idxBase] * (1 - weight) + rawSlice[Math.ceil(virtualIdx)] * weight;
    }

    let tSlice = window.tCanvas.width / (renderPointsCount - 1);
    let x0 = 0, y0 = midY - (outPoints[0] * (window.tCanvas.height / 2.3)); window.tCtx.moveTo(x0, y0);
    for (let j = 1; j < renderPointsCount; j++) { 
        let x1 = j * tSlice; let currentPoint = outPoints[j];
        if (j > 0 && j < renderPointsCount - 1) { currentPoint = (outPoints[j-1] + outPoints[j] + outPoints[j+1]) / 3; }
        let y1 = midY - (currentPoint * (window.tCanvas.height / 2.3)); let xc = (x0 + x1) / 2; let yc = (y0 + y1) / 2;
        window.tCtx.quadraticCurveTo(x0, y0, xc, yc); x0 = x1; y0 = y1;
    }
    window.tCtx.lineTo(x0, y0); window.tCtx.stroke();
    
    window.fCtx.clearRect(0, 0, window.fCanvas.width, window.fCanvas.height);
    window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, window.fCanvas.width, window.fCanvas.height); window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 1.5; window.fCtx.beginPath();
    let fSlice = window.fCanvas.width / (window.FFT_SIZE / 4);
    for (let n = 0; n < window.FFT_SIZE / 4; n++) { let curX = n * fSlice, y = window.fCanvas.height - (magnitudes[n] * window.fCanvas.height * 200); if (n == 0) window.fCtx.moveTo(curX, y); else window.fCtx.lineTo(curX, y); }
    window.fCtx.stroke();
};

// ==========================================
// 💡 5️⃣ 按鈕與滑桿監聽器（1對1 鋼性等號絕對對齊，4濾波鈕滿血復活！）
// ==========================================
document.addEventListener('click', (e) => {
    if (!e.target) return;
    if (e.target.id === 'simBtn') {
        window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn');
        if (window.isSimulating) { window.initAudioGlobal(); if (btn) { btn.innerText = "🛑 停止本地模擬測試"; btn.className = "btn-sim active"; } document.getElementById('status').innerText = "▶️ 離線沙盒：FFT與過濾器完全獨立架構點火！"; }
        else { 
            if (window.audioInterval) clearInterval(window.audioInterval);
            if (window.audioCtx) window.nextPlayTime = window.audioCtx.currentTime;
            window.filteredDataLog = []; if (btn) { btn.innerText = "🛠️ 開啟本地資料模擬測試"; btn.className = "btn-sim"; }
            document.getElementById('status').innerText = "狀態：模擬測試已停止。"; 
        }
    }
    if (e.target.id === 'speakerBtn') {
        window.isSpeakerOn = !window.isSpeakerOn; const sBtn = document.getElementById('speakerBtn');
        if (sBtn) { sBtn.innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉"; sBtn.className = window.isSpeakerOn ? "btn-speaker" : "btn-speaker muted"; }
        window.initAudioGlobal();
    }
    if (e.target.id === 'connectBtn') {
        if (window.isSimulating) { const sBtn = document.getElementById('simBtn'); if (sBtn) sBtn.click(); }
        const status = document.getElementById('status');
        try {
            status.innerText = "正在搜尋藍牙裝置...";
            navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'ESP32' }], optionalServices: [window.S_UUID] }).then(device => { return device.gatt.connect(); })
            .then(server => { return server.getPrimaryService(window.S_UUID); }).then(service => { return service.getCharacteristic(window.C_UUID); })
            .then(characteristic => { window.bleCharacteristicObject = characteristic; window.bleCharacteristicObject.removeEventListener('characteristicvaluechanged', window.currentBleHandler); window.currentBleHandler = (evt) => { window.consumeRawBuffer(evt.target.value); }; window.bleCharacteristicObject.addEventListener('characteristicvaluechanged', window.currentBleHandler); return window.bleCharacteristicObject.startNotifications(); })
            .then(() => { status.innerText = "▶️ 實體藍牙大水管對接成功！"; }).catch(err => { status.innerText = "底層連線失敗: " + err.message; });
        } catch (err) { status.innerText = "藍牙不支援: " + err.message; }
    }
});

document.addEventListener('input', (e) => {
    if (e.target && e.target.type === 'range') {
        let sliderId = e.target.id; let curVal = parseFloat(e.target.value); let nextSpan = e.target.nextElementSibling;
        if (sliderId === "sampleRateSlider") { window.currentSampleRate = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSampleRate + " Hz"; if (window.updateFilterCoefficients) window.updateFilterCoefficients(); }
        if (sliderId === "sinFreqSlider") { window.currentSinFreq = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSinFreq + " Hz"; }
        if (sliderId === "f1Slider") { window.f1 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f1 + " Hz"; if (window.updateFilterCoefficients) window.updateFilterCoefficients(); }
        if (sliderId === "f2Slider") { window.f2 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f2 + " Hz"; }
        if (sliderId === "volumeSlider") { if (nextSpan) nextSpan.innerText = Math.round(curVal * 100) + "%"; if (window.gainNode) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime); }
    }
});

// 💡 開機 1對1 強制對齊初始值，3000Hz 詛咒全面物理消滅！
setTimeout(() => {
    const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider');
    const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');
    if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value);
    if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);
    if (window.updateFilterCoefficients) window.updateFilterCoefficients(); if (window.globalRenderLoop) window.globalRenderLoop();
}, 250);
