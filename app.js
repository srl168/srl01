//102
if (window.audioInterval) clearInterval(window.audioInterval);
window.isWritingLock = false;

// ==========================================
// 💡 1️⃣ 全域記憶體大腦池初始化
// ==========================================
window.currentSampleRate = 20000;
window.currentSinFreq = 3000; 
window.filteredDataLog = [];
window.bufferIndex = 0;
window.isSpeakerOn = false; // 💡 實裝喇叭發聲狀態標記
window.isSimulating = false;
window.simPhase = 0;
window.simPhase2 = 0;             
window.FFT_SIZE = 1024; // 1024 點精密實務骨架
window.analysisBuffer = new Float32Array(window.FFT_SIZE);
window.simWorker = null;
window.renderFrameCounter = 0; 

window.currentFilterMode = 'RAW';
window.f1 = 1000; window.f2 = 3000;
window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0;
let xv = new Float32Array(3), yv = new Float32Array(3);

// ==========================================
// 💡 2️⃣ 數位濾波器精密係數計算公式（100% 嚙合拉桿採樣率）
// ==========================================
window.updateFilterCoefficients = function() {
    let fr = window.currentSampleRate / window.f1; if (fr < 2.01) fr = 2.01;
    let o = Math.tan(Math.PI / fr);
    
    let qValLP_HP = 0.1 + (window.f2 / 5000.0) * 9.9; 
    if (qValLP_HP < 0.1) qValLP_HP = 0.1; if (qValLP_HP > 10.0) qValLP_HP = 10.0;

    if (window.currentFilterMode === 'RAW') {
        window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0;
    }
    else if (window.currentFilterMode === 'LP') { 
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
// 💡 3️⃣ 聲學大革命：發聲、濾波器與快取分析完全嚙合（聲音按鈕啟動，聽覺與視覺 100% 同步！）
// ==========================================
window.initAudioGlobal = function() {
    if (window.audioInterval) clearInterval(window.audioInterval);
    
    // 💡 工業級硬體揚聲節點初始化
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain();
        window.gainNode.connect(window.audioCtx.destination); // 對接電腦耳機喇叭實體聲道
    }
    
    // 💡 聲音鈕啟動映射：開啟時給予 0.25 的舒適防爆音量，關閉時置 0 靜音
    window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? 0.25 : 0.0, window.audioCtx.currentTime);
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();

    if (window.isSimulating) {
        window.updateFilterCoefficients();
        
        // 建立一個安全高密度的 16ms 滿格數據生成泵
        window.audioInterval = setInterval(() => {
            let bufferChunk = new Float32Array(128);
            
            for (let i = 0; i < 128; i++) {
                // 模擬 44.1kHz 下的複頻雙音採樣步進
                let step1 = 2.0 * Math.PI * (window.currentSinFreq / 44100);
                let step2 = 2.0 * Math.PI * ((window.currentSinFreq * 0.4) / 44100);
                
                let v1 = Math.sin(window.simPhase); window.simPhase += step1; if (window.simPhase >= 2*Math.PI) window.simPhase -= 2*Math.PI;
                let v2 = Math.sin(window.simPhase2); window.simPhase2 += step2; if (window.simPhase2 >= 2*Math.PI) window.simPhase2 -= 2*Math.PI;
                
                let rawVal = (v1 + v2) * 0.5;
                // 💡 讓發聲資料流與手寫二階 IIR 數位大腦 100% 強制通電過濾！
                let fVal = window.applyFilter ? window.applyFilter(rawVal) : rawVal;
                
                bufferChunk[i] = fVal; // 寫入發聲快取
                
                // 推入快取分析池供畫布繪圖
                window.filteredDataLog.push(fVal);
                window.analysisBuffer[window.bufferIndex] = fVal;
                window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
            }
            
            // 💡 實裝喇叭真實發聲功能：當發聲按鈕被激活時，將被數位濾波器過濾完的資料即時投遞給網頁音訊喇叭節點
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
    if (window.filteredDataLog.length < 50) return;

    let minFreq = window.currentSinFreq * 0.4;
    let adaptivePointsCount = Math.round((3 * 44100) / (minFreq > 0 ? minFreq : 1000) * (44100 / window.currentSampleRate));
    if (adaptivePointsCount < 64) adaptivePointsCount = 64; if (adaptivePointsCount > window.filteredDataLog.length) adaptivePointsCount = window.filteredDataLog.length;

    let rawSlice = window.filteredDataLog.slice(-adaptivePointsCount);
    
    // 時域最大絕對值自適應換檔，100% 幾何防出框！
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
    
    let realHWFreq = maxIdx * (44100 / window.FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? realHWFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
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
    // 💡 💡 💡 儀表大革命：新增「自適應性」寬度觀測視窗（解耦 5000Hz 上限！）
    // ==========================================
    window.fCtx.clearRect(0, 0, 800, 400); window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400);
    
    // 💡 自適應視窗核心算法：根據目前的截止頻率 F1 的 2.2 倍進行拉伸放大，最窄限制在 1200Hz 視野
    let maxDisplayFreq = window.f1 * 2.2; 
    if (maxDisplayFreq < 1200) maxDisplayFreq = 1200; 
    if (maxDisplayFreq > 5000) maxDisplayFreq = 5000; // 安全極限不超過拉桿上限 5kHz

    // 繪製垂直自適應 5 等分網格線
    window.fCtx.strokeStyle = '#333333'; window.fCtx.lineWidth = 1; window.fCtx.beginPath();
    for (let k = 0; k <= 4; k++) { let xPos = 200 * k; if (k === 4) xPos = 799; window.fCtx.moveTo(xPos, 0); window.fCtx.lineTo(xPos, 360); }
    window.fCtx.stroke();

    // 印上隨視窗動態自適應更新的純白高清晰 kHz 數字刻度尺
    window.fCtx.fillStyle = '#ffffff'; window.fCtx.font = 'bold 12px Arial';
    for (let k = 0; k <= 4; k++) {
        let textOffset = k === 0 ? 15 : (k === 4 ? -75 : -25);
        let currentTickFreq = (maxDisplayFreq / 4) * k;
        window.fCtx.fillText((currentTickFreq / 1000).toFixed(2) + " kHz", (200 * k) + textOffset, 385);
    }

    // ==========================================
    // 💡 💡 💡 💡 新增「縱軸分貝對數（0dB ~ -60dB）」工業格線標尺網格
    // ==========================================
    window.fCtx.strokeStyle = '#222222'; window.fCtx.beginPath();
    let dbSteps = [0, -12, -30, -50];
    dbSteps.forEach(db => {
        let yPos = 30 + ((db / -60) * 310); // 將 0 到 -60dB 均勻刻鎖在畫布高度區間
        window.fCtx.moveTo(0, yPos); window.fCtx.lineTo(800, yPos);
    });
    window.fCtx.stroke();
    
    window.fCtx.fillStyle = '#aaaaaa'; window.fCtx.font = 'bold 11px Arial';
    dbSteps.forEach(db => { let yPos = 30 + ((db / -60) * 310); window.fCtx.fillText(db + " dB", 20, yPos + 4); });

    // ==========================================
    // 💡 💡 💡 💡 絕對物理頻率橫軸對齊與 20log10 正宗分貝縱軸融合投影
    // ==========================================
    let hzPerBinHW = (44100 / window.FFT_SIZE);
    window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 2.5; window.fCtx.beginPath();
    
    let isFirstPoint = true;
    for (let n = 0; n < magnitudes.length; n++) { 
        let currentPointRealHz = n * hzPerBinHW;
        // 💡 自適應窄波峰防線：超過當前動態上限（maxDisplayFreq）的點位自動截斷、不再畫入右側！
        if (currentPointRealHz > maxDisplayFreq) break; 
        
        // 💡 剛性自適應橫軸投影：X 座標隨視窗寬度靈敏拉伸
        let curX = (currentPointRealHz / maxDisplayFreq) * 800;
        
        // 💡 剛性正宗對數分貝縱軸運算
        let linearVal = magnitudes[n] * 6.5; if (linearVal < 0.001) linearVal = 0.001; 
        let dB = 20 * Math.log10(linearVal);
        
        if (dB > 5) dB = 5; if (dB < -60) dB = -60; // 死鎖邊界
        let y = 30 + ((dB / -60) * 310); // 💡 幾何翻轉：0dB在最上方、-60dB壓扁沉底
        
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
        document.getElementById('status').innerText = window.isSimulating ? "▶️ 離線沙盒：分貝對數縱軸 ＋ 自適應窄波峰拉伸大腦點火！" : "狀態：模擬測試已停止。";
    }
    // 💡 聲音鈕啟動功能綁定監聽：點擊時即時改變狀態，並重新啟動音訊水管
    if (clickId === 'speakerBtn') {
        window.isSpeakerOn = !window.isSpeakerOn; const sBtn = document.getElementById('speakerBtn');
        if (sBtn) { sBtn.innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉"; sBtn.className = window.isSpeakerOn ? "btn-speaker" : "btn-speaker muted"; }
        window.initAudioGlobal(); // 即時重啟 Mixer 灌注真實揚聲
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
const sEl = document.getElementById('sampleRateSlider'); const fEl = document.getElementById('sinFreqSlider');const f1El = document.getElementById('f1Slider'); const f2El = document.getElementById('f2Slider');if (sEl) window.currentSampleRate = parseInt(sEl.value); if (fEl) window.currentSinFreq = parseInt(fEl.value);if (f1El) window.f1 = parseInt(f1El.value); if (f2El) window.f2 = parseInt(f2El.value);if (window.updateFilterCoefficients) window.updateFilterCoefficients(); if (window.globalRenderLoop) window.globalRenderLoop();};