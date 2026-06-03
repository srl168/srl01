//1172
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
let xv = new Float32Array(3), yv = new Float32Array(3);

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
    let fr = window.currentSampleRate / window.f1; if (fr < 2.01) fr = 2.01;
    let o = Math.tan(Math.PI / fr), q = 0.1 + (window.f2 / 5000.0) * 9.9; 
    if (q < 0.1) q = 0.1; if (q > 10.0) q = 10.0;

    if (window.currentFilterMode === 'LP') { 
        let c = 1 + (o / q) + o * o; window.b0 = (o * o) / c; window.b1 = 2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - (o / q) + o * o) / c; 
    } else if (window.currentFilterMode === 'HP') { 
        let c = 1 + (o / q) + o * o; window.b0 = 1.0 / c; window.b1 = -2.0 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - (o / q) + o * o) / c; 
    } else if (window.currentFilterMode === 'BP') { 
        let qBP = window.f1 / (window.f2 > 0 ? window.f2 : 1.0); if (qBP < 0.1) qBP = 0.1;
        let cBP = 1.0 + (o / qBP) + o * o; window.b0 = (o / qBP) / cBP; window.b1 = 0.0; window.b2 = -window.b0; window.a1 = 2.0 * (o * o - 1.0) / cBP; window.a2 = (1.0 - (o / qBP) + o * o) / cBP;
    } else { window.b0 = 1; window.b1 = window.b2 = window.a1 = window.a2 = 0; }
};

window.applyFilter = function(x) { 
    if (window.currentFilterMode === 'RAW') return x;
    xv = xv; xv = xv; xv = x; 
    yv = yv; yv = yv;
    yv = (window.b0 * xv) + (window.b1 * xv) + (window.b2 * xv) - (window.a1 * yv) - (window.a2 * yv);
    if (isNaN(yv) || !isFinite(yv)) { yv=yv=yv=xv=xv=xv=0; } 
    return yv;
};
window.oscNode = null; window.oscNode2 = null; window.scriptNode = null;
window.audioCtx = null; window.gainNode = null;

