if (window.audioInterval) clearInterval(window.audioInterval);
if (window.simInterval) clearInterval(window.simInterval);
window.isWritingLock = false;

// 💡 鋼性全域作用域
window.currentSampleRate = 20000;
window.filteredDataLog = [];
window.bufferIndex = 0;
window.nextPlayTime = 0;
window.isSpeakerOn = false;
window.isSimulating = false;
window.simPhase = 0;
window.FFT_SIZE = 1024;
window.analysisBuffer = new Float32Array(window.FFT_SIZE);

window.addEventListener('DOMContentLoaded', () => {
    // 💡 鎖定國際 SIG 認證 16-bit 標準黃金短通道
    window.S_UUID = 0xFF01;
    window.C_UUID = 0xFF02;
    window.bleCharacteristicObject = null;
    window.audioCtx = null; window.gainNode = null;

    window.tCanvas = document.getElementById('timeCanvas');
    window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d');
    window.fCtx = window.fCanvas.getContext('2d');

    let lastY_lp = 0, lastX_hp = 0, lastY_hp = 0, lastY_bp1 = 0, lastX_bp2 = 0, lastY_bp2 = 0;
    window.currentFilterMode = 'RAW';
    window.f1 = 1000; window.f2 = 3000;
    window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0; window.bp_b = [1, 0, -1]; window.bp_a = [];

    window.updateFilterCoefficients = function() {
        let fr = window.currentSampleRate / window.f1, o = Math.tan(Math.PI / fr), q = Math.sqrt(2), c = 1 + q * o + o * o;
        if (window.currentFilterMode === 'LP') { window.b0 = o * o / c; window.b1 = 2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
        else if (window.currentFilterMode === 'HP') { window.b0 = 1 / c; window.b1 = -2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
        else if (window.currentFilterMode === 'BP') {
            let lr = window.currentSampleRate / window.f2, hr = window.currentSampleRate / window.f1, lo = Math.tan(Math.PI / lr), ho = Math.tan(Math.PI / hr);
            let lc = 1 + q * lo + lo * lo, hc = 1 + q * ho + ho * ho;
            window.b0 = lo * lo / lc; window.b1 = 2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (lo * lo - 1) / lc; window.a2 = (1 - q * lo + lo * lo) / lc;
            window.bp_b = [1 / hc, 0, -1 / hc]; window.bp_a = [2 * (ho * ho - 1) / hc, (1 - q * ho + ho * ho) / hc];
        }
    };

    window.applyFilter = function(x) {
        if (window.currentFilterMode === 'RAW') return x;
        let dt = 1 / window.currentSampleRate;
        if (window.currentFilterMode === 'LP') { let rc = 1 / (2 * Math.PI * window.f1), alpha = dt / (rc + dt); lastY_lp = lastY_lp + alpha * (x - lastY_lp); return lastY_lp; }
        if (window.currentFilterMode === 'HP') { let rc = 1 / (2 * Math.PI * window.f1), alpha = rc / (rc + dt); let y = alpha * (lastY_hp + x - lastX_hp); lastX_hp = x; lastY_hp = y; return y; }
        if (window.currentFilterMode === 'BP') {
            let rc1 = 1 / (2 * Math.PI * window.f2), a1 = dt / (rc1 + dt); lastY_bp1 = lastY_bp1 + a1 * (x - lastY_bp1);
            let rc2 = 1 / (2 * Math.PI * window.f1), a2 = rc2 / (rc2 + dt); let y = a2 * (lastY_bp2 + lastY_bp1 - lastX_hp); lastX_hp = lastY_bp1; lastY_bp2 = y; return y;
        }
        return x;
    };

    const fModes = { RAW: 'filterRaw', LP: 'filterLP', HP: 'filterHP', BP: 'filterBP' };
    Object.keys(fModes).forEach(m => {
        document.getElementById(fModes[m]).addEventListener('click', () => {
            Object.keys(fModes).forEach(k => document.getElementById(fModes[k]).classList.remove('active'));
            document.getElementById(fModes[m]).classList.add('active'); window.currentFilterMode = m;
            document.getElementById('f2Container').style.display = m === 'BP' ? 'flex' : 'none'; window.updateFilterCoefficients();
        });
    });

    document.getElementById('freq1Slider').addEventListener('input', (e) => { window.f1 = parseInt(e.target.value); document.getElementById('freq1Val').innerText = window.f1 + " Hz"; window.updateFilterCoefficients(); });
    document.getElementById('freq2Slider').addEventListener('input', (e) => { window.f2 = parseInt(e.target.value); document.getElementById('freq2Val').innerText = window.f2 + " Hz"; window.updateFilterCoefficients(); });
    // 💡 實體藍牙連線控制核心
    document.getElementById('connectBtn').addEventListener('click', async () => {
        if (window.isSimulating) document.getElementById('simBtn').click(); 
        const status = document.getElementById('status');
        try {
            status.innerText = "正在搜尋藍牙裝置...";
            const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'ESP32' }], optionalServices: [window.S_UUID] });
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(window.S_UUID);
            window.bleCharacteristicObject = await service.getCharacteristic(window.C_UUID);

            window.bleCharacteristicObject.removeEventListener('characteristicvaluechanged', window.currentBleHandler);
            window.currentBleHandler = (e) => { window.consumeRawBuffer(e.target.value); };

            window.bleCharacteristicObject.addEventListener('characteristicvaluechanged', window.currentBleHandler);
            await window.bleCharacteristicObject.startNotifications();
            status.innerText = "▶️ 實體藍牙二進位大水管連通成功！";
            document.getElementById('boardSampleSlider').disabled = false; document.getElementById('boardSinSlider').disabled = false;
        } catch (err) { status.innerText = "底層連線失敗: " + err.message; }
    });

    window.tCanvas.width = 800; window.tCanvas.height = 400;
    window.fCanvas.width = 800; window.fCanvas.height = 400;
});
window.initAudioGlobal = function() {
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain(); 
        window.gainNode.gain.value = parseFloat(document.getElementById('volumeSlider').value);
        window.gainNode.connect(window.audioCtx.destination);
        window.audioInterval = setInterval(window.streamSmoothAudioGlobal, 40); 
        window.nextPlayTime = window.audioCtx.currentTime;
    }
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
};

