//1221
if (window.audioInterval) clearInterval(window.audioInterval);
window.isWritingLock = false;

// ==========================================
// 💡 1️⃣ 全域記憶體大腦池初始化
// ==========================================
window.currentSampleRate = 20000; window.currentSinFreq = 3000; 
window.filteredDataLog = []; window.bufferIndex = 0;
window.nextPlayTime = 0; window.isSpeakerOn = false;
window.isSimulating = false; window.currentVolume = 0.3; 
window.simPhase = 0; window.simPhase2 = 0;             
window.FFT_SIZE = 1024; window.renderFrameCounter = 0; 
window.analysisBuffer = new Float32Array(window.FFT_SIZE);

window.currentFilterMode = 'RAW'; window.f1 = 1000; window.f2 = 3000;
window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0;

// 🚀 🔒 頂層全域暫存器 Float32Array 卡死
window.xv = new Float32Array(3); window.yv = new Float32Array(3);

window.addEventListener('DOMContentLoaded', () => {
    window.tCanvas = document.getElementById('timeCanvas'); 
    window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d'); 
    window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400; 
    window.fCanvas.width = 800; window.fCanvas.height = 400;
});
// ==========================================
// 💡 2️⃣ 數位濾波器精密係數計算公式
// ==========================================
window.updateFilterCoefficients = function() {
    let fs = window.currentSampleRate;
    let fr1 = fs / window.f1; if (fr1 < 2.01) fr1 = 2.01;
    let o = Math.tan(Math.PI / fr1);

    if (window.currentFilterMode === 'LP') { 
        let qVal = 0.7071; let c = 1 + (o / qVal) + o * o; 
        window.b0 = (o * o) / c; window.b1 = 2 * window.b0; window.b2 = window.b0; 
        window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - (o / qVal) + o * o) / c; 
    } 
    else if (window.currentFilterMode === 'HP') { 
        let qVal = 0.7071; let c = 1 + (o / qVal) + o * o; 
        window.b0 = 1.0 / c; window.b1 = -2.0 / c; window.b2 = 1.0 / c; 
        window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - (o / qVal) + o * o) / c; 
    } 
    else if (window.currentFilterMode === 'BP') { 
        let f2Correct = window.f2; if (f2Correct <= window.f1) f2Correct = window.f1 + 10;
        let fr2 = fs / f2Correct; if (fr2 < 2.01) fr2 = 2.01;
        let o2 = Math.tan(Math.PI / fr2);
        let W = o2 - o; if (W < 0.001) W = 0.001; let C = o * o2; 
        let cBP = 1.0 + W + C;
        window.b0 = W / cBP; window.b1 = 0.0; window.b2 = -window.b0;
        window.a1 = 2.0 * (C - 1.0) / cBP; window.a2 = (1.0 - W + C) / cBP;
    } 
    else { window.b0 = 1; window.b1 = window.b2 = window.a1 = window.a2 = 0; }
    
    if (isNaN(window.b0) || !isFinite(window.b0) || isNaN(window.a1) || !isFinite(window.a1)) {
        window.b0 = 1; window.b1 = window.b2 = window.a1 = window.a2 = 0;
    }
};

// 🔒 🚀 【真．核心淨土】看清楚了！中括號 [0][1][2] 與 window. 前綴完璧歸趙，100% 絕對雷打不動！
window.applyFilter = function(x) { 
    if (window.currentFilterMode === 'RAW') return x;
    
    window.xv[0] = window.xv[1]; window.xv[1] = window.xv[2]; window.xv[2] = x;
    window.yv[0] = window.yv[1]; window.yv[1] = window.yv[2];
    
    window.yv[2] = (window.b0 * window.xv[2]) + (window.b1 * window.xv[1]) + (window.b2 * window.xv[0]) 
                   - (window.a1 * window.yv[1]) - (window.a2 * window.yv[0]);
    
    if (isNaN(window.yv[2]) || !isFinite(window.yv[2])) { 
        window.yv[0] = window.yv[1] = window.yv[2] = window.xv[0] = window.xv[1] = window.xv[2] = 0; 
    } 
    return window.yv[2];
};
window.oscNode = null; window.oscNode2 = null; window.scriptNode = null;
window.audioCtx = null; window.gainNode = null;

