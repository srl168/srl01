//3
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
window.simPhase2 = 0;             
window.FFT_SIZE = 1024; 
window.analysisBuffer = new Float32Array(window.FFT_SIZE);
window.simWorker = null;

let renderFrameCounter = 0;
window.currentFilterMode = 'RAW';
window.f1 = 1000; window.f2 = 3000;
window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a0 = 1; window.a1 = 0; window.a2 = 0;
let xv = new Float32Array(3), yv = new Float32Array(3);

// ==========================================
// 💡 2️⃣ 100% 剛性歸位：工業級標準 Biquad 濾波係數公式（徹底修正 Q 值高頻壓不下去黑洞！）
// ==========================================
window.updateFilterCoefficients = function() {
    // 基於標準工科學定義，計算角頻率 w0 與阻尼因子 alpha
    let w0 = 2 * Math.PI * window.f1 / window.currentSampleRate;
    if (w0 < 0.01) w0 = 0.01; if (w0 > Math.PI - 0.01) w0 = Math.PI - 0.01;
    let cosW0 = Math.cos(w0); let sinW0 = Math.sin(w0);
    
    // 自適應讀取 F2 對應的 LP/HP 品質因數 Q
    let qValLP_HP = 0.1 + (window.f2 / 5000.0) * 9.9;
    if (qValLP_HP < 0.1) qValLP_HP = 0.1; if (qValLP_HP > 10.0) qValLP_HP = 10.0;
    
    if (window.currentFilterMode === 'RAW') {
        window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a0 = 1; window.a1 = 0; window.a2 = 0;
    }
    else if (window.currentFilterMode === 'LP') {
        // 💡 正宗 DSP 晶片低通公式：Q 值越高，高頻阻尼抗性越剛性，4kHz 註定被壓得越低！
        let alpha = sinW0 / (2 * qValLP_HP);
        window.b0 = (1 - cosW0) / 2; window.b1 = 1 - cosW0; window.b2 = (1 - cosW0) / 2;
        window.a0 = 1 + alpha; window.a1 = -2 * cosW0; window.a2 = 1 - alpha;
    }
    else if (window.currentFilterMode === 'HP') {
        let alpha = sinW0 / (2 * qValLP_HP);
        window.b0 = (1 + cosW0) / 2; window.b1 = -(1 + cosW0); window.b2 = (1 + cosW0) / 2;
        window.a0 = 1 + alpha; window.a1 = -2 * cosW0; window.a2 = 1 - alpha;
    }
    else if (window.currentFilterMode === 'BP') {
        let qValBP = window.f1 / (window.f2 > 0 ? window.f2 : 1.0); if (qValBP < 0.1) qValBP = 0.1;
        let alpha = sinW0 / (2 * qValBP);
        window.b0 = alpha; window.b1 = 0; window.b2 = -alpha;
        window.a0 = 1 + alpha; window.a1 = -2 * cosW0; window.a2 = 1 - alpha;
    }
};

// 💡 3️⃣ 100% 晶片級直通數位過濾執行水管（加入 a0 歸一化，杜絕係數爆炸）
window.applyFilter = function(x) {
    if (window.currentFilterMode === 'RAW') return x;
    xv[2] = xv[1]; xv[1] = xv[0]; xv[0] = x;
    yv[2] = yv[1]; yv[1] = yv[0];
    
    // 實施直通車標準 Biquad 差分方程，完美融合歸一化 a0 因子
    yv[0] = (window.b0 * xv[0] + window.b1 * xv[1] + window.b2 * xv[2] - window.a1 * yv[1] - window.a2 * yv[2]) / window.a0;
    
    if (isNaN(yv[0]) || !isFinite(yv[0])) { yv[0]=0; yv[1]=0; yv[2]=0; xv[0]=0; xv[1]=0; xv[2]=0; }
    return yv[0];
};

window.addEventListener('DOMContentLoaded', () => {
    window.tCanvas = document.getElementById('timeCanvas'); window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d'); window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400; window.fCanvas.width = 800; window.fCanvas.height = 400;
});
window.oscNode = null; window.oscNode2 = null; window.scriptNode = null;