window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode.disconnect(); window.oscNode = null; }
    if (window.oscNode2) { try { window.oscNode2.stop(); } catch(e){} window.oscNode2.disconnect(); window.oscNode2 = null; }
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
            let inputData = audioProcessingEvent.inputBuffer.getChannelData(0); 
            let outputData = audioProcessingEvent.outputBuffer.getChannelData(0);
            for (let sample = 0; sample < audioProcessingEvent.inputBuffer.length; sample++) {
                let step1 = 2.0 * Math.PI * (window.currentSinFreq / 44100), step2 = 2.0 * Math.PI * ((window.currentSinFreq * 0.4) / 44100);
                let rawVal = (Math.sin(window.simPhase) + Math.sin(window.simPhase2)) * 0.5;
                window.simPhase = (window.simPhase + step1) % (2 * Math.PI); window.simPhase2 = (window.simPhase2 + step2) % (2 * Math.PI);
                let fVal = window.applyFilter ? window.applyFilter(rawVal) : rawVal; outputData[sample] = fVal;
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
        window.fCtx.clearRect(0,0,800,400); window.fCtx.fillStyle='#111'; window.fCtx.fillRect(0,0,800,400); window.fCtx.strokeStyle='#333'; window.fCtx.beginPath(); for(let k=0;k<=4;k++){window.fCtx.moveTo(k*200,0);window.fCtx.lineTo(k*200,360);} window.fCtx.stroke(); window.fCtx.fillStyle='#fff'; let ticks = ["0.00 kHz","1.25 kHz","2.50 kHz","3.75 kHz","5.00 kHz"]; for(let k=0;k<=4;k++) window.fCtx.fillText(ticks[k], k*200+(k===0?15:k===4?-75:-25), 385);
        window.fCtx.strokeStyle='#22'; window.fCtx.beginPath(); dbSteps.forEach(db => { window.fCtx.moveTo(0,30+(db/-50)*310); window.fCtx.lineTo(800,30+(db/-50)*310); }); window.fCtx.stroke(); 
        document.getElementById('vppVal').innerText = "0.00 V"; document.getElementById('rmsVal').innerText = "0.00 V"; document.getElementById('freqVal').innerText = "0.0 Hz"; return;
    }
    if (window.filteredDataLog.length < 10) return;
    let rawSlice = window.filteredDataLog.slice(-Math.max(64, Math.min(window.filteredDataLog.length, Math.round((3*44100)/(window.currentSinFreq*0.4)*(44100/window.currentSampleRate)))));
    let absMaxPeak = Math.max(...rawSlice.map(Math.abs)), scaleY = 145 / (absMaxPeak < 0.1 ? 0.1 : absMaxPeak); if (scaleY > 165) scaleY = 165;
    let max = Math.max(...rawSlice), min = Math.min(...rawSlice), sq = 0; rawSlice.forEach(v => sq += v * v);
    document.getElementById('vppVal').innerText = (max - min).toFixed(2) + " V"; document.getElementById('rmsVal').innerText = Math.sqrt(sq / rawSlice.length).toFixed(2) + " V";
    
    let re = new Float32Array(window.FFT_SIZE), im = new Float32Array(window.FFT_SIZE); for (let k = 0; k < window.FFT_SIZE; k++) re[k] = window.analysisBuffer[(window.bufferIndex + k) % window.FFT_SIZE];
    localFFT(re, im); let magnitudes = new Float32Array(window.FFT_SIZE / 2), maxMag = 0;
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); if (m > 1 && magnitudes[m] > maxMag) { maxMag = magnitudes[m]; } }
    
    let hzPerBin = 44100 / window.FFT_SIZE, bFs = Math.round(window.currentSinFreq / hzPerBin), b04Fs = Math.round((window.currentSinFreq * 0.4) / hzPerBin);
    let magFs = Math.max(magnitudes[bFs-1]||0, magnitudes[bFs]||0, magnitudes[bFs+1]||0), mag04Fs = Math.max(magnitudes[b04Fs-1]||0, magnitudes[b04Fs]||0, magnitudes[b04Fs+1]||0);
    let currentFrameMaxMag = (window.currentFilterMode === 'RAW') ? Math.max(magFs, mag04Fs) : Math.max(...magnitudes); if (currentFrameMaxMag < 0.001) currentFrameMaxMag = 0.001;
    let finalViewFocusHz = (window.currentFilterMode === 'LP' && magFs < currentFrameMaxMag * 0.178 && mag04Fs > currentFrameMaxMag * 0.178) ? (window.currentSinFreq * 0.4) : window.currentSinFreq;
    document.getElementById('freqVal').innerText = maxMag > 0.04 ? ((mag04Fs > magFs ? window.currentSinFreq * 0.4 : window.currentSinFreq)).toFixed(1) + " Hz" : "0.0 Hz";
    // 渲染時域
    window.tCtx.clearRect(0, 0, 800, 400); window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, 800, 400); window.tCtx.strokeStyle = '#33 '; window.tCtx.lineWidth = 1; window.tCtx.beginPath(); voltSteps.forEach(v => { let yPos = midY - v * scaleY; window.tCtx.moveTo(0, yPos); window.tCtx.lineTo(800, yPos); }); window.tCtx.stroke();
    window.tCtx.fillStyle = '#ffffff'; window.tCtx.font = 'bold 12px Arial'; voltSteps.forEach(v => window.tCtx.fillText((v >= 0 ? "+" : "") + v.toFixed(1) + "V", 25, midY - v * scaleY + 4));
    window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath(); window.tCtx.moveTo(0, midY - (rawSlice * scaleY)); for (let j = 1; j < rawSlice.length; j++) { window.tCtx.lineTo(j * (800 / (rawSlice.length - 1)), midY - (rawSlice[j] * scaleY)); } window.tCtx.stroke();
    window.tCtx.fillStyle = '#00ff66'; window.tCtx.fillText("全幅時間: " + ((rawSlice.length / window.currentSampleRate) * 1000).toFixed(2) + " ms", 620, 380);

    // 渲染自適應頻域
    window.fCtx.clearRect(0, 0, 800, 400); window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, 800, 400); window.fCtx.strokeStyle = '#333'; window.fCtx.beginPath(); for (let k = 0; k <= 4; k++) window.fCtx.moveTo(k * 200, 0), window.fCtx.lineTo(k * 200, 360); window.fCtx.stroke();
    let maxDisplayFreq = Math.max(1200, Math.min(5000, finalViewFocusHz * 1.5)); window.fCtx.fillStyle = '#ffffff'; for (let k = 0; k <= 4; k++) window.fCtx.fillText((((maxDisplayFreq / 4) * k) / 1000).toFixed(2) + " kHz", k * 200 + (k === 0 ? 15 : k === 4 ? -75 : -25), 385);
    window.fCtx.strokeStyle = '#223'; window.fCtx.beginPath(); dbSteps.forEach(db => { window.fCtx.moveTo(0, 30 + ((db / -50) * 310)); window.fCtx.lineTo(800, 30 + ((db / -50) * 310)); }); window.fCtx.stroke(); window.fCtx.fillStyle = '#aaaaaa'; dbSteps.forEach(db => window.fCtx.fillText(db + " dB", 20, 34 + ((db / -50) * 310)));
    
    // 主動追蹤雙音局部最高點 Bin 下標
    let realFsPeakBin = bFs, real04FsPeakBin = b04Fs;
    if (window.currentFilterMode === 'RAW') {
        for (let o = -3; o <= 3; o++) {
            if ((magnitudes[bFs+o]||0) > (magnitudes[realFsPeakBin]||0)) realFsPeakBin = bFs + o;
            if ((magnitudes[b04Fs+o]||0) > (magnitudes[real04FsPeakBin]||0)) real04FsPeakBin = b04Fs + o;
        }
    }

    window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 2.5; window.fCtx.beginPath(); let isFirstPoint = true;
    for (let n = 0; n < magnitudes.length; n++) { 
        let currentPointRealHz = n * hzPerBin; if (currentPointRealHz > maxDisplayFreq) break; 
        let curX = (currentPointRealHz / maxDisplayFreq) * 800;
        if (curX > 800) curX = 800; if (curX < 0) curX = 0;

        let y = 30 + ((1.0 - (magnitudes[n] / currentFrameMaxMag)) * 310);
        
        // 🚀 🛠️ 鋼性物理對齊與畫筆物理半徑厚度鎖定：將峰值頂點硬鎖在 Y = 32.0 像素位置！
        if (window.currentFilterMode === 'RAW' && (n === realFsPeakBin || n === real04FsPeakBin)) { y = 32.0; }
        
        // 🚀 🛠️ 終極硬核攔截：將最嚴格的防溢位上邊界調整為 32.0！
        // 這樣扣除折線 2.5px 粗細的膨脹渲染後，黃色波峰的最頂端邊緣將會「100% 絕對齊平、完美貼死在 30px 的 0dB 線上」，連一個像素都絕對刺不出去！
        if (y < 32.0) y = 32.0; 
        if (y > 358) y = 358; 
        
        if (isFirstPoint) { window.fCtx.moveTo(curX, y); isFirstPoint = false; } else { window.fCtx.lineTo(curX, y); }
    } window.fCtx.stroke();
};