window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode = null; }
    if (window.oscNode2) { try { window.oscNode2.stop(); } catch(e){} window.oscNode2 = null; }
    if (window.scriptNode) window.scriptNode.disconnect();
    
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain(); window.gainNode.connect(window.audioCtx.destination);
    }
    window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? window.currentVolume : 0.0, window.audioCtx.currentTime);
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();

    if (window.isSimulating) {
        window.updateFilterCoefficients();
        window.oscNode = window.audioCtx.createOscillator(); window.oscNode2 = window.audioCtx.createOscillator();
        window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime); 
        window.oscNode2.frequency.setValueAtTime(window.currentSinFreq * 0.4, window.audioCtx.currentTime);
        window.scriptNode = window.audioCtx.createScriptProcessor(1024, 1, 1);
        window.scriptNode.onaudioprocess = function(audioProcessingEvent) {
            let outputData = audioProcessingEvent.outputBuffer.getChannelData(0);
            for (let sample = 0; sample < audioProcessingEvent.inputBuffer.length; sample++) {
                let step1 = 2.0 * Math.PI * (window.currentSinFreq / 44100), step2 = 2.0 * Math.PI * ((window.currentSinFreq * 0.4) / 44100);
                
                // 🔒 原裝 0.5 雙音發聲增益死鎖
                let rawVal = (Math.sin(window.simPhase) + Math.sin(window.simPhase2)) * 0.5;
                window.simPhase = (window.simPhase + step1) % (2 * Math.PI); window.simPhase2 = (window.simPhase2 + step2) % (2 * Math.PI);
                
                // 🚀 🛠️ 實務隨機噪訊：注入微量物理高斯雜訊底噪（幅值 0.002），瞬間擊碎 1830Hz 網格的純數學相消！
                let u1 = Math.random(), u2 = Math.random(); if (u1 === 0) u1 = 0.0001;
                let gaussianNoise = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2) * 0.002;
                let noisyVal = rawVal + gaussianNoise;
                
                let fVal = window.applyFilter ? window.applyFilter(noisyVal) : noisyVal; outputData[sample] = fVal;
                window.filteredDataLog.push(fVal); window.analysisBuffer[window.bufferIndex] = fVal; window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
            }
            if (window.filteredDataLog.length > 4000) window.filteredDataLog = window.filteredDataLog.slice(-3000);
        };
        window.oscNode.connect(window.scriptNode); window.oscNode2.connect(window.scriptNode); window.scriptNode.connect(window.gainNode); window.oscNode.start(); window.oscNode2.start();
    }
};

window.consumeRawBuffer = function(rawDataView) {
    for (let i = 0; i < rawDataView.byteLength; i++) {
        let fVal = window.applyFilter((rawDataView.getUint8(i) / 127.5) - 1.0); window.filteredDataLog.push(fVal);
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
                let u_r = re[i+j], u_i = im[i+j], v_r = re[i+j+len/2]*w_r - im[i+j+len/2]*w_i, v_i = re[i+j+len/2]*w_i + im[i+j+len/2]*w_r;
                re[i+j] = u_r + v_r; im[i+j] = u_i + v_i; re[i+j+len/2] = u_r - v_r; im[i+j+len/2] = u_i - v_i;
                let next_w_r = w_r * wlen_r - w_i * wlen_i; w_i = w_r * wlen_i + w_i * wlen_r; w_r = next_w_r;
            }
        }
    }
}