window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode.disconnect(); window.oscNode = null; }
    if (window.oscNode2) { try { window.oscNode2.stop(); } catch(e){} window.oscNode2.disconnect(); window.oscNode2 = null; }
    if (window.scriptNode) window.scriptNode.disconnect();
    
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain();
        window.gainNode.connect(window.audioCtx.destination);
    }
    
    window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? 0.3 : 0.0, window.audioCtx.currentTime);

    window.oscNode = window.audioCtx.createOscillator(); window.oscNode.type = 'sine';
    window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime);

    window.oscNode2 = window.audioCtx.createOscillator(); window.oscNode2.type = 'sine';
    window.oscNode2.frequency.setValueAtTime(window.currentSinFreq * 0.4, window.audioCtx.currentTime);

    window.scriptNode = window.audioCtx.createScriptProcessor(1024, 1, 1);
    window.scriptNode.onaudioprocess = function(audioProcessingEvent) {
        let inputBuffer = audioProcessingEvent.inputBuffer; let outputBuffer = audioProcessingEvent.outputBuffer;
        let inputData = inputBuffer.getChannelData(0); let outputData = outputBuffer.getChannelData(0);

        for (let sample = 0; sample < inputBuffer.length; sample++) {
            let rawVal = inputData[sample];
            if (window.isSimulating) {
                let step1 = 2.0 * Math.PI * (window.currentSinFreq / 44100);
                let step2 = 2.0 * Math.PI * ((window.currentSinFreq * 0.4) / 44100);
                let v1 = Math.sin(window.simPhase); window.simPhase += step1; if (window.simPhase >= 2*Math.PI) window.simPhase -= 2*Math.PI;
                let v2 = Math.sin(window.simPhase2); window.simPhase2 += step2; if (window.simPhase2 >= 2*Math.PI) window.simPhase2 -= 2*Math.PI;
                rawVal = (v1 + v2) * 0.5; 
            }
            let fVal = window.applyFilter ? window.applyFilter(rawVal) : rawVal; 
            outputData[sample] = fVal; 
            if (window.isSimulating) {
                window.filteredDataLog.push(fVal);
                window.analysisBuffer[window.bufferIndex] = fVal; window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
            }
        }
        if (window.filteredDataLog.length > 4000) window.filteredDataLog = window.filteredDataLog.slice(-3000);
    };

    if (window.isSimulating) { window.oscNode.connect(window.scriptNode); window.oscNode2.connect(window.scriptNode); window.scriptNode.connect(window.gainNode); window.oscNode.start(); window.oscNode2.start(); }
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

    let minFreq = window.currentSinFreq * 0.4;
    let adaptivePointsCount = Math.round((3 * 44100) / (minFreq > 0 ? minFreq : 1000) * (44100 / window.currentSampleRate));
    if (adaptivePointsCount < 64) adaptivePointsCount = 64; if (adaptivePointsCount > window.filteredDataLog.length) adaptivePointsCount = window.filteredDataLog.length;

    let rawSlice = window.filteredDataLog.slice(-adaptivePointsCount);
    
    // 時域自動縮放防線，高 Q 值下 100% 自適應收攏
    let currentFrameMaxPeak = Math.max(...rawSlice.map(Math.abs)); if (currentFrameMaxPeak < 0.1) currentFrameMaxPeak = 0.1;
    let scaleY = 145 / currentFrameMaxPeak; 

    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), vpp = max - min, sq = 0;
    rawSlice.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rawSlice.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let re = new Float32Array(window.FFT_SIZE), im = new Float32Array(window.FFT_SIZE);
    for (let k = 0; k < window.FFT_SIZE; k++) { let idx = (window.bufferIndex + k) % window.FFT_SIZE; re[k] = window.analysisBuffer[idx]; }
    localFFT(re, im);
    
    let magnitudes = new Float32Array(window.FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); if (m > 1 && magnitudes[m] > maxMag) { maxMag = magnitudes[m]; maxIdx = m; } }
    
    let realHWFreq = maxIdx * (44100 / window.FFT_SIZE); 
    document.getElementById('freqVal').innerText = maxMag > 0.04 ? realHWFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
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

    // ==========================================
    // 💡 頻域畫布渲染：對數分貝標尺（0 ~ -60dB 剛性視窗）
    // ==========================================
    window.fCtx.clearRect(0, 0, 800, 400); window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400);
    
    window.fCtx.strokeStyle = '#333333'; window.fCtx.lineWidth = 1; window.fCtx.beginPath();
    for (let k = 0; k <= 4; k++) { let xPos = 200 * k; if (k === 4) xPos = 799; window.fCtx.moveTo(xPos, 0); window.fCtx.lineTo(xPos, 360); }
    window.fCtx.stroke();

    window.fCtx.fillStyle = '#ffffff'; window.fCtx.font = 'bold 12px Arial';
    let ticks = ["0.00 kHz", "1.25 kHz", "2.50 kHz", "3.75 kHz", "5.00 kHz"];
    for (let k = 0; k <= 4; k++) { let textOffset = k === 0 ? 15 : (k === 4 ? -75 : -25); window.fCtx.fillText(ticks[k], (200 * k) + textOffset, 385); }

    // 繪製水平分貝線標尺
    window.fCtx.strokeStyle = '#222222'; window.fCtx.beginPath();
    let dbSteps = [0, -12, -30, -50];
    dbSteps.forEach(db => { let yPos = 30 + ((db / -60) * 310); window.fCtx.moveTo(0, yPos); window.fCtx.lineTo(800, yPos); });
    window.fCtx.stroke();
    
    window.fCtx.fillStyle = '#aaaaaa'; window.fCtx.font = 'bold 11px Arial';
    dbSteps.forEach(db => { let yPos = 30 + ((db / -60) * 310); window.fCtx.fillText(db + " dB", 20, yPos + 4); });

    // 絕對一對一物理頻率 X 軸映射（4kHz 永遠死鎖歸位！）
    let hzPerBinHW = (44100 / window.FFT_SIZE);
    window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 2.0; window.fCtx.beginPath();
    
    let isFirstPoint = true;
    for (let n = 0; n < magnitudes.length; n++) { 
        let currentPointRealHz = n * hzPerBinHW;
        if (currentPointRealHz > 5000) break; 
        
        let curX = (currentPointRealHz / 5000) * 800;
        
        // 💡 標準分貝校準（線性幅值 ➔ Log10 dB 映射）
        let linearVal = magnitudes[n] * 6.5; if (linearVal < 0.001) linearVal = 0.001; 
        let dB = 20 * Math.log10(linearVal);
        
        if (dB > 5) dB = 5; if (dB < -60) dB = -60;
        let y = 30 + ((dB / -60) * 310); // 幾何翻轉：0dB 在最頂層，-60dB 沉底
        
        if (isFirstPoint) { window.fCtx.moveTo(curX, y); isFirstPoint = false; } 
        else { window.fCtx.lineTo(curX, y); }
    }
    window.fCtx.stroke();
};

document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return;
    const clickId = e.target.id;
    if (clickId === 'simBtn') {
        window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn'); window.initAudioGlobal();
        if (btn) btn.innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試";
        document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：正宗工業 Biquad 濾波網絡啟動！" : "狀態：模擬測試已停止。";
    }
    if (clickId === 'speakerBtn') {
        window.isSpeakerOn = !window.isSpeakerOn; const sBtn = document.getElementById('speakerBtn');
        if (sBtn) sBtn.innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉";
        window.initAudioGlobal();
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
                } else { nextSpan.innerText = window.f2 + " Hz"; }
            }
            window.updateFilterCoefficients(); 
        }
        if (sliderId === "volumeSlider") { if (nextSpan) nextSpan.innerText = Math.round(curVal * 100) + "%"; if (window.gainNode && window.audioCtx) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime); }
    }
});

window.onload = function() {
    const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider');
const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value);if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);if (window.updateFilterCoefficients) window.updateFilterCoefficients(); if (window.globalRenderLoop) window.globalRenderLoop();};