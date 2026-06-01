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
window.FFT_SIZE = 1024;
window.analysisBuffer = new Float32Array(window.FFT_SIZE);

window.currentFilterMode = 'RAW';
window.f1 = 1000; window.f2 = 3000;

window.audioCtx = null; window.gainNode = null;
window.oscNode = null; window.hardwareFilter = null; window.hardwareAnalyser = null;
let renderFrameCounter = 0;

// ==========================================
// 💡 2️⃣ 數位濾波器硬體晶片平滑同步閘門（100% 消除 F1、F2 互相卡死不反應黑洞！）
// ==========================================
window.updateFilterCoefficients = function() {
    if (!window.hardwareFilter || !window.audioCtx) return;
    try {
        let t = window.audioCtx.currentTime + 0.005; // 💡 給予硬體晶片 5 毫秒的平滑緩衝通道
        
        if (window.currentFilterMode === 'RAW') { 
            window.hardwareFilter.type = 'allpass'; 
        }
        else if (window.currentFilterMode === 'LP') { 
            window.hardwareFilter.type = 'lowpass'; 
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
        }
        else if (window.currentFilterMode === 'HP') { 
            window.hardwareFilter.type = 'highpass'; 
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
        }
        else if (window.currentFilterMode === 'BP') { 
            window.hardwareFilter.type = 'bandpass'; 
            // 💡 鋼性解鎖：改用硬體平滑緩降通道，單單拉任何一根拉桿都能 0 階梯獨立完美響應！
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
            
            let qVal = window.f1 / (window.f2 > 0 ? window.f2 : 1.0); if (qVal < 0.1) qVal = 0.1;
            window.hardwareFilter.Q.linearRampToValueAtTime(qVal, t);
        }
    } catch (e) {}
};

window.applyFilter = function(x) { return x; };

window.addEventListener('DOMContentLoaded', () => {
    window.S_UUID = 0xFF01; window.C_UUID = 0xFF02;
    window.tCanvas = document.getElementById('timeCanvas'); window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d'); window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400; window.fCanvas.width = 800; window.fCanvas.height = 400;
});
//
// ==========================================
// 💡 3️⃣ 聲學大革命：純網頁音訊硬體圖學直連（控制台 100% 乾淨雪白）
// ==========================================
window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode.disconnect(); window.oscNode = null; }
    
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain();
        window.hardwareFilter = window.audioCtx.createBiquadFilter(); 
        window.hardwareAnalyser = window.audioCtx.createAnalyser();   
        window.hardwareAnalyser.fftSize = window.FFT_SIZE;
        
        window.hardwareFilter.connect(window.hardwareAnalyser);
        window.hardwareAnalyser.connect(window.gainNode);
        window.gainNode.connect(window.audioCtx.destination);
    }
    
    if (window.audioCtx.state === 'suspended') { window.audioCtx.resume(); }
    window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? 0.3 : 0.0, window.audioCtx.currentTime);
    window.updateFilterCoefficients();

    if (window.isSimulating) {
        window.oscNode = window.audioCtx.createOscillator();
        window.oscNode.type = 'sine';
        window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime);
        window.oscNode.connect(window.hardwareFilter); 
        window.oscNode.start();
    }
};

window.consumeRawBuffer = function(rawDataView) {
    let byteLength = rawDataView.byteLength;
    for (let i = 0; i < byteLength; i++) {
        let byteVal = rawDataView.getUint8(i); let val = (byteVal / 127.5) - 1.0;
        window.filteredDataLog.push(val);
        if (window.filteredDataLog.length > 5000) window.filteredDataLog.shift(); 
        window.analysisBuffer[window.bufferIndex] = val; window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
    }
};
//
window.globalRenderLoop = function() {
    requestAnimationFrame(window.globalRenderLoop); if (!window.hardwareAnalyser) return;
    renderFrameCounter++; if (renderFrameCounter % 2 !== 0) return;
    
    let timeData = new Float32Array(window.FFT_SIZE); window.hardwareAnalyser.getFloatTimeDomainData(timeData);
    let freqData = new Float32Array(window.hardwareAnalyser.frequencyBinCount); window.hardwareAnalyser.getFloatFrequencyData(freqData);
    
    if (window.isSimulating) {
        window.filteredDataLog = Array.from(timeData);
        for (let m = 0; m < window.FFT_SIZE; m++) { window.analysisBuffer[m] = timeData[m]; }
    }
    if (window.filteredDataLog.length < 50) return;

    let adaptivePointsCount = Math.round((3 * (window.audioCtx ? window.audioCtx.sampleRate : 44100)) / window.currentSinFreq * (44100 / window.currentSampleRate));
    if (adaptivePointsCount < 64) adaptivePointsCount = 64; if (adaptivePointsCount > window.FFT_SIZE) adaptivePointsCount = window.FFT_SIZE;

    let rawSlice = window.filteredDataLog.slice(-adaptivePointsCount);
    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), vpp = max - min, sq = 0;
    rawSlice.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rawSlice.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let maxMag = -Infinity, maxIdx = 0;
    for (let i = 0; i < freqData.length; i++) { if (freqData[i] > maxMag) { maxMag = freqData[i]; maxIdx = i; } }
    let peakFreq = maxIdx * ((window.audioCtx ? window.audioCtx.sampleRate : 44100) / window.FFT_SIZE);
    document.getElementById('freqVal').innerText = maxMag > -100 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
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
    let fSlice = window.fCanvas.width / (freqData.length / 2);
    for (let n = 0; n < freqData.length / 2; n++) { let y = window.fCanvas.height - ((freqData[n] + 140) * (window.fCanvas.height / 140)); if (n == 0) window.fCtx.moveTo(0, y); else window.fCtx.lineTo(n * fSlice, y); }
    window.fCtx.stroke();
};

document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return;
    const clickId = e.target.id;
    if (clickId === 'simBtn') {
        window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn'); window.initAudioGlobal();
        if (btn) { btn.innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試"; btn.className = window.isSimulating ? "btn-sim active" : "btn-sim"; }
        document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：硬體平滑緩降通道點火！" : "狀態：模擬測試已停止。";
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
        window.updateFilterCoefficients();
    }
    if (clickId === 'connectBtn') {
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
        if (sliderId === "sampleRateSlider") { window.currentSampleRate = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSampleRate + " Hz"; window.updateFilterCoefficients(); }
        if (sliderId === "sinFreqSlider") { window.currentSinFreq = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSinFreq + " Hz"; if (window.oscNode && window.audioCtx) window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime); }
        if (sliderId === "f1Slider") { window.f1 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f1 + " Hz"; window.updateFilterCoefficients(); }
        if (sliderId === "f2Slider") { window.f2 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f2 + " Hz"; window.updateFilterCoefficients(); }
        if (sliderId === "volumeSlider") { if (nextSpan) nextSpan.innerText = Math.round(curVal * 100) + "%"; if (window.gainNode && window.audioCtx) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime); }
    }
});

window.onload = function() {
    const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider');
    const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');
    if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value);
    if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);
    if (window.globalRenderLoop) window.globalRenderLoop();
};
