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

window.FFT_SIZE = 1024; // 1024點標準示波器黃金拓撲
window.analysisBuffer = new Float32Array(window.FFT_SIZE);

window.currentFilterMode = 'RAW';
window.f1 = 1000; window.f2 = 3000;

// 💡 沒收所有會卡死、會出錯的手寫 IIR 係數！全面宣告回歸純硬體晶片！
window.audioCtx = null; window.gainNode = null;
window.oscNode = null; window.oscNode2 = null; 
window.hardwareFilter = null; window.hardwareAnalyser = null;
let renderFrameCounter = 0;

// ==========================================
// 💡 2️⃣ 100% 硬件晶片加速的濾波器參數同步閘門（5ms 剛性平滑緩降通道，0 階梯噪音）
// ==========================================
window.updateFilterCoefficients = function() {
    if (!window.hardwareFilter || !window.audioCtx) return;
    try {
        let t = window.audioCtx.currentTime + 0.005; // 給予晶片 5 毫秒過渡
        
        if (window.currentFilterMode === 'RAW') { 
            window.hardwareFilter.type = 'allpass'; 
        }
        else if (window.currentFilterMode === 'LP') { 
            window.hardwareFilter.type = 'lowpass'; 
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
            // 💡 晶片 Q 值動態對齊：將拉桿 F2 完美映射給實體晶片，Q 越高高頻壓得越死！
            let dynamicQ = 0.1 + (window.f2 / 5000.0) * 17.9; // 0.1 ~ 18.0 精密區間
            if (dynamicQ < 0.1) dynamicQ = 0.1; if (dynamicQ > 18.0) dynamicQ = 18.0;
            window.hardwareFilter.Q.linearRampToValueAtTime(dynamicQ, t);
        }
        else if (window.currentFilterMode === 'HP') { 
            window.hardwareFilter.type = 'highpass'; 
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
            let dynamicQ = 0.1 + (window.f2 / 5000.0) * 17.9;
            if (dynamicQ < 0.1) dynamicQ = 0.1; if (dynamicQ > 18.0) dynamicQ = 18.0;
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
    window.tCanvas.width = 800; window.tCanvas.height = 400; window.fCanvas.width = 800; window.fCanvas.height = 400;
});
// ==========================================
// 💡 3️⃣ 聲學大革命：純網頁音訊硬體圖學直連（徹底物理清除短斷音與控制台過時警告！）
// ==========================================
window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode.disconnect(); window.oscNode = null; }
    if (window.oscNode2) { try { window.oscNode2.stop(); } catch(e){} window.oscNode2.disconnect(); window.oscNode2 = null; }
    
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain();
        window.hardwareFilter = window.audioCtx.createBiquadFilter(); // 💡 建立音效卡硬體濾波器節點
        window.hardwareAnalyser = window.audioCtx.createAnalyser();   // 💡 建立音效卡硬體分析器節點
        window.hardwareAnalyser.fftSize = window.FFT_SIZE;
        
        // 💡 1對1 鋼性硬體直通網絡：Oscillators ➔ 硬體過濾 ➔ 硬體分析 ➔ 增益節點 ➔ 喇叭
        window.hardwareFilter.connect(window.hardwareAnalyser);
        window.hardwareAnalyser.connect(window.gainNode);
        window.gainNode.connect(window.audioCtx.destination);
    }
    
    if (window.audioCtx.state === 'suspended') { window.audioCtx.resume(); }
    window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? 0.3 : 0.0, window.audioCtx.currentTime);
    window.updateFilterCoefficients();

    if (window.isSimulating) {
        // 💡 100% 晶片內核加速點火，絕不調用過時、會產生雜音的手寫 ScriptProcessor！
        window.oscNode = window.audioCtx.createOscillator();
        window.oscNode.type = 'sine';
        window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime);

        window.oscNode2 = window.audioCtx.createOscillator();
        window.oscNode2.type = 'sine';
        // 雙音對照組：第二音固定生成鎖死在主頻率的 0.4 倍，製造最漂亮的複頻和聲觀測！
        window.oscNode2.frequency.setValueAtTime(window.currentSinFreq * 0.4, window.audioCtx.currentTime);

        // 💡 雙硬體同時匯入硬體濾波網路進行 0 延遲混音！
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
    
    // 💡 眼睛直通晶片：直接向音效卡提取最新、最精準被硬體晶片過濾後的時域與頻域分貝數據！
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
    
    // 💡 時域最大絕對值即時盲抓（高 Q 值下 100% 自適應收攏防溢位！）
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
    // 💡 頻域畫布渲染：正宗分貝（dB）標尺（0 ~ -60dB 剛性視窗）
    // ==========================================
    window.fCtx.clearRect(0, 0, 800, 400); window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400);
    
    // 💡 幾何拉伸防線：全幅畫布最右端，代表固定不變的 5000 Hz 工業觀測視野！
    window.fCtx.strokeStyle = '#333333'; window.fCtx.lineWidth = 1; window.fCtx.beginPath();
    for (let k = 0; k <= 4; k++) { let xPos = 200 * k; if (k === 4) xPos = 799; window.fCtx.moveTo(xPos, 0); window.fCtx.lineTo(xPos, 360); }
    window.fCtx.stroke();

    window.fCtx.fillStyle = '#ffffff'; window.fCtx.font = 'bold 12px Arial';
    let ticks = ["0.00 kHz", "1.25 kHz", "2.50 kHz", "3.75 kHz", "5.00 kHz"];
    for (let k = 0; k <= 4; k++) { let textOffset = k === 0 ? 15 : (k === 4 ? -75 : -25); window.fCtx.fillText(ticks[k], (200 * k) + textOffset, 385); }

    // 💡 實裝標準工業分貝水平格線標尺
    window.fCtx.strokeStyle = '#222222'; window.fCtx.beginPath();
    let dbSteps = [0, -12, -30, -50];
    dbSteps.forEach(db => { let yPos = 30 + ((db / -60) * 310); window.fCtx.moveTo(0, yPos); window.fCtx.lineTo(800, yPos); });
    window.fCtx.stroke();
    window.fCtx.fillStyle = '#aaaaaa'; window.fCtx.font = 'bold 11px Arial'; dbSteps.forEach(db => { let yPos = 30 + ((db / -60) * 310); window.fCtx.fillText(db + " dB", 20, yPos + 4); });

    // 💡 絕對直通車繪圖映射：直接將硬體 Analyser 的點位，精準 1:1 投影到 5000Hz 畫布寬度上！
    let hzPerBinHW = ((window.audioCtx ? window.audioCtx.sampleRate : 44100) / window.FFT_SIZE);
    window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 2.0; window.fCtx.beginPath();
    
    let isFirstPoint = true;
    for (let n = 0; n < freqData.length; n++) { 
        let currentPointRealHz = n * hzPerBinHW;
        if (currentPointRealHz > 5000) break; 
        
        let curX = (currentPointRealHz / 5000) * 800;
        
        // 💡 硬體分貝直接讀取投影：直接將硬體分析器的負分貝數據（dB）完美投射到縱軸坐標軸！
        let dB = freqData[n]; // 晶片直接輸出原生負分貝
        if (dB > 0) dB = 0; if (dB < -80) dB = -80; // 限制安全視野
        
        let y = 30 + ((dB / -80) * 310); // 0dB 在最頂層（高高挺立），-80dB 沉底壓扁
        
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
        document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：100% 純硬體加速晶片直通網絡點火！" : "狀態：模擬測試已停止。";
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
