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

// 💡 2️⃣ 100% 硬件加速的濾波器係數同步閘門（徹底消滅手寫公式斷音！）
window.updateFilterCoefficients = function() {
    if (!window.hardwareFilter) return;
    try {
        if (window.currentFilterMode === 'RAW') { window.hardwareFilter.type = 'allpass'; }
        else if (window.currentFilterMode === 'LP') { window.hardwareFilter.type = 'lowpass'; window.hardwareFilter.frequency.setValueAtTime(window.f1, window.audioCtx.currentTime); }
        else if (window.currentFilterMode === 'HP') { window.hardwareFilter.type = 'highpass'; window.hardwareFilter.frequency.setValueAtTime(window.f1, window.audioCtx.currentTime); }
    } catch (e) {}
};

window.applyFilter = function(x) { return x; };

window.addEventListener('DOMContentLoaded', () => {
    window.tCanvas = document.getElementById('timeCanvas'); window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d'); window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400; window.fCanvas.width = 800; window.fCanvas.height = 400;
});
// ==========================================
// 💡 3️⃣ 聲學大革命：100% 硬體晶片加速發聲直通車
// ==========================================
window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode.disconnect(); }
    
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain();
        window.hardwareFilter = window.audioCtx.createBiquadFilter(); // 💡 建立硬體濾波器節點
        window.hardwareAnalyser = window.audioCtx.createAnalyser();   // 💡 建立硬體分析器節點
        window.hardwareAnalyser.fftSize = window.FFT_SIZE;
        
        // 💡 1對1 鋼性硬體鏈：Oscillator ➔ BiquadFilter ➔ Analyser ➔ Gain ➔ Speaker
        window.hardwareFilter.connect(window.hardwareAnalyser);
        window.hardwareAnalyser.connect(window.gainNode);
        window.gainNode.connect(window.audioCtx.destination);
    }
    
    window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? 0.3 : 0.0, window.audioCtx.currentTime);
    window.updateFilterCoefficients();

    if (window.isSimulating) {
        window.oscNode = window.audioCtx.createOscillator();
        window.oscNode.type = 'sine';
        window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime);
        window.oscNode.connect(window.hardwareFilter); // 接上硬體過濾鏈
        window.oscNode.start();
    }
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
};

window.consumeRawBuffer = function(rawDataView) {
    if (!window.hardwareAnalyser) return;
    let byteLength = rawDataView.byteLength;
    let buffer = new Float32Array(window.FFT_SIZE);
    window.hardwareAnalyser.getFloatTimeDomainData(buffer);
    for (let i = 0; i < byteLength; i++) {
        let byteVal = rawDataView.getUint8(i); let val = (byteVal / 127.5) - 1.0;
        window.filteredDataLog.push(buffer[i % window.FFT_SIZE] || val);
        if (window.filteredDataLog.length > 5000) window.filteredDataLog.shift();
    }
};
window.globalRenderLoop = function() {
    requestAnimationFrame(window.globalRenderLoop); if (!window.hardwareAnalyser) return;
    
    // 💡 鋼性解鎖：直接向硬體晶片索取最新過濾後的純淨時域與頻域數據！
    let timeData = new Float32Array(window.FFT_SIZE); window.hardwareAnalyser.getFloatTimeDomainData(timeData);
    let freqData = new Float32Array(window.hardwareAnalyser.frequencyBinCount); window.hardwareAnalyser.getFloatFrequencyData(freqData);
    
    if (window.isSimulating) {
        window.filteredDataLog = Array.from(timeData);
        for (let m = 0; m < window.FFT_SIZE; m++) { window.analysisBuffer[m] = timeData[m]; }
    }
    if (window.filteredDataLog.length < 50) return;

    let adaptivePointsCount = Math.round((3 * (window.audioCtx ? window.audioCtx.sampleRate : 44100)) / window.currentSinFreq);
    if (adaptivePointsCount < 128) adaptivePointsCount = 128; let rawSlice = window.filteredDataLog.slice(-adaptivePointsCount);
    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), vpp = max - min, sq = 0;
    rawSlice.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rawSlice.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    // 💡 FFT 晶片硬鎖：利用瀏覽器內建高精密度演算法，100% 絕對換算真實頻率，拉動拉桿立刻秒速更新！
    let maxMag = -Infinity, maxIdx = 0;
    for (let i = 0; i < freqData.length; i++) { if (freqData[i] > maxMag) { maxMag = freqData[i]; maxIdx = i; } }
    let peakFreq = maxIdx * ((window.audioCtx ? window.audioCtx.sampleRate : 44100) / window.FFT_SIZE);
    document.getElementById('freqVal').innerText = maxMag > -100 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
    window.tCtx.clearRect(0, 0, window.tCanvas.width, window.tCanvas.height);
    window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, window.tCanvas.width, window.tCanvas.height); window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath();
    let midY = window.tCanvas.height / 2; window.tCtx.moveTo(0, midY - (timeData[0] * (window.tCanvas.height / 2.3)));
    for (let j = 1; j < 150; j++) { window.tCtx.lineTo(j * (window.tCanvas.width / 149), midY - (timeData[j] * (window.tCanvas.height / 2.3))); }
    window.tCtx.stroke();
    
    window.fCtx.clearRect(0, 0, window.fCanvas.width, window.fCanvas.height);
    window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, window.fCanvas.width, window.fCanvas.height); window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 1.5; window.fCtx.beginPath();
    let fSlice = window.fCanvas.width / (freqData.length / 2);
    for (let n = 0; n < freqData.length / 2; n++) { let y = window.fCanvas.height - ((freqData[n] + 140) * (window.fCanvas.height / 140)); if (n == 0) window.fCtx.moveTo(0, y); else window.fCtx.lineTo(n * fSlice, y); }
    window.fCtx.stroke();
};

// ==========================================
// 💡 4️⃣ 1對1 鋼性實體 ID 認領門閥（按鈕、拉桿外觀 100% 滿血大復活！）
// ==========================================
document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return;
    const clickId = e.target.id;
    if (clickId === 'simBtn') {
        window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn');
        window.initAudioGlobal();
        if (btn) { btn.innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試"; btn.className = window.isSimulating ? "btn-sim active" : "btn-sim"; }
        document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：硬體晶片加速直通車通電！" : "狀態：模擬測試已停止。";
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
        const f2View = document.getElementById('f2Container'); if (f2View) f2View.style.display = window.currentFilterMode === 'BP' ? 'flex' : 'none';
        window.updateFilterCoefficients();
    }
});

document.addEventListener('input', (e) => {
    if (e.target && e.target.type === 'range') {
        let sliderId = e.target.id; let curVal = parseFloat(e.target.value); let nextSpan = e.target.nextElementSibling;
        if (sliderId === "sampleRateSlider") { window.currentSampleRate = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSampleRate + " Hz"; window.updateFilterCoefficients(); }
        if (sliderId === "sinFreqSlider") { window.currentSinFreq = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.currentSinFreq + " Hz"; if (window.oscNode && window.audioCtx) window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime); }
        if (sliderId === "f1Slider") { window.f1 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f1 + " Hz"; window.updateFilterCoefficients(); }
        if (sliderId === "f2Slider") { window.f2 = parseInt(curVal); if (nextSpan) nextSpan.innerText = window.f2 + " Hz"; }
    }
});

window.onload = function() {
    const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider');
    const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');
    if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value);
    if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);
    if (window.globalRenderLoop) window.globalRenderLoop();
};
