//108
if (window.audioInterval) clearInterval(window.audioInterval);
window.isWritingLock = false;

// ==========================================
// 💡 1️⃣ 全域記憶體大腦池初始化
// ==========================================
window.currentSampleRate = 20000;
window.currentSinFreq = 3000; 
window.filteredDataLog = [];
window.bufferIndex = 0;
window.isSpeakerOn = false;
window.isSimulating = false; // 💡 控制模擬狀態開關
window.currentVolume = 0.3;  // 剛性初始化全域音量暫存器 (30%)
window.FFT_SIZE = 1024;       // 1024 點標準工業級示波器黃金骨架
window.analysisBuffer = new Float32Array(window.FFT_SIZE);
window.renderFrameCounter = 0; 

window.currentFilterMode = 'RAW';
window.f1 = 1000; window.f2 = 3000;
window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0;
let xv = new Float32Array(3), yv = new Float32Array(3);

// ==========================================
// 💡 2️⃣ 數位濾波器精密係數計算公式
// ==========================================
window.updateFilterCoefficients = function() {
    let fr = window.currentSampleRate / window.f1; if (fr < 2.01) fr = 2.01;
    let o = Math.tan(Math.PI / fr);
    
    let qValLP_HP = 0.1 + (window.f2 / 5000.0) * 9.9; 
    if (qValLP_HP < 0.1) qValLP_HP = 0.1; if (qValLP_HP > 10.0) qValLP_HP = 10.0;

    if (window.currentFilterMode === 'LP') { 
        let c = 1 + (o / qValLP_HP) + o * o;
        window.b0 = (o * o) / c; window.b1 = 2 * window.b0; window.b2 = window.b0; 
        window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - (o / qValLP_HP) + o * o) / c; 
    } 
    else if (window.currentFilterMode === 'HP') { 
        let c = 1 + (o / qValLP_HP) + o * o;
        window.b0 = 1.0 / c; window.b1 = -2.0 * window.b0; window.b2 = window.b0; 
        window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - (o / qValLP_HP) + o * o) / c; 
    } 
    else if (window.currentFilterMode === 'BP') { 
        let qValBP = window.f1 / (window.f2 > 0 ? window.f2 : 1.0); if (qValBP < 0.1) qValBP = 0.1;
        let cBP = 1.0 + (o / qValBP) + o * o;
        window.b0 = (o / qValBP) / cBP; window.b1 = 0.0; window.b2 = -window.b0;
        window.a1 = 2.0 * (o * o - 1.0) / cBP; window.a2 = (1.0 - (o / qValBP) + o * o) / cBP;
    }
};

window.applyFilter = function(x) { 
    if (window.currentFilterMode === 'RAW') return x;
    xv = xv; xv = xv; xv = x; yv = yv; yv = yv;
    yv = (window.b0 * xv) + (window.b1 * xv) + (window.b2 * xv) - (window.a1 * yv) - (window.a2 * yv);
    if (isNaN(yv) || !isFinite(yv)) { yv=0; yv=0; yv=0; xv=0; xv=0; xv=0; }
    return yv;
};

window.addEventListener('DOMContentLoaded', () => {
    window.tCanvas = document.getElementById('timeCanvas'); window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d'); window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400; window.fCanvas.width = 800; window.fCanvas.height = 400;
});
window.audioCtx = null; window.gainNode = null;