document.getElementById('simBtn')?.addEventListener('click', () => { window.isSimulating = !window.isSimulating; document.getElementById('simBtn').innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試"; window.initAudioGlobal(); });
document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return;
    if (e.target.id === 'speakerBtn') { window.isSpeakerOn = !window.isSpeakerOn; document.getElementById('speakerBtn').innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉"; if (window.gainNode) window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? window.currentVolume : 0.0, window.audioCtx.currentTime); }
    let fModes = { filterRaw: 'RAW', filterLP: 'LP', filterHP: 'HP', filterBP: 'BP' }[e.target.id];
    if (fModes) { document.querySelectorAll('.active').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); window.currentFilterMode = fModes; window.updateFilterCoefficients(); }
});
document.addEventListener('input', (e) => {
    if (!e.target || e.target.type !== 'range') return;
    let curVal = parseFloat(e.target.value), sliderId = e.target.id;
    if (sliderId === "sampleRateSlider") { window.currentSampleRate = parseInt(curVal); window.updateFilterCoefficients(); }
    if (sliderId === "sinFreqSlider") window.currentSinFreq = parseInt(curVal);
    if (sliderId === "f1Slider") { window.f1 = parseInt(curVal); window.updateFilterCoefficients(); }
    if (sliderId === "f2Slider") { window.f2 = parseInt(curVal); if (e.target.nextElementSibling) e.target.nextElementSibling.innerText = "Q: " + (0.1 + (curVal / 5000.0) * 9.9).toFixed(2); window.updateFilterCoefficients(); }
    if (sliderId === "volumeSlider") { window.currentVolume = curVal; if (e.target.nextElementSibling) e.target.nextElementSibling.innerText = Math.round(curVal * 100) + "%"; if (window.gainNode && window.isSpeakerOn) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime); }
    if (e.target.nextElementSibling && sliderId !== "f2Slider" && sliderId !== "volumeSlider") e.target.nextElementSibling.innerText = curVal + " Hz";
});
window.onload = function() { window.updateFilterCoefficients(); window.globalRenderLoop(); };