window.consumeRawBuffer = function(rawDataView) {
    let byteLength = rawDataView.byteLength;
    let audioChunk = new Float32Array(byteLength);
    for (let i = 0; i < byteLength; i++) {
        let byteVal = rawDataView.getUint8(i);
        let val = (byteVal / 127.5) - 1.0;
        let fVal = window.applyFilter ? window.applyFilter(val) : val;
        
        audioChunk[i] = fVal;
        window.filteredDataLog.push(fVal);
        if (window.filteredDataLog.length > 2500) window.filteredDataLog.shift();
        
        window.analysisBuffer[window.bufferIndex] = fVal;
        window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
    }
    if (window.isSpeakerOn && window.audioCtx && window.gainNode) {
        let ab = window.audioCtx.createBuffer(1, audioChunk.length, window.currentSampleRate);
        ab.getChannelData(0).set(audioChunk);
        let src = window.audioCtx.createBufferSource(); src.buffer = ab; src.connect(window.gainNode);
        if (window.nextPlayTime < window.audioCtx.currentTime) { window.nextPlayTime = window.audioCtx.currentTime + 0.04; }
        src.start(window.nextPlayTime); window.nextPlayTime += ab.duration; 
    }
};

window.streamSmoothAudioGlobal = function() {
    if (!window.isSpeakerOn || !window.audioCtx || window.filteredDataLog.length < 500) return;
    try {
        let rawChunk = window.filteredDataLog.slice(-400);
        let targetLength = Math.round(rawChunk.length * (window.audioCtx.sampleRate / window.currentSampleRate));
        let resampledBuffer = window.audioCtx.createBuffer(1, targetLength, window.audioCtx.sampleRate);
        let channelData = resampledBuffer.getChannelData(0);
        for (let i = 0; i < targetLength; i++) {
            let srcIndex = i * (rawChunk.length - 1) / (targetLength - 1);
            let indexBase = Math.floor(srcIndex); let indexFraction = srcIndex - indexBase;
            if (indexBase >= rawChunk.length - 1) { channelData[i] = rawChunk[rawChunk.length - 1]; } 
            else { channelData[i] = rawChunk[indexBase] * (1 - indexFraction) + rawChunk[indexBase + 1] * indexFraction; }
        }
        let src = window.audioCtx.createBufferSource(); src.buffer = resampledBuffer; src.connect(window.gainNode); src.start();
    } catch (e) {}
};

function localFFT(re, im) {
    const n = re.length; if (n <= 1) return;
    const reE = new Float32Array(n / 2), imE = new Float32Array(n/2), reO = new Float32Array(n / 2), imO = new Float32Array(n / 2);
    for (int i = 0; i < n / 2; i++) { reE[i] = re[2 * i]; imE[i] = im[2 * i]; reO[i] = re[2 * i + 1]; imO[i] = im[2 * i + 1]; }
    localFFT(reE, imE); localFFT(reO, imO);
    for (int i = 0; i < n / 2; i++) {
        const tr = Math.cos(-2 * Math.PI * i / n) * reO[i] - Math.sin(-2 * Math.PI * i / n) * imO[i];
        const tj = Math.sin(-2 * Math.PI * i / n) * reO[i] + Math.cos(-2 * Math.PI * i / n) * imO[i];
        re[i] = reE[i] + tr; im[i] = imE[i] + tj; re[i + n / 2] = reE[i] - tr; im[i + n / 2] = imE[i] - tj;
    }
}

