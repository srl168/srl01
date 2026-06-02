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
window.oscNode = null; window.oscNode2 = null; 
window.hardwareFilter = null; window.hardwareAnalyser = null;
let renderFrameCounter = 0;

// ==========================================
// 💡 2️⃣ 100% 硬件晶片加速的濾波器型態同步閘門（帶有 5ms 硬件平滑過渡通道）
// ==========================================
window.updateFilterCoefficients = function() {
    if (!window.hardwareFilter || !window.audioCtx) return;
    try {
        let t = window.audioCtx.currentTime + 0.005; 
        
        if (window.currentFilterMode === 'RAW') { 
            window.hardwareFilter.type = 'allpass'; 
        }
        else if (window.currentFilterMode === 'LP') { 
            window.hardwareFilter.type = 'lowpass'; 
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
            let dynamicQ = 0.1 + (window.f2 / 5000.0) * 9.9;
            if (dynamicQ < 0.1) dynamicQ = 0.1; if (dynamicQ > 10.0) dynamicQ = 10.0;
            window.hardwareFilter.Q.linearRampToValueAtTime(dynamicQ, t);
        }
        else if (window.currentFilterMode === 'HP') { 
            window.hardwareFilter.type = 'highpass'; 
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
            let dynamicQ = 0.1 + (window.f2 / 5000.0) * 9.9;
            if (dynamicQ < 0.1) dynamicQ = 0.1; if (dynamicQ > 10.0) dynamicQ = 10.0;
            window.hardwareFilter.Q.linearRampToValueAtTime(dynamicQ, t);
        }
        else if (window.currentFilterMode === 'BP') { 
            window.hardwareFilter.type = 'bandpass'; 
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
            let qVal = window.f1 / (window.f2 > 0 ? window.f2 : 1.0); if (qVal < 0.1) qVal = 0.1;
            window.hardwareFilter.Q.linearRampToValueAtTime(qVal, t);
        }
    } catch (e) {}
};

window.applyFilter = function(x) { return x; };

window.addEventListener('DOMContentLoaded', () => {
    window.tCanvas = document.getElementById('timeCanvas'); window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d'); window.fCtx = window.fCanvas.getContext('2d');
    // 💡 剛性初始化：在網頁加載完畢的第一毫秒，無條件強制賦予實體解像度像素骨架！
    window.tCanvas.width = 800; window.tCanvas.height = 400; window.fCanvas.width = 800; window.fCanvas.height = 400;
});
window.oscNode = null; window.oscNode2 = null; window.scriptNode = null;

// ==========================================
// 💡 3️⃣ 聲學大革命：100% 純硬體雙音對照組直通網路（控制台 0 警告、0 雜音）
// ==========================================
window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode.disconnect(); window.oscNode = null; }
    if (window.oscNode2) { try { window.oscNode2.stop(); } catch(e){} window.oscNode2.disconnect(); window.oscNode2 = null; }
    
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

        window.oscNode2 = window.audioCtx.createOscillator();
        window.oscNode2.type = 'sine';
        // 💡 實務雙音對照組：音頻 2 固定鎖死在主頻率的 0.4 倍，製造最漂亮的複頻和聲
        window.oscNode2.frequency.setValueAtTime(window.currentSinFreq * 0.4, window.audioCtx.currentTime);

        window.oscNode.connect(window.hardwareFilter);
        window.oscNode2.connect(window.hardwareFilter);
        window.oscNode.start();
        window.oscNode2.start();
    }
};

