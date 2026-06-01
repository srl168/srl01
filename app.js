if (window.audioInterval) clearInterval(window.audioInterval);
window.isWritingLock = false;

// 💡 鋼性純淨全域記憶體池
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

window.addEventListener('DOMContentLoaded', () => {
    window.S_UUID = 0xFF01; window.C_UUID = 0xFF02;
    window.bleCharacteristicObject = null;
    window.audioCtx = null; window.gainNode = null;

    window.tCanvas = document.getElementById('timeCanvas');
    window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d');
    window.fCtx = window.fCanvas.getContext('2d');

    window.currentFilterMode = 'RAW';
    window.f1 = 1000; window.f2 = 3000;
    window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0;

    window.updateFilterCoefficients = function() {
        let fr = window.currentSampleRate / window.f1, o = Math.tan(Math.PI / fr), q = Math.sqrt(2), c = 1 + q * o + o * o;
        if (window.currentFilterMode === 'LP') { window.b0 = o * o / c; window.b1 = 2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
        else if (window.currentFilterMode === 'HP') { window.b0 = 1 / c; window.b1 = -2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
    };

    window.applyFilter = function(x) { return x; };

    // 💡 成功架構回歸：點擊按鈕時徹底洗牌，高顯色點亮當前，4 個濾波鈕 100% 清晰好辨識！
    const fModes = { RAW: 'filterRaw', LP: 'filterLP', HP: 'filterHP', BP: 'filterBP' };
    Object.keys(fModes).forEach(m => {
        const btnEl = document.getElementById(fModes[m]);
        if (btnEl) {
            btnEl.addEventListener('click', () => {
                Object.keys(fModes).forEach(k => {
                    const targetBtn = document.getElementById(fModes[k]);
                    if (targetBtn) targetBtn.classList.remove('active');
                });
                btnEl.classList.add('active'); window.currentFilterMode = m;
                const f2View = document.getElementById('f2Container');
                if (f2View) f2View.style.display = m === 'BP' ? 'flex' : 'none';
                if (window.updateFilterCoefficients) window.updateFilterCoefficients();
            });
        }
    });
    const connectBtnEl = document.getElementById('connectBtn');
    if (connectBtnEl) {
        connectBtnEl.addEventListener('click', async () => {
            if (window.isSimulating) { const sBtn = document.getElementById('simBtn'); if (sBtn) sBtn.click(); }
            const status = document.getElementById('status');
            try {
                status.innerText = "正在搜尋藍牙裝置...";
                const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'ESP32' }], optionalServices: [window.S_UUID] });
                const server = await device.gatt.connect(); const service = await server.getPrimaryService(window.S_UUID);
                window.bleCharacteristicObject = await service.getCharacteristic(window.C_UUID);
                window.bleCharacteristicObject.removeEventListener('characteristicvaluechanged', window.currentBleHandler);
                window.currentBleHandler = (e) => { window.consumeRawBuffer(e.target.value); };
                window.bleCharacteristicObject.addEventListener('characteristicvaluechanged', window.currentBleHandler);
                await window.bleCharacteristicObject.startNotifications(); status.innerText = "▶️ 實體藍牙大水管對接成功！";
            } catch (err) { status.innerText = "底層連線失敗: " + err.message; }
        });
    }

    window.tCanvas.width = 800; window.tCanvas.height = 400;
    window.fCanvas.width = 800; window.fCanvas.height = 400;
    window.allInputsOnPage = Array.from(document.querySelectorAll('input[type="range"]'));
    
    // 💡 成功優化：開機完成的第一秒，自動執行萬能特徵點名，強制把滑桿真實初始值讀入大腦，杜絕 3000 卡死！
    if (window.allInputsOnPage) {
        window.allInputsOnPage.forEach(input => {
            let maxVal = parseFloat(input.max);
            if (maxVal > 10000) window.currentSampleRate = parseInt(input.value);
            else if (maxVal >= 1000 && maxVal <= 10000) window.currentSinFreq = parseInt(input.value);
        });
    }
});