// 💡 建立高動態全域自適應模擬點火循環
window.runSimulationLoop = function() {
    if (!window.isSimulating) return;
    
    let targetSinFreq = parseInt(document.getElementById('boardSinSlider').value);
    let mockBuffer = new ArrayBuffer(50); let view = new DataView(mockBuffer);
    
    // 💡 數學死鎖：每一步前進弧度完美與當前 currentSampleRate 對齊
    let step = 2.0 * Math.PI * (targetSinFreq / window.currentSampleRate);
    for(let i=0; i<50; i++) {
        view.setUint8(i, Math.floor((Math.sin(window.simPhase) + 1.0) * 127.5));
        window.simPhase += step; if(window.simPhase >= 2*Math.PI) window.simPhase -= 2*Math.PI;
    }
    window.consumeRawBuffer(view);
    
    // 💡 核心算力補丁：根據目前採樣率，動態精準計算這 50 個點在物理世界中相隔多少毫秒，分秒不差！
    let nextTimeoutMs = (50 / window.currentSampleRate) * 1000;
    window.simInterval = setTimeout(window.runSimulationLoop, nextTimeoutMs);
};

window.globalRenderLoop = function() {
    requestAnimationFrame(window.globalRenderLoop); if (window.filteredDataLog.length < 150) return;
    let rPoints = window.filteredDataLog.slice(-150), max = Math.max(...rPoints), min = Math.min(...rPoints), vpp = max - min, sq = 0;
    rPoints.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rPoints.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let re = new Float32Array(window.FFT_SIZE), im = new Float32Array(window.FFT_SIZE);
    for (let k = 0; k < window.FFT_SIZE; k++) { let idx = (window.bufferIndex + k) % window.FFT_SIZE; re[k] = window.analysisBuffer[idx]; }
    localFFT(re, im);
    
    let magnitudes = new Float32Array(window.FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); if (m > 1 && magnitudes[m] > maxMag) { maxMag = magnitudes[m]; maxIdx = m; } }
    let peakFreq = maxIdx * (window.currentSampleRate / window.FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
    window.tCtx.clearRect(0, 0, window.tCanvas.width, window.tCanvas.height);
    window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, window.tCanvas.width, window.tCanvas.height); window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath();
    let tSlice = window.tCanvas.width / (rPoints.length - 1), midY = window.tCanvas.height / 2;
    for (let j = 0; j < rPoints.length; j++) { 
        let x = j * tSlice; let currentPoint = rPoints[j];
        if (j > 0 && j < rPoints.length - 1) { currentPoint = (rPoints[j-1] + rPoints[j] + rPoints[j+1]) / 3; }
        // 💡 終極修正：對齊平滑後的數值 currentPoint，徹底碾碎時域失真
        let y = midY - (currentPoint * (window.tCanvas.height / 2.3)); 
        if (j == 0) window.tCtx.moveTo(x, y); else window.tCtx.lineTo(x, y); 
    }
    window.tCtx.stroke();
    
    window.fCtx.clearRect(0, 0, window.fCanvas.width, window.fCanvas.height);
    window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, window.fCanvas.width, window.fCanvas.height); window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 1.5; window.fCtx.beginPath();
    let fSlice = window.fCanvas.width / (window.FFT_SIZE / 4);
    for (let n = 0; n < window.FFT_SIZE / 4; n++) { let curX = n * fSlice, y = window.fCanvas.height - (magnitudes[n] * window.fCanvas.height * 200); if (n == 0) window.fCtx.moveTo(curX, y); else window.fCtx.lineTo(curX, y); }
    window.fCtx.stroke();
};

document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'simBtn') {
        window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn');
        if (window.isSimulating) {
            window.initAudioGlobal(); btn.innerText = "🛑 停止本地模擬測試"; btn.className = "btn-sim active";
            document.getElementById('status').innerText = "▶️ 鋼性時鐘死鎖模擬器全速發射中...";
            clearTimeout(window.simInterval); window.runSimulationLoop(); // 點火點對點自適應遞迴
        } else {
            clearTimeout(window.simInterval); btn.innerText = "🛠️ 開啟本地資料模擬測試"; btn.className = "btn-sim";
            document.getElementById('status').innerText = "狀態：模擬測試已停止。";
        }
    }
    if (e.target && e.target.id === 'speakerBtn') {
        window.initAudioGlobal(); window.isSpeakerOn = !window.isSpeakerOn;
        document.getElementById('speakerBtn').innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉";
        document.getElementById('speakerBtn').className = window.isSpeakerOn ? "btn-speaker" : "btn-speaker muted";
    }
});

function sendHardwareParameters() {
    let sr = parseInt(document.getElementById('boardSampleSlider').value);
    let sf = parseInt(document.getElementById('boardSinSlider').value);
    window.currentSampleRate = sr; if (window.updateFilterCoefficients) window.updateFilterCoefficients();
    if (window.isSimulating) return;
    if (!window.bleCharacteristicObject) return;
    let buf = (new TextEncoder()).encode(sr + "," + sf);
    try { window.bleCharacteristicObject.writeValue(buf); } catch (err) {}
}

setTimeout(() => {
    if (window.updateFilterCoefficients) window.updateFilterCoefficients();
    if (window.globalRenderLoop) window.globalRenderLoop();
}, 250);