window.consumeRawBuffer = function(rawDataView) {
    if (window.hardwareAnalyser) {
        let buffer = new Float32Array(window.FFT_SIZE);
        window.hardwareAnalyser.getFloatTimeDomainData(buffer);
    }
};
window.globalRenderLoop = function() {
    requestAnimationFrame(window.globalRenderLoop); if (!window.hardwareAnalyser) return;
    renderFrameCounter++; if (renderFrameCounter % 2 !== 0) return;
    
    // 💡 剛性門閥校準：在每一格繪圖刷新時，無條件暴力死鎖實體解析度，徹底摧毀 CSS 的拉伸剪切！
    if (window.tCanvas.width !== 800) { window.tCanvas.width = 800; window.tCanvas.height = 400; }
    if (window.fCanvas.width !== 800) { window.fCanvas.width = 800; window.fCanvas.height = 400; }

    let timeData = new Float32Array(window.FFT_SIZE); window.hardwareAnalyser.getFloatTimeDomainData(timeData);
    let freqData = new Float32Array(window.hardwareAnalyser.frequencyBinCount); window.hardwareAnalyser.getFloatFrequencyData(freqData);
    
    if (window.isSimulating) {
        window.filteredDataLog = Array.from(timeData);
        for (let m = 0; m < window.FFT_SIZE; m++) { window.analysisBuffer[m] = timeData[m]; }
    }
    if (window.filteredDataLog.length < 50) return;

    let minFreq = window.currentSinFreq * 0.4;
    let adaptivePointsCount = Math.round((3 * (window.audioCtx ? window.audioCtx.sampleRate : 44100)) / (minFreq > 0 ? minFreq : 1000) * (44100 / window.currentSampleRate));
    if (adaptivePointsCount < 64) adaptivePointsCount = 64; if (adaptivePointsCount > window.FFT_SIZE) adaptivePointsCount = window.FFT_SIZE;

    let rawSlice = window.filteredDataLog.slice(0, adaptivePointsCount);
    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), vpp = max - min, sq = 0;
    rawSlice.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rawSlice.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let maxMag = -Infinity, maxIdx = 0;
    for (let i = 0; i < freqData.length; i++) { if (freqData[i] > maxMag) { maxMag = freqData[i]; maxIdx = i; } }
    let peakFreq = maxIdx * ((window.audioCtx ? window.audioCtx.sampleRate : 44100) / window.FFT_SIZE);
    document.getElementById('freqVal').innerText = maxMag > -100 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
    // ==========================================
    // 💡 時域畫布渲染（強制 800x400 安全座標系）
    // ==========================================
    window.tCtx.clearRect(0, 0, 800, 400);
    window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, 800, 400);
    
    let midY = 200; let scaleY = 150; // 在 400 高度中留出安全上下邊界

    // 💡 繪製絕對純白 (#ffffff) 電壓橫網格
    window.tCtx.strokeStyle = '#444444'; window.tCtx.lineWidth = 1; window.tCtx.beginPath();
    let voltSteps = [1.0, 0.5, 0.0, -0.5, -1.0];
    voltSteps.forEach(v => { let yPos = midY - v * scaleY; window.tCtx.moveTo(0, yPos); window.tCtx.lineTo(800, yPos); });
    window.tCtx.stroke();

    // 💡 將字體無條件改成高對比純白，並加上安全向右內縮偏移，防擠壓出界！
    window.tCtx.fillStyle = '#ffffff'; window.tCtx.font = 'bold 13px Courier New';
    voltSteps.forEach(v => { let yPos = midY - v * scaleY; window.tCtx.fillText((v >= 0 ? "+" : "") + v.toFixed(1) + "V", 25, yPos + 5); });

    // 繪製綠色波形
    window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath();
    let tSlice = 800 / (rawSlice.length - 1);
    window.tCtx.moveTo(0, midY - ((rawSlice[0] || 0) * scaleY));
    for (let j = 0; j < rawSlice.length - 1; j++) {
        let x1 = j * tSlice; let y1 = midY - ((rawSlice[j] || 0) * scaleY);
        let x2 = (j + 1) * tSlice; let y2 = midY - ((rawSlice[j + 1] || 0) * scaleY);
        window.tCtx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2); 
    }
    window.tCtx.stroke();
    
    let totalTimeMs = (rawSlice.length / window.currentSampleRate) * 1000;
    window.tCtx.fillStyle = '#00ff66'; window.tCtx.fillText("全幅時間: " + totalTimeMs.toFixed(2) + " ms", 620, 380);

    // ==========================================
    // 💡 頻域畫布渲染（強制 800x400，安全內縮 40像素留給底部數字標籤）
    // ==========================================
    window.fCtx.clearRect(0, 0, 800, 400);
    window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400);
    
    // 💡 繪製頻域 5 等分實體垂直灰線網格（座標精準限制在 0 ~ 800 內）
    window.fCtx.strokeStyle = '#444444'; window.fCtx.lineWidth = 1; window.fCtx.beginPath();
    for (let k = 0; k <= 4; k++) { let xPos = 200 * k; if (k === 4) xPos = 799; window.fCtx.moveTo(xPos, 0); window.fCtx.lineTo(xPos, 360); }
    window.fCtx.stroke();

    // 💡 強制印上純白高鮮明實體 kHz 數字刻度（安全抬高在畫布底端 385 像素位置，絕不沉底！）
    window.fCtx.fillStyle = '#ffffff'; window.fCtx.font = 'bold 13px Courier New';
    let nyquistFreq = window.currentSampleRate / 2;
    for (let k = 0; k <= 4; k++) {
        let xPos = 200 * k; let currentTickFreq = (nyquistFreq / 4) * k;
        let txt = (currentTickFreq / 1000).toFixed(2) + " kHz";
        let textOffset = k === 0 ? 15 : (k === 4 ? -75 : -30); // 邊緣向內對齊優化
        window.fCtx.fillText(txt, xPos + textOffset, 385);
    }

    // 繪製黃色頻譜波形
    window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 2.0; window.fCtx.beginPath();
    let fSlice = 800 / (freqData.length / 2);
    for (let n = 0; n < freqData.length / 2; n++) { 
        // 💡 剛性安全視野校準：將 Y 軸底部鎖死在 360 像素，留出最乾淨、最空曠的下方空間印數字！
        let y = 360 - ((freqData[n] + 140) * (350 / 140)); 
        if (y < 10) y = 10; if (y > 358) y = 358;
        if (n == 0) window.fCtx.moveTo(0, y); else window.fCtx.lineTo(n * fSlice, y); 
    }
    window.fCtx.stroke();
};