window.initAudioGlobal = function() {
    if (window.audioInterval) clearInterval(window.audioInterval);
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
        let ab = window.audioCtx.createBuffer(1, audioChunk.length, window.currentSampleRate);
        ab.getChannelData(0).set(audioChunk); let src = window.audioCtx.createBufferSource(); src.buffer = ab; src.connect(window.gainNode);
        if (window.nextPlayTime < window.audioCtx.currentTime) { window.nextPlayTime = window.audioCtx.currentTime + 0.01; }
        src.start(window.nextPlayTime); window.nextPlayTime += ab.duration; 
    }
};
window.streamPureTimelineEngine = function() {
    if (!window.isSpeakerOn || !window.audioCtx) return;
    
    // 💡 5毫秒微切片技術：隨取樣率動態伸縮，每包資料跨度死鎖在 5ms，徹底洗淨低取樣 12000Hz 以下的任何微雜音！
    let chunkSize = Math.round(window.currentSampleRate * 0.005); if (chunkSize < 16) chunkSize = 16;
    let targetTime = window.audioCtx.currentTime + 0.10;
    
    if (window.isSimulating) {
        while (window.nextPlayTime < targetTime) {
            let audioChunk = new Float32Array(chunkSize);
            let oversampleFactor = 16, internalSR = window.currentSampleRate * oversampleFactor;
            let step = 2.0 * Math.PI * (window.currentSinFreq / internalSR);
            for (let i = 0; i < chunkSize; i++) {
                let sum = 0;
                for (let o = 0; o < oversampleFactor; o++) { sum += Math.sin(window.simPhase); window.simPhase += step; if (window.simPhase >= 2 * Math.PI) window.simPhase -= 2 * Math.PI; }
                let val = sum / oversampleFactor; let fVal = window.applyFilter ? window.applyFilter(val) : val;
                audioChunk[i] = fVal; window.filteredDataLog.push(fVal);
                window.analysisBuffer[window.bufferIndex] = fVal; window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
            }
            if (window.filteredDataLog.length > 4000) window.filteredDataLog = window.filteredDataLog.slice(-3000);
            window.playAudioChunkDirect(audioChunk);
        }
        return;
    }
    if (window.filteredDataLog.length < 300) return;
    while (window.nextPlayTime < targetTime) { let rawChunk = window.filteredDataLog.slice(-250); window.playAudioChunkDirect(rawChunk); }
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

let renderFrameCounter = 0;
window.globalRenderLoop = function() {
    requestAnimationFrame(window.globalRenderLoop); renderFrameCounter++; if (renderFrameCounter % 2 !== 0) return;
    if (window.filteredDataLog.length < 50) return;

    // 💡 鋼性像素保底：擷取點數無條件「最低保底 128 點」，徹底防止低取樣下波形被無情拉扁、拉直、壓矮！
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
    let peakFreq = maxIdx * (window.currentSampleRate / window.FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
    window.tCtx.clearRect(0, 0, window.tCanvas.width, window.tCanvas.height);
    window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, window.tCanvas.width, window.tCanvas.height); window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath();
    let midY = window.tCanvas.height / 2;

    // 💡 內插補點器：將保底的骨架點無縫補滿 150 個流暢像素點，低採樣下正弦波依舊高聳挺拔！
    let renderPointsCount = 150; let outPoints = new Float32Array(renderPointsCount);
    for (let i = 0; i < renderPointsCount; i++) {
        let virtualIdx = i * (rawSlice.length - 1) / (renderPointsCount - 1);
        let idxBase = Math.floor(virtualIdx), idxNext = Math.ceil(virtualIdx), weight = virtualIdx - idxBase;
        outPoints[i] = rawSlice[idxBase] * (1 - weight) + rawSlice[idxNext] * weight;
    }

    let tSlice = window.tCanvas.width / (renderPointsCount - 1);
    let x0 = 0, y0 = midY - (outPoints * (window.tCanvas.height / 2.3)); window.tCtx.moveTo(x0, y0);
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
    for (let n = 0; n < window.FFT_SIZE / 4; n++) { curX = n * fSlice, y = window.fCanvas.height - (magnitudes[n] * window.fCanvas.height * 200); if (n == 0) window.fCtx.moveTo(curX, y); else window.fCtx.lineTo(curX, y); }
    window.fCtx.stroke();
};

document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'simBtn') {
        window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn');
        if (window.isSimulating) { window.initAudioGlobal(); if (btn) { btn.innerText = "🛑 停止本地模擬測試"; btn.className = "btn-sim active"; } document.getElementById('status').innerText = "▶️ 離線沙盒：萬能特徵型流暢架構已點火！"; }
        else { 
            if (window.audioInterval) clearInterval(window.audioInterval);
            if (window.audioCtx) window.nextPlayTime = window.audioCtx.currentTime;
            window.filteredDataLog = []; if (btn) { btn.innerText = "🛠️ 開啟本地資料模擬測試"; btn.className = "btn-sim"; }
            document.getElementById('status').innerText = "狀態：模擬測試已停止。"; 
        }
    }
    if (e.target && e.target.id === 'speakerBtn') {
        window.initAudioGlobal(); window.isSpeakerOn = !window.isSpeakerOn; const sBtn = document.getElementById('speakerBtn');
        if (sBtn) { sBtn.innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉"; sBtn.className = window.isSpeakerOn ? "btn-speaker" : "btn-speaker muted"; }
    }
});

// 💡 萬能特徵型滑桿監聽器：100% 聽話、絕不噴任何 ReferenceError 錯字！4 顆按鈕滿血復活！
document.addEventListener('input', (e) => {
    if (e.target && e.target.type === 'range') {
        let maxVal = parseFloat(e.target.max);
        let curVal = parseFloat(e.target.value);
        let nextSpan = e.target.nextElementSibling;
        
        if (maxVal > 10000) {
            window.currentSampleRate = parseInt(curVal);
            if (nextSpan && nextSpan.tagName === 'SPAN') nextSpan.innerText = window.currentSampleRate + " Hz";
            if (window.updateFilterCoefficients) window.updateFilterCoefficients();
        }
        else if (maxVal >= 1000 && maxVal <= 10000) {
            window.currentSinFreq = parseInt(curVal); // 💡 0毫秒鋼性更新！
            if (nextSpan && nextSpan.tagName === 'SPAN') nextSpan.innerText = window.currentSinFreq + " Hz";
        }
        else if (maxVal <= 1.0) {
            if (nextSpan && nextSpan.tagName === 'SPAN') nextSpan.innerText = Math.round(curVal * 100) + "%";
            if (window.gainNode && !isNaN(curVal) && isFinite(curVal)) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime);
        }
    }
});

setTimeout(() => { if (window.updateFilterCoefficients) window.updateFilterCoefficients(); if (window.globalRenderLoop) window.globalRenderLoop(); }, 250);
