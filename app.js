//103
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
    requestAnimationFrame(window.globalRenderLoop); window.renderFrameCounter++; if (window.renderFrameCounter % 2 !== 0) return;
    if (window.filteredDataLog.length < 50) return;

    let minFreq = window.currentSinFreq * 0.4;
    let adaptivePointsCount = Math.round((3 * 44100) / (minFreq > 0 ? minFreq : 1000) * (44100 / window.currentSampleRate));
    if (adaptivePointsCount < 64) adaptivePointsCount = 64; if (adaptivePointsCount > window.filteredDataLog.length) adaptivePointsCount = window.filteredDataLog.length;

    let rawSlice = window.filteredDataLog.slice(-adaptivePointsCount);
    
    // 時域最大絕對值自適應盲抓防溢位
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
    // 💡 1️⃣ 功能一：加入「自適應性」寬度觀測視野（X 軸幾何動態拉伸放大成窄波峰！）
    // ==========================================
    window.fCtx.clearRect(0, 0, 800, 400); window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400);
    
    let maxDisplayFreq = window.f1 * 2.2; 
    if (maxDisplayFreq < 1200) maxDisplayFreq = 1200; 
    if (maxDisplayFreq > 5000) maxDisplayFreq = 5000; // 安全極限不超過 5kHz 上限

    // 繪製垂直自適應 5 等分網格線
    window.fCtx.strokeStyle = '#333333'; window.fCtx.lineWidth = 1; window.fCtx.beginPath();
    for (let k = 0; k <= 4; k++) { let xPos = 200 * k; if (k === 4) xPos = 799; window.fCtx.moveTo(xPos, 0); window.fCtx.lineTo(xPos, 360); }
    window.fCtx.stroke();

    // 底部 kHz 純白標籤隨視野伸縮動態更新
    window.fCtx.fillStyle = '#ffffff'; window.fCtx.font = 'bold 12px Arial';
    for (let k = 0; k <= 4; k++) {
        let textOffset = k === 0 ? 15 : (k === 4 ? -75 : -25);
        let currentTickFreq = (maxDisplayFreq / 4) * k;
        window.fCtx.fillText((currentTickFreq / 1000).toFixed(2) + " kHz", (200 * k) + textOffset, 385);
    }

    // ==========================================
    // 💡 2️⃣ 功能二：在左側加入 4 等分「對數分貝（dB）水平格線標尺網格」
    // ==========================================
    window.fCtx.strokeStyle = '#222222'; window.fCtx.beginPath();
    let dbSteps = [0, -12, -30, -50];
    dbSteps.forEach(db => {
        let yPos = 30 + ((db / -60) * 310); // 將 0 到 -60dB 均勻等分刻在 Y 軸畫布
        window.fCtx.moveTo(0, yPos); window.fCtx.lineTo(800, yPos);
    });
    window.fCtx.stroke();
    
    window.fCtx.fillStyle = '#aaaaaa'; window.fCtx.font = 'bold 11px Arial';
    dbSteps.forEach(db => { let yPos = 30 + ((db / -60) * 310); window.fCtx.fillText(db + " dB", 20, yPos + 4); });

    // 3️⃣ 1:1 絕對頻率橫軸直通映射與原汁原味線性幅值波形繪製
    let hzPerBinHW = (44100 / window.FFT_SIZE);
    window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 2.0; window.fCtx.beginPath();
    
    let isFirstPoint = true;
    for (let n = 0; n < magnitudes.length; n++) { 
        let currentPointRealHz = n * hzPerBinHW;
        if (currentPointRealHz > maxDisplayFreq) break; // 超過自適應視野上限則截斷
        
        // 幾何橫向等幅拉伸對齊
        let curX = (currentPointRealHz / maxDisplayFreq) * 800;
        
        // 💡 保持原汁原味穩定的線性幾何乘積（絕不改動這行！不破壞按鈕原始行為！）
        let y = 360 - (magnitudes[n] * 350 * 5); 
        if (y < 10) y = 10; if (y > 358) y = 358;
        
        if (isFirstPoint) { window.fCtx.moveTo(curX, y); isFirstPoint = false; } 
        else { window.fCtx.lineTo(curX, y); }
    }
    window.fCtx.stroke();
};

document.getElementById('simBtn')?.addEventListener('click', () => {
    window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn'); window.initAudioGlobal();
    if (btn) btn.innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試";
    document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：自適應窄波峰 ＋ 分貝網格標尺完美追加！" : "狀態：模擬測試已停止。";
});

document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return;
    const clickId = e.target.id;
    
    // 💡 聲音鈕啟動功能完美加入：點擊時改變全域狀態並靈敏重開
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
            let dQ = 0.1 + (window.f2 / 5000.0) * 9.9; f2SliderEl.nextElementSibling.innerText = "Q: " + dQ.toFixed(2);
        }
        window.updateFilterCoefficients();
    }
});

document.addEventListener('input', (e) => {
    if (e.target && e.target.type === 'range') {
        let sliderId = e.target.id; let curVal = parseFloat(e.target.value); let nextSpan = e.target.nextElementSibling;
        if (sliderId === "sampleRateSlider") { window.currentSampleRate = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSampleRate + " Hz"; window.updateFilterCoefficients(); }
        if (sliderId === "sinFreqSlider") { window.currentSinFreq = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSinFreq + " Hz"; }
        if (sliderId === "f1Slider") { window.f1 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f1 + " Hz"; window.updateFilterCoefficients(); }
        if (sliderId === "f2Slider") { 
            window.f2 = parseInt(curVal); 
            if (nextSpan) {
                let dQ = 0.1 + (window.f2 / 5000.0) * 9.9; nextSpan.innerText = "Q: " + dQ.toFixed(2);
            }
            window.updateFilterCoefficients(); 
        }
    }
});

window.onload = function() {
    const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider');
    const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');
    if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value);
if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);if (window.updateFilterCoefficients) window.updateFilterCoefficients(); if (window.globalRenderLoop) window.globalRenderLoop();};