document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return;
    const clickId = e.target.id;
    if (clickId === 'simBtn') {
        window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn'); window.initAudioGlobal();
        if (btn) { btn.innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試"; btn.className = window.isSimulating ? "btn-sim active" : "btn-sim"; }
        document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：800x400 鋼性解析度刻度尺開機！" : "狀態：模擬測試已停止。";
    }
    if (clickId === 'speakerBtn') {
        window.isSpeakerOn = !window.isSpeakerOn; const sBtn = document.getElementById('speakerBtn');
        if (sBtn) { sBtn.innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉"; sBtn.className = window.isSpeakerOn ? "btn-speaker" : "btn-speaker muted"; }
        if (window.gainNode && window.audioCtx) window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? 0.3 : 0.0, window.audioCtx.currentTime);
    }
    const fModes = { filterRaw: 'RAW', filterLP: 'LP', filterHP: 'HP', filterBP: 'BP' };
    if (fModes[clickId]) {
        Object.keys(fModes).forEach(k => { const tBtn = document.getElementById(k); if (tBtn) tBtn.classList.remove('active'); });
        e.target.classList.add('active'); window.currentFilterMode = fModes[clickId];
        const f2View = document.getElementById('f2Container'); if (f2View) f2View.style.display = 'flex';
        
        const f2SliderEl = document.getElementById('f2Slider');
        if (f2SliderEl && f2SliderEl.nextElementSibling) {
            if (window.currentFilterMode === 'LP' || window.currentFilterMode === 'HP') {
                let dQ = 0.1 + (window.f2 / 5000.0) * 9.9; f2SliderEl.nextElementSibling.innerText = "Q: " + dQ.toFixed(2);
            } else { f2SliderEl.nextElementSibling.innerText = window.f2 + " Hz"; }
        }
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
        if (sliderId === "sinFreqSlider") { 
            window.currentSinFreq = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSinFreq + " Hz"; 
            if (window.oscNode && window.audioCtx) window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime);
            if (window.oscNode2 && window.audioCtx) window.oscNode2.frequency.setValueAtTime(window.currentSinFreq * 0.4, window.audioCtx.currentTime);
        }
        if (sliderId === "f1Slider") { window.f1 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f1 + " Hz"; window.updateFilterCoefficients(); }
        if (sliderId === "f2Slider") { 
            window.f2 = parseInt(curVal); 
            if (nextSpan) {
                if (window.currentFilterMode === 'LP' || window.currentFilterMode === 'HP') {
                    let dQ = 0.1 + (window.f2 / 5000.0) * 9.9; nextSpan.innerText = "Q: " + dQ.toFixed(2);
} else { nextSpan.innerText = window.f2 + " Hz"; }}window.updateFilterCoefficients();}if (sliderId === "volumeSlider") { if (nextSpan) nextSpan.innerText = Math.round(curVal * 100) + "%"; if (window.gainNode && window.audioCtx) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime); }}});window.onload = function() {const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider');const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value);if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);if (window.globalRenderLoop) window.globalRenderLoop();};