window.globalRenderLoop = function() {
    requestAnimationFrame(window.globalRenderLoop); window.renderFrameCounter++; if (window.renderFrameCounter % 2 !== 0) return;
    let voltSteps = [1.0, 0.5, 0.0, -0.5, -1.0], dbSteps = [0, -12, -30, -50], midY = 200;

    if (!window.isSimulating && window.filteredDataLog.length === 0) {
        window.tCtx.clearRect(0,0,800,400); window.tCtx.fillStyle='#111'; window.tCtx.fillRect(0,0,800,400); window.tCtx.strokeStyle='#333'; window.tCtx.beginPath(); voltSteps.forEach(v => { window.tCtx.moveTo(0,midY-v*145); window.tCtx.lineTo(800,midY-v*145); }); window.tCtx.stroke();
        window.tCtx.fillStyle='#fff'; window.tCtx.font='bold 12px Arial'; window.tCtx.fillText("+1.0V", 25, 55); window.tCtx.fillText("0.0V", 25, 204); window.tCtx.fillText("-1.0V", 25, 345);
        window.fCanvas.getContext('2d').clearRect(0,0,800,400); window.fCtx.fillStyle='#111'; window.fCtx.fillRect(0,0,800,400); window.fCtx.strokeStyle='#333'; window.fCtx.beginPath(); for(let k=0;k<=4;k++){window.fCtx.moveTo(k*200,0);window.fCtx.lineTo(k*200,360);} window.fCtx.stroke(); window.fCtx.fillStyle='#fff'; let ticks = ["0.00 kHz","1.25 kHz","2.50 kHz","3.75 kHz","5.00 kHz"]; for(let k=0;k<=4;k++) window.fCtx.fillText(ticks[k], k*200+(k===0?15:k===4?-75:-25), 385);
        window.fCtx.strokeStyle='#555555'; window.fCtx.beginPath(); dbSteps.forEach(db => { window.fCtx.moveTo(0,30+(db/-50)*310); window.fCtx.lineTo(800,30+(db/-50)*310); }); window.fCtx.stroke(); window.fCtx.fillStyle='#ffffff'; window.fCtx.font='bold 11px Arial'; dbSteps.forEach(db => window.fCtx.fillText(db+" dB", 20, 34+(db/-50)*310));
        document.getElementById('vppVal').innerText = "0.00 V"; document.getElementById('rmsVal').innerText = "0.00 V"; document.getElementById('freqVal').innerText = "0.0 Hz"; return;
    }
    if (window.filteredDataLog.length < 10) return;
    let rawSlice = window.filteredDataLog.slice(-Math.max(64, Math.min(window.filteredDataLog.length, Math.round((3 * 44100) / (window.currentSinFreq * 0.4)))));
    let scaleY = 145.0; let max = Math.max(...rawSlice), min = Math.min(...rawSlice), sq = 0; rawSlice.forEach(v => sq += v * v);
    document.getElementById('vppVal').innerText = (max - min).toFixed(2) + " V"; document.getElementById('rmsVal').innerText = Math.sqrt(sq / rawSlice.length).toFixed(2) + " V";
    
    let re = new Float32Array(window.FFT_SIZE), im = new Float32Array(window.FFT_SIZE);
    for (let k = 0; k < window.FFT_SIZE; k++) re[k] = window.analysisBuffer[(window.bufferIndex + k) % window.FFT_SIZE];
    localFFT(re, im); let magnitudes = new Float32Array(window.FFT_SIZE / 2), maxMag = 0;
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); if (m > 1 && magnitudes[m] > maxMag) { maxMag = magnitudes[m]; } }
    
    let hzPerBin = 44100 / window.FFT_SIZE;
    let maxDisplayFreq = window.currentSinFreq * 1.5;
    let htmlMaxFreq = parseFloat(document.getElementById('sinFreqSlider')?.max) || 5000;
    if (maxDisplayFreq < 200) maxDisplayFreq = 200; if (maxDisplayFreq > htmlMaxFreq) maxDisplayFreq = htmlMaxFreq;
    
    let currentFrameMaxMag = Math.max(...magnitudes); if (currentFrameMaxMag < 0.001) currentFrameMaxMag = 0.001;
    document.getElementById('freqVal').innerText = maxMag > 0.02 ? ((magnitudes[Math.round((window.currentSinFreq*0.4)/hzPerBin)] > magnitudes[Math.round(window.currentSinFreq/hzPerBin)] ? window.currentSinFreq * 0.4 : window.currentSinFreq)).toFixed(1) + " Hz" : "0.0 Hz";

    window.tCtx.clearRect(0, 0, 800, 400); window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, 800, 400); window.tCtx.strokeStyle = '#333'; window.tCtx.lineWidth = 1; window.tCtx.beginPath(); voltSteps.forEach(v => { let yPos = midY - v * scaleY; window.tCtx.moveTo(0, yPos); window.tCtx.lineTo(800, yPos); }); window.tCtx.stroke();
    window.tCtx.fillStyle = '#ffffff'; window.tCtx.font = 'bold 12px Arial'; voltSteps.forEach(v => window.tCtx.fillText((v >= 0 ? "+" : "") + v.toFixed(1) + "V", 25, midY - v * scaleY + 4));
    window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath(); window.tCtx.moveTo(0, midY - (rawSlice * scaleY)); for (let j = 1; j < rawSlice.length; j++) { window.tCtx.lineTo(j * (800 / (rawSlice.length - 1)), midY - (rawSlice[j] * scaleY)); } window.tCtx.stroke();
    window.tCtx.fillStyle = '#00ff66'; window.tCtx.fillText("全幅時間: " + ((rawSlice.length / 44100) * 1000).toFixed(2) + " ms", 620, 380);

    window.fCtx.clearRect(0, 0, 800, 400); window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400); window.fCtx.strokeStyle = '#333'; window.fCtx.beginPath(); for (let k = 0; k <= 4; k++) window.fCtx.moveTo(k * 200, 0), window.fCtx.lineTo(k * 200, 360); window.fCtx.stroke();
    window.fCtx.fillStyle = '#ffffff'; for (let k = 0; k <= 4; k++) window.fCtx.fillText((((maxDisplayFreq / 4) * k) / 1000).toFixed(2) + " kHz", k * 200 + (k === 0 ? 15 : k === 4 ? -75 : -25), 385);
    window.fCtx.strokeStyle = '#555555'; window.fCtx.lineWidth = 1; window.fCtx.beginPath(); dbSteps.forEach(db => { window.fCtx.moveTo(0, 30 + ((db / -50) * 310)); window.fCtx.lineTo(800, 30 + ((db / -50) * 310)); }); window.fCtx.stroke(); window.fCtx.fillStyle = '#ffffff'; window.fCtx.font = 'bold 11px Arial'; dbSteps.forEach(db => window.fCtx.fillText(db + " dB", 20, 34 + ((db / -50) * 310)));
    
    window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 2.5; window.fCtx.beginPath(); let isFirstPoint = true;
    for (let n = 0; n < magnitudes.length; n++) { 
        let currentPointRealHz = n * hzPerBin; if (currentPointRealHz > maxDisplayFreq) break; let curX = (currentPointRealHz / maxDisplayFreq) * 800;
        let y = 30 + ((1.0 - (magnitudes[n] / currentFrameMaxMag)) * 310);
        if (isNaN(y) || !isFinite(y)) y = 358.0; if (y < 32.0) y = 32.0; if (y > 358) y = 358; 
        if (isFirstPoint) { window.fCtx.moveTo(curX, y); isFirstPoint = false; } else { window.fCtx.lineTo(curX, y); }
    } window.fCtx.stroke();
};
window.renderFilterButtonLights = function() {
    const btnIds = { RAW: 'filterRaw', LP: 'filterLP', HP: 'filterHP', BP: 'filterBP' };
    Object.keys(btnIds).forEach(mode => {
        let btnEl = document.getElementById(btnIds[mode]);
        if (!btnEl) return;
        if (window.currentFilterMode === mode) {
            btnEl.style.backgroundColor = '#00ff66';
            btnEl.style.color = '#111111';
            btnEl.style.fontWeight = 'bold';
            btnEl.classList.add('active');
        } else {
            btnEl.style.backgroundColor = '#2a2a2a';
            btnEl.style.color = '#ffffff';
            btnEl.style.fontWeight = 'normal';
            btnEl.classList.remove('active');
        }
    });
};