// ==========================================
// 💡 3️⃣ 聲學大革命：100% 物理煙滅 ScriptProcessorNode 棄用警告！
// ==========================================
window.initAudioGlobal = function() {
    if (window.audioInterval) clearInterval(window.audioInterval);
    
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain();
        window.gainNode.connect(window.audioCtx.destination);
    }
    
    // 鎖定實時調音台增益
    let realTargetVolume = window.isSpeakerOn ? window.currentVolume : 0.0;
    window.gainNode.gain.setValueAtTime(realTargetVolume, window.audioCtx.currentTime);
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();

    if (window.isSimulating) {
        window.updateFilterCoefficients();
        window.simPhase = 0; window.simPhase2 = 0; // 開啟時重置相位起點
        
        // 💡 採用現代高效能、0 棄用警告的原生 setInterval 時鐘泵
        window.audioInterval = setInterval(() => {
            let bufferChunk = new Float32Array(128);
            
            for (let i = 0; i < 128; i++) {
                let step1 = 2.0 * Math.PI * (window.currentSinFreq / 44100);
                let step2 = 2.0 * Math.PI * ((window.currentSinFreq * 0.4) / 44100);
                
                let v1 = Math.sin(window.simPhase); window.simPhase += step1; if (window.simPhase >= 2*Math.PI) window.simPhase -= 2*Math.PI;
                let v2 = Math.sin(window.simPhase2); window.simPhase2 += step2; if (window.simPhase2 >= 2*Math.PI) window.simPhase2 -= 2*Math.PI;
                
                let rawVal = (v1 + v2) * 0.5;
                let fVal = window.applyFilter ? window.applyFilter(rawVal) : rawVal;
                
                bufferChunk[i] = fVal;
                
                window.filteredDataLog.push(fVal);
                window.analysisBuffer[window.bufferIndex] = fVal;
                window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
            }
            
            // 當揚聲按鈕啟動時才向音效卡投遞音訊，發聲流暢飽滿
            if (window.isSpeakerOn && window.audioCtx) {
                let audioBuffer = window.audioCtx.createBuffer(1, 128, 44100);
                audioBuffer.getChannelData(0).set(bufferChunk);
                let bufferSource = window.audioCtx.createBufferSource();
                bufferSource.buffer = audioBuffer;
                bufferSource.connect(window.gainNode);
                bufferSource.start();
            }
            
            if (window.filteredDataLog.length > 4000) window.filteredDataLog = window.filteredDataLog.slice(-3000);
        }, 16);
    } else {
        // 💡 剛性重置：當按下「停止模擬測試」時，瞬間物理抽乾所有快取，不留一絲殘留電壓！
        window.filteredDataLog = [];
        window.analysisBuffer.fill(0);
        window.bufferIndex = 0;
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
    requestAnimationFrame(window.globalRenderLoop); window.renderFrameCounter++; if (window.renderFrameCounter % 2 !== 0) return;

    // 💡 🛠️ 核心斷路器防線：如果未開啟模擬測試，所有畫布自動刷黑並死死「定格靜止」，FFT 絕對不會一直空轉亂動！
    if (!window.isSimulating && window.filteredDataLog.length === 0) {
        // 刷黑時域
        window.tCtx.clearRect(0, 0, 800, 400); window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, 800, 400);
        window.tCtx.strokeStyle = '#333333'; window.tCtx.lineWidth = 1; window.tCtx.beginPath();
        [20, 110, 200, 290, 380].forEach(y => { window.tCtx.moveTo(0, y); window.tCtx.lineTo(800, y); }); window.tCtx.stroke();
        window.tCtx.fillStyle = '#ffffff'; window.tCtx.font = 'bold 12px Arial'; window.tCtx.fillText("+1.0V", 25, 24); window.tCtx.fillText("0.0V", 25, 204); window.tCtx.fillText("-1.0V", 25, 384);
        
        // 刷黑頻域與保留自適應刻度外框
        window.fCtx.clearRect(0, 0, 800, 400); window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400);
        window.fCtx.strokeStyle = '#333333'; window.fCtx.lineWidth = 1; window.fCtx.beginPath();
        for (let k = 0; k <= 4; k++) { let xPos = 200 * k; if (k === 4) xPos = 799; window.fCtx.moveTo(xPos, 0); window.fCtx.lineTo(xPos, 360); } window.fCtx.stroke();
        window.fCtx.fillStyle = '#ffffff'; window.fCtx.font = 'bold 12px Arial'; let ticks = ["0.00 kHz", "1.25 kHz", "2.50 kHz", "3.75 kHz", "5.00 kHz"]; for (let k = 0; k <= 4; k++) { let textOffset = k === 0 ? 15 : (k === 4 ? -75 : -25); window.fCtx.fillText(ticks[k], (200 * k) + textOffset, 385); }
        window.fCtx.strokeStyle = '#222222'; window.fCtx.beginPath(); [30, 92, 216, 340].forEach(yPos => { window.fCtx.moveTo(0, yPos); window.fCtx.lineTo(800, yPos); }); window.fCtx.stroke();
        window.fCtx.fillStyle = '#aaaaaa'; window.fCtx.font = 'bold 11px Arial'; window.fCtx.fillText("0 dB", 20, 34); window.fCtx.fillText("-30 dB", 20, 220);
        
        document.getElementById('vppVal').innerText = "0.00 V"; document.getElementById('rmsVal').innerText = "0.00 V"; document.getElementById('freqVal').innerText = "0.0 Hz";
        return; 
    }

    if (window.filteredDataLog.length < 50) return;

    let minFreq = window.currentSinFreq * 0.4;
    let adaptivePointsCount = Math.round((3 * 44100) / (minFreq > 0 ? minFreq : 1000) * (44100 / window.currentSampleRate));
    if (adaptivePointsCount < 64) adaptivePointsCount = 64; if (adaptivePointsCount > window.filteredDataLog.length) adaptivePointsCount = window.filteredDataLog.length;

    let rawSlice = window.filteredDataLog.slice(-adaptivePointsCount);
    
    // 時域最大絕對值即時自適應防溢位
    let absMaxPeak = Math.max(...rawSlice.map(Math.abs)); if (absMaxPeak < 0.1) absMaxPeak = 0.1;
    let scaleY = 145 / absMaxPeak; if (scaleY > 165) scaleY = 165;

    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), vpp = max - min, sq = 0;
    rawSlice.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rawSlice.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let re = new Float32Array(window.FFT_SIZE), im = new Float32Array(window.FFT_SIZE);
    for (let k = 0; k < window.FFT_SIZE; k++) { let idx = (window.bufferIndex + k) % window.FFT_SIZE; re[k] = window.analysisBuffer[idx]; }
    localFFT(re, im);
    
    let magnitudes = new Float32Array(window.FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); if (m > 1 && magnitudes[m] > maxMag) { maxMag = magnitudes[m]; maxIdx = m; } }
    
    // 💡 智能雙音讀數對齊補丁：誰此時真實能量比較大，讀數就 100% 直讀誰的赫茲！
    let binFs = Math.round(window.currentSinFreq / (44100 / window.FFT_SIZE));
    let bin04Fs = Math.round((window.currentSinFreq * 0.4) / (44100 / window.FFT_SIZE));
    let magFs = magnitudes[binFs] || 0; let mag04Fs = magnitudes[bin04Fs] || 0;
    let finalMeasuredHz = (mag04Fs > magFs) ? (window.currentSinFreq * 0.4) : window.currentSinFreq;
    document.getElementById('freqVal').innerText = maxMag > 0.04 ? finalMeasuredHz.toFixed(1) + " Hz" : "0.0 Hz";
    
    // 渲染時域
    window.tCtx.clearRect(0, 0, 800, 400); window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, 800, 400);
    let midY = 200; window.tCtx.strokeStyle = '#333333'; window.tCtx.lineWidth = 1; window.tCtx.beginPath();
    let voltSteps = [1.0, 0.5, 0.0, -0.5, -1.0]; voltSteps.forEach(v => { let yPos = midY - v * scaleY; window.tCtx.moveTo(0, yPos); window.tCtx.lineTo(800, yPos); }); window.tCtx.stroke();
    window.tCtx.fillStyle = '#ffffff'; window.tCtx.font = 'bold 12px Arial'; voltSteps.forEach(v => { let yPos = midY - v * scaleY; window.tCtx.fillText((v >= 0 ? "+" : "") + v.toFixed(1) + "V", 25, yPos + 4); });

    window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath();
    let tSlice = 800 / (rawSlice.length - 1); window.tCtx.moveTo(0, midY - (rawSlice * scaleY));
    for (let j = 1; j < rawSlice.length; j++) { window.tCtx.lineTo(j * tSlice, midY - (rawSlice[j] * scaleY)); }
    window.tCtx.stroke();
    let totalTimeMs = (rawSlice.length / window.currentSampleRate) * 1000; window.tCtx.fillStyle = '#00ff66'; window.tCtx.fillText("全幅時間: " + totalTimeMs.toFixed(2) + " ms", 620, 380);

    // 💡 「自適應性」橫向寬度觀測視窗（X軸隨 F1 拉伸）
    window.fCtx.clearRect(0, 0, 800, 400); window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400);
    let maxDisplayFreq = window.f1 * 2.2; if (maxDisplayFreq < 1200) maxDisplayFreq = 1200; if (maxDisplayFreq > 5000) maxDisplayFreq = 5000;

    window.fCtx.strokeStyle = '#333333'; window.fCtx.lineWidth = 1; window.fCtx.beginPath();
    for (let k = 0; k <= 4; k++) { let xPos = 200 * k; if (k === 4) xPos = 799; window.fCtx.moveTo(xPos, 0); window.fCtx.lineTo(xPos, 360); } window.fCtx.stroke();
    window.fCtx.fillStyle = '#ffffff'; window.fCtx.font = 'bold 12px Arial';
    for (let k = 0; k <= 4; k++) { let textOffset = k === 0 ? 15 : (k === 4 ? -75 : -25); let currentTickFreq = (maxDisplayFreq / 4) * k; window.fCtx.fillText((currentTickFreq / 1000).toFixed(2) + " kHz", (200 * k) + textOffset, 385); }

    // 💡 分貝（dB）水平標尺網格刻度
    window.fCtx.strokeStyle = '#222222'; window.fCtx.beginPath();
    let dbSteps = [0, -12, -30, -50]; dbSteps.forEach(db => { let yPos = 30 + ((db / -50) * 310); window.fCtx.moveTo(0, yPos); window.fCtx.lineTo(800, yPos); }); window.fCtx.stroke();
    window.fCtx.fillStyle = '#aaaaaa'; window.fCtx.font = 'bold 11px Arial'; dbSteps.forEach(db => { let yPos = 30 + ((db / -50) * 310); window.fCtx.fillText(db + " dB", 20, yPos + 4); });

    // 幾何歸一化繪圖（主峰精準頂格在 0 dB 線上！）
    let hzPerBinHW = (44100 / window.FFT_SIZE); window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 2.0; window.fCtx.beginPath();
    let isFirstPoint = true;
    for (let n = 0; n < magnitudes.length; n++) { 
        let currentPointRealHz = n * hzPerBinHW; if (currentPointRealHz > maxDisplayFreq) break; 
        let curX = (currentPointRealHz / maxDisplayFreq) * 800;
        let y = 30 + ((1.0 - (magnitudes[n] * 6.5 * 0.16)) * 310); if (y < 10) y = 10; if (y > 358) y = 358;
        if (isFirstPoint) { window.fCtx.moveTo(curX, y); isFirstPoint = false; } else { window.fCtx.lineTo(curX, y); }
    }
    window.fCtx.stroke();
};

