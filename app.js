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
// 💡 2️⃣ 100% 硬件晶片死鎖控制器（剛性更新硬體 BiquadFilter 暫存器，徹底消滅高頻反彈！）
// ==========================================
window.updateFilterCoefficients = function() {
    if (!window.hardwareFilter || !window.audioCtx) return;
    try {
        let t = window.audioCtx.currentTime + 0.002; // 2ms 晶片極速刷新時鐘
        
        // 💡 自適應換算實體拉桿 F2 的品質因數 Q（範圍：0.1 ~ 18.0）
        let dynamicQ = 0.1 + (window.f2 / 5000.0) * 17.9;
        if (dynamicQ < 0.1) dynamicQ = 0.1; if (dynamicQ > 18.0) dynamicQ = 18.0;

        if (window.currentFilterMode === 'RAW') { 
            window.hardwareFilter.type = 'allpass'; 
        }
        else if (window.currentFilterMode === 'LP') { 
            // 💡 剛性死鎖晶片：將低通模式與動態阻尼 Q 值 100% 通電對齊給實體音效卡！
            window.hardwareFilter.type = 'lowpass'; 
            window.hardwareFilter.frequency.setValueAtTime(window.f1, t); 
            window.hardwareFilter.Q.setValueAtTime(dynamicQ, t); // Q 越高，高頻深水區被晶片砍得越深！
        }
        else if (window.currentFilterMode === 'HP') { 
            window.hardwareFilter.type = 'highpass'; 
            window.hardwareFilter.frequency.setValueAtTime(window.f1, t); 
            window.hardwareFilter.Q.setValueAtTime(dynamicQ, t);
        }
        else if (window.currentFilterMode === 'BP') { 
            window.hardwareFilter.type = 'bandpass'; 
            window.hardwareFilter.frequency.setValueAtTime(window.f1, t); 
            let qValBP = window.f1 / (window.f2 > 0 ? window.f2 : 1.0); if (qValBP < 0.1) qValBP = 0.1;
            window.hardwareFilter.Q.setValueAtTime(qValBP, t);
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
window.oscNode = null; window.oscNode2 = null; window.scriptNode = null;

// ==========================================
// 💡 3️⃣ 聲學大革命：純硬體晶片節點直連拓撲（控制台 0 警告、0 雜音）
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
        
        // 💡 剛性拓撲骨架：發生器 ➔ 實體過濾器 ➔ 實體分析儀 ➔ 增益節點 ➔ 揚聲器
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

        // 💡 雙發聲節點直連硬體晶片過濾水管
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
    
    // 時域自動縮放防線，高 Q 值下 100% 自適應收攏防溢位
    let absMaxPeak = Math.max(...rawSlice.map(Math.abs)); if (absMaxPeak < 0.1) absMaxPeak = 0.1;
    let scaleY = 145 / absMaxPeak; if (scaleY > 165) scaleY = 165;

    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), vpp = max - min, sq = 0;
    rawSlice.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rawSlice.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let maxMag = -Infinity, maxIdx = 0;
    for (let i = 0; i < freqData.length; i++) { if (freqData[i] > maxMag) { maxMag = freqData[i]; maxIdx = i; } }
    let peakFreq = maxIdx * ((window.audioCtx ? window.audioCtx.sampleRate : 44100) / window.FFT_SIZE);
    document.getElementById('freqVal').innerText = maxMag > -100 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
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
    // 💡 頻域畫布渲染：正宗負分貝標尺（0dB ~ -80dB 剛性視窗）
    // ==========================================
    window.fCtx.clearRect(0, 0, 800, 400); window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400);
    
    window.fCtx.strokeStyle = '#333333'; window.fCtx.lineWidth = 1; window.fCtx.beginPath();
    for (let k = 0; k <= 4; k++) { let xPos = 200 * k; if (k === 4) xPos = 799; window.fCtx.moveTo(xPos, 0); window.fCtx.lineTo(xPos, 360); } window.fCtx.stroke();

    window.fCtx.fillStyle = '#ffffff'; window.fCtx.font = 'bold 12px Arial';
    let ticks = ["0.00 kHz", "1.25 kHz", "2.50 kHz", "3.75 kHz", "5.00 kHz"];
    for (let k = 0; k <= 4; k++) { let textOffset = k === 0 ? 15 : (k === 4 ? -75 : -25); window.fCtx.fillText(ticks[k], (200 * k) + textOffset, 385); }

    // 實裝標準負分貝水平橫網格
    window.fCtx.strokeStyle = '#222222'; window.fCtx.beginPath();
    let dbSteps = [0, -20, -40, -60, -80];
    dbSteps.forEach(db => { let yPos = 30 + ((db / -80) * 310); window.fCtx.moveTo(0, yPos); window.fCtx.lineTo(800, yPos); }); window.fCtx.stroke();
    window.fCtx.fillStyle = '#aaaaaa'; window.fCtx.font = 'bold 11px Arial'; dbSteps.forEach(db => { let yPos = 30 + ((db / -80) * 310); window.fCtx.fillText(db + " dB", 20, yPos + 4); });

    // 絕對 1:1 物理頻率 X 軸直通車映射（4kHz 永遠死鎖歸位！）
    let hzPerBinHW = ((window.audioCtx ? window.audioCtx.sampleRate : 44100) / window.FFT_SIZE);
    window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 2.0; window.fCtx.beginPath();
    
    let isFirstPoint = true;
    for (let n = 0; n < freqData.length; n++) { 
        let currentPointRealHz = n * hzPerBinHW;
        if (currentPointRealHz > 5000) break; 
        
        let curX = (currentPointRealHz / 5000) * 800;
        
        // 💡 晶片直接輸出原生高精度負分貝，0 任何手寫二次失真
        let dB = freqData[n]; 
        if (dB > 0) dB = 0; if (dB < -80) dB = -80; 
        let y = 30 + ((dB / -80) * 310); // 幾何翻轉：0dB 在最頂層，-80dB 沉底
        
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
        if (btn) { btn.innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試"; btn.className = window.isSimulating ? "btn-sim active" : "btn-sim"; }
        document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：硬體晶片對接，4kHz 剛性壓制解鎖！" : "狀態：模擬測試已停止。";
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
                let dQ = 0.1 + (window.f2 / 5000.0) * 17.9; f2SliderEl.nextElementSibling.innerText = "Q: " + dQ.toFixed(2);
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
                    let dQ = 0.1 + (window.f2 / 5000.0) * 17.9; nextSpan.innerText = "Q: " + dQ.toFixed(2);
                } else { nextSpan.innerText = window.f2 + " Hz"; }
            }
            window.updateFilterCoefficients(); 
        }
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
