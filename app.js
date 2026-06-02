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

    if (!window.hardwareFilter || !window.audioCtx) return;
    try {
        let t = window.audioCtx.currentTime + 0.005;
        if (window.currentFilterMode === 'RAW') { window.hardwareFilter.type = 'allpass'; }
        else if (window.currentFilterMode === 'LP') { window.hardwareFilter.type = 'lowpass'; window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); window.hardwareFilter.Q.linearRampToValueAtTime(qValLP_HP, t); }
        else if (window.currentFilterMode === 'HP') { window.hardwareFilter.type = 'highpass'; window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); window.hardwareFilter.Q.linearRampToValueAtTime(qValLP_HP, t); }
        else if (window.currentFilterMode === 'BP') { window.hardwareFilter.type = 'bandpass'; window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); let qValBP = window.f1 / (window.f2 > 0 ? window.f2 : 1.0); if (qValBP < 0.1) qValBP = 0.1; window.hardwareFilter.Q.linearRampToValueAtTime(qValBP, t); }
    } catch (e) {}
};

window.applyFilter = function(x) { return x; };

window.addEventListener('DOMContentLoaded', () => {
    window.S_UUID = 0xFF01; window.C_UUID = 0xFF02;
    window.tCanvas = document.getElementById('timeCanvas'); window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d'); window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400; window.fCanvas.width = 800; window.fCanvas.height = 400;
});
window.oscNode = null; window.oscNode2 = null; window.scriptNode = null;

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
    
    // ==========================================
    // 💡 時域畫布渲染（時域振幅自適應盲抓「防爆艙」）
    // ==========================================
    let absMaxInSlice = Math.max(...rawSlice.map(Math.abs));
    if (absMaxInSlice < 0.2) absMaxInSlice = 0.2;
    // 💡 剛性自適應：根據實體最大峰值動態縮減比例，高 Q 值下複合浪頭 100% 收攏不超出邊界！
    let scaleY = 140 / absMaxInSlice; if (scaleY > 160) scaleY = 160;

    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), vpp = max - min, sq = 0;
    rawSlice.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rawSlice.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let maxMag = -Infinity, maxIdx = 0;
    for (let i = 0; i < freqData.length; i++) { if (freqData[i] > maxMag) { maxMag = freqData[i]; maxIdx = i; } }
    let peakFreq = maxIdx * ((window.audioCtx ? window.audioCtx.sampleRate : 44100) / window.FFT_SIZE);
    document.getElementById('freqVal').innerText = maxMag > -100 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
    window.tCtx.clearRect(0, 0, 800, 400);
    window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, 800, 400);
    let midY = 200;

    window.tCtx.strokeStyle = '#333333'; window.tCtx.lineWidth = 1; window.tCtx.beginPath();
    let voltSteps = [1.0, 0.5, 0.0, -0.5, -1.0];
    voltSteps.forEach(v => { let yPos = midY - v * scaleY; window.tCtx.moveTo(0, yPos); window.tCtx.lineTo(800, yPos); });
    window.tCtx.stroke();

    window.tCtx.fillStyle = '#ffffff'; window.tCtx.font = 'bold 12px Arial';
    voltSteps.forEach(v => { let yPos = midY - v * scaleY; window.tCtx.fillText((v >= 0 ? "+" : "") + v.toFixed(1) + "V", 20, yPos + 4); });

    window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath();
    let tSlice = 800 / (rawSlice.length - 1);
    window.tCtx.moveTo(0, midY - ((rawSlice || 0) * scaleY));
    for (let j = 0; j < rawSlice.length - 1; j++) {
        let x1 = j * tSlice; let y1 = midY - ((rawSlice[j] || 0) * scaleY);
        let x2 = (j + 1) * tSlice; let y2 = midY - ((rawSlice[j + 1] || 0) * scaleY);
        window.tCtx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2); 
    }
    window.tCtx.stroke();
    
    let totalTimeMs = (rawSlice.length / window.currentSampleRate) * 1000;
    window.tCtx.fillStyle = '#00ff66'; window.tCtx.fillText("全幅時間: " + totalTimeMs.toFixed(2) + " ms", 620, 380);

    // ==========================================
    // 💡 頻域畫布渲染（解耦 5000Hz 上限 ➔ 視窗全動態拉伸放大成窄波峰！）
    // ==========================================
    window.fCtx.clearRect(0, 0, 800, 400);
    window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400);
    
    // 💡 視窗大革命：動態計算全幅畫布最右端的極限頻率。如果截止點很低，自動收縮視野，將細節橫向拉伸放大！
    let maxDisplayFreq = window.f1 * 2.2; 
    if (maxDisplayFreq < 1200) maxDisplayFreq = 1200; 
    if (maxDisplayFreq > 5000) maxDisplayFreq = 5000; // 最寬不超過 5kHz

    // 繪製垂直自適應 5 等分網格
    window.fCtx.strokeStyle = '#333333'; window.fCtx.lineWidth = 1; window.fCtx.beginPath();
    for (let k = 0; k <= 4; k++) { let xPos = 200 * k; if (k === 4) xPos = 799; window.fCtx.moveTo(xPos, 0); window.fCtx.lineTo(xPos, 360); }
    window.fCtx.stroke();

    // 底部動態白高鮮明尺刻度，隨視窗壓縮流暢變更！
    window.fCtx.fillStyle = '#ffffff'; window.fCtx.font = 'bold 12px Arial';
    for (let k = 0; k <= 4; k++) {
        let textOffset = k === 0 ? 15 : (k === 4 ? -75 : -25);
        let currentTickFreq = (maxDisplayFreq / 4) * k;
        window.fCtx.fillText((currentTickFreq / 1000).toFixed(2) + " kHz", (200 * k) + textOffset, 385);
    }

    // 繪製水平分貝橫標尺
    window.fCtx.strokeStyle = '#2d2d2d'; window.fCtx.lineWidth = 1; window.fCtx.beginPath();
    let dbLabels = [
        { db: -10, y: 360 - ((-10 + 140) * (350 / 140)) },
        { db: -40, y: 360 - ((-40 + 140) * (350 / 140)) },
        { db: -80, y: 360 - ((-80 + 140) * (350 / 140)) },
        { db: -120, y: 360 - ((-120 + 140) * (350 / 140)) }
    ];
    dbLabels.forEach(item => { window.fCtx.moveTo(0, item.y); window.fCtx.lineTo(800, item.y); });
    window.fCtx.stroke();
    
    window.fCtx.fillStyle = '#aaaaaa'; window.fCtx.font = 'bold 11px Arial';
    dbLabels.forEach(item => { window.fCtx.fillText(item.db + " dB", 20, item.y + 4); });

    // 💡 窄針狀演算法映射：精確尋找當前動態上限在 FFT 陣列裡的下標，進行鋪滿均勻投影！
    let hzPerBin = ((window.audioCtx ? window.audioCtx.sampleRate : 44100) / window.FFT_SIZE);
    let maxBinIndex = Math.round(maxDisplayFreq / hzPerBin); if (maxBinIndex > freqData.length) maxBinIndex = freqData.length;

    window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 2.0; window.fCtx.beginPath();
    let fSliceAdaptive = 800 / (maxBinIndex - 1);
    for (let n = 0; n < maxBinIndex; n++) { 
        let curX = n * fSliceAdaptive;
        let y = 360 - ((freqData[n] + 140) * (350 / 140)); 
        if (y < 10) y = 10; if (y > 358) y = 358;
        if (n == 0) window.fCtx.moveTo(curX, y); else window.fCtx.lineTo(curX, y); 
    }
    window.fCtx.stroke();
};

document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return;
    const clickId = e.target.id;
    if (clickId === 'simBtn') {
        window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn'); window.initAudioGlobal();
        if (btn) { btn.innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試"; btn.className = window.isSimulating ? "btn-sim active" : "btn-sim"; }
        document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：動態全視窗窄波峰放大點火成功！" : "狀態：模擬測試已停止。";
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
if (sliderId === "volumeSlider") { if (nextSpan) nextSpan.innerText = Math.round(curVal * 100) + "%"; if (window.gainNode && window.audioCtx) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime); }}});window.onload = function() {const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider');const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value);if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);if (window.globalRenderLoop) window.globalRenderLoop();};