document.getElementById('simBtn')?.addEventListener('click', () => {
    window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn'); window.initAudioGlobal();
    if (btn) btn.innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試";
    document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：全新高效能 0 警告聲學核心上線！" : "狀態：模擬測試已停止，大腦記憶體完全定格。";
});

document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return;
    const clickId = e.target.id;
    if (clickId === 'speakerBtn') {
        window.isSpeakerOn = !window.isSpeakerOn; const sBtn = document.getElementById('speakerBtn');
        if (sBtn) { sBtn.innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉"; sBtn.className = window.isSpeakerOn ? "btn-speaker" : "btn-speaker muted"; }
        if (window.gainNode && window.audioCtx) { let realVol = window.isSpeakerOn ? window.currentVolume : 0.0; window.gainNode.gain.setValueAtTime(realVol, window.audioCtx.currentTime); }
    }
    const fModes = { filterRaw: 'RAW', filterLP: 'LP', filterHP: 'HP', filterBP: 'BP' };
    if (fModes[clickId]) {
        Object.keys(fModes).forEach(k => { const tBtn = document.getElementById(k); if (tBtn) tBtn.classList.remove('active'); });
        e.target.classList.add('active'); window.currentFilterMode = fModes[clickId];
const f2View = document.getElementById('f2Container'); if (f2View) f2View.style.display = 'flex';const f2SliderEl = document.getElementById('f2Slider'); if (f2SliderEl && f2SliderEl.nextElementSibling) { let dQ = 0.1 + (window.f2 / 5000.0) * 9.9; f2SliderEl.nextElementSibling.innerText = "Q: " + dQ.toFixed(2); }window.updateFilterCoefficients();}});document.addEventListener('input', (e) => {if (e.target && e.target.type === 'range') {let sliderId = e.target.id; let curVal = parseFloat(e.target.value); let nextSpan = e.target.nextElementSibling;if (sliderId === "sampleRateSlider") { window.currentSampleRate = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSampleRate + " Hz"; window.updateFilterCoefficients(); }if (sliderId === "sinFreqSlider") { window.currentSinFreq = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSinFreq + " Hz"; }if (sliderId === "f1Slider") { window.f1 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f1 + " Hz"; window.updateFilterCoefficients(); }if (sliderId === "f2Slider") { window.f2 = parseInt(curVal); if (nextSpan) { let dQ = 0.1 + (window.f2 / 5000.0) * 9.9; nextSpan.innerText = "Q: " + dQ.toFixed(2); } window.updateFilterCoefficients(); }if (sliderId === "volumeSlider") { window.currentVolume = curVal; if (nextSpan) nextSpan.innerText = Math.round(curVal * 100) + "%"; if (window.gainNode && window.audioCtx && window.isSpeakerOn) { window.gainNode.gain.setValueAtTime(window.currentVolume, window.audioCtx.currentTime); } }}});window.onload = function() {const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider'); const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value); if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);if (window.updateFilterCoefficients) window.updateFilterCoefficients(); if (window.globalRenderLoop) window.globalRenderLoop();};