document.getElementById('simBtn')?.addEventListener('click', () => { window.isSimulating = !window.isSimulating; document.getElementById('simBtn').innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試"; window.initAudioGlobal(); });
document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return;
    let clickId = e.target.id;
    if (clickId === 'speakerBtn') { window.isSpeakerOn = !window.isSpeakerOn; document.getElementById('speakerBtn').innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉"; if (window.gainNode) window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? window.currentVolume : 0.0, window.audioCtx.currentTime); }
    
    const fModes = { filterRaw: 'RAW', filterLP: 'LP', filterHP: 'HP', filterBP: 'BP' };
    if (fModes[clickId]) {
        window.currentFilterMode = fModes[clickId];
        const f2View = document.getElementById('f2Container'); if (f2View) f2View.style.display = (clickId === 'filterBP') ? 'flex' : 'none';
        window.updateFilterCoefficients();
        window.renderFilterButtonLights();
    }
});
document.addEventListener('input', (e) => {
    if (!e.target || !e.target.id || e.target.type !== 'range') return;
    let curVal = parseFloat(e.target.value), sliderId = e.target.id;
    if (sliderId === "sampleRateSlider") { window.currentSampleRate = parseInt(curVal); window.updateFilterCoefficients(); }
    if (sliderId === "sinFreqSlider") window.currentSinFreq = parseInt(curVal);
    if (sliderId === "f1Slider") { window.f1 = parseInt(curVal); window.updateFilterCoefficients(); }
    if (sliderId === "f2Slider") { 
        window.f2 = parseInt(curVal); if (e.target.nextElementSibling) e.target.nextElementSibling.innerText = window.f2 + " Hz";
        window.updateFilterCoefficients(); 
    }
    if (sliderId === "volumeSlider") { window.currentVolume = curVal; if (e.target.nextElementSibling) e.target.nextElementSibling.innerText = Math.round(curVal * 100) + "%"; if (window.gainNode && window.isSpeakerOn) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime); }
    if (e.target.nextElementSibling && sliderId !== "f2Slider" && sliderId !== "volumeSlider") e.target.nextElementSibling.innerText = curVal + " Hz";
});
window.onload = function() { window.updateFilterCoefficients(); window.renderFilterButtonLights(); window.globalRenderLoop(); };
