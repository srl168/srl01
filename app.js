//1266
if (window.audioInterval) {
    clearInterval(window.audioInterval);
}
window.isWritingLock = false;

// ==========================================
// 💡 1️⃣ 全域記憶體大腦池初始化（4096點真儀表網格）
// ==========================================
window.currentSampleRate = 44100;
window.currentSinFreq = 1830;
window.filteredDataLog = [];
window.bufferIndex = 0;
window.nextPlayTime = 0;
window.isSpeakerOn = false;
window.isSimulating = false;
window.currentVolume = 0.3;
window.simPhase = 0;
window.simPhase2 = 0;
window.FFT_SIZE = 4096;
window.renderFrameCounter = 0;
window.analysisBuffer = new Float32Array(window.FFT_SIZE);

// 預設鎖定：即使按鈕按在其他地方，核心計算也由 F1, F2 的雙 BP 動態解調分離
window.currentFilterMode = 'RAW';
window.f1 = 1000;
window.f2 = 3000;

// 🔒 🚀 【左聲道：通道一 (0 ~ F1) 獨立八階巴特沃斯記憶體】
window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0;
window.xv = new Float32Array(3);  window.yv = new Float32Array(3);
window.xv2 = new Float32Array(3); window.yv2 = new Float32Array(3);
window.xv3 = new Float32Array(3); window.yv3 = new Float32Array(3);
window.xv4 = new Float32Array(3); window.yv4 = new Float32Array(3);

// 🔒 🚀 【右聲道：通道二 (F1 ~ F2) 獨立八階巴特沃斯記憶體】
window.b0R = 1; window.b1R = 0; window.b2R = 0; window.a1R = 0; window.a2R = 0;
window.xvR = new Float32Array(3);  window.yvR = new Float32Array(3);
window.xvR2 = new Float32Array(3); window.yvR2 = new Float32Array(3);
window.xvR3 = new Float32Array(3); window.yvR3 = new Float32Array(3);
window.xvR4 = new Float32Array(3); window.yvR4 = new Float32Array(3);

window.addEventListener('DOMContentLoaded', () => {
    window.tCanvas = document.getElementById('timeCanvas');
    window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d');
    window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800;
    window.tCanvas.height = 400;
    window.fCanvas.width = 800;
    window.fCanvas.height = 400;
});
// ==========================================
// 💡 2️⃣ 雙帶通（Dual-BP）濾波器獨立精密係數計算公式（徹底解耦）
// ==========================================
window.updateFilterCoefficients = function() {
    let fs = window.currentSampleRate;
    
    // 🔒 1. 左聲道獨立計算：通道一 (0 ~ F1 帶通濾波器)
    let f1_Low = 20;
    let f1_High = window.f1;
    if (f1_High <= f1_Low) f1_High = f1_Low + 10;
    
    let fr1_L = fs / f1_Low;   if (fr1_L < 2.01) fr1_L = 2.01;
    let fr1_H = fs / f1_High;  if (fr1_H < 2.01) fr1_H = 2.01;
    let o1_L = Math.tan(Math.PI / fr1_L);
    let o1_H = Math.tan(Math.PI / fr1_H);
    let W1 = o1_H - o1_L; if (W1 < 0.001) W1 = 0.001;
    let C1 = o1_L * o1_H;
    let cBP1 = 1.0 + W1 + C1;
    
    // 剛性鎖死給左耳專用變數
    window.b0 = W1 / cBP1;
    window.b1 = 0.0;
    window.b2 = -window.b0;
    window.a1 = 2.0 * (C1 - 1.0) / cBP1;
    window.a2 = (1.0 - W1 + C1) / cBP1;

    // 🔒 2. 右聲道獨立計算：通道二 (F1 ~ F2 帶通濾波器)
    let f2Correct = window.f2;
    if (f2Correct <= window.f1) {
        f2Correct = window.f1 + 10;
    }
    let fr2_L = fs / window.f1; if (fr2_L < 2.01) fr2_L = 2.01;
    let fr2_H = fs / f2Correct; if (fr2_H < 2.01) fr2_H = 2.01;
    let o2_L = Math.tan(Math.PI / fr2_L);
    let o2_H = Math.tan(Math.PI / fr2_H);
    let W2 = o2_H - o2_L; if (W2 < 0.001) W2 = 0.001;
    let C2 = o2_L * o2_H;
    let cBP2 = 1.0 + W2 + C2;
    
    // 🚀 🚨 剛性解耦！右耳專用獨立變數（b0R, a1R, a2R），毫無串軌！
    window.b0R = W2 / cBP2;
    window.b1R = 0.0;
    window.b2R = -window.b0R;
    window.a1R = 2.0 * (C2 - 1.0) / cBP2;
    window.a2R = (1.0 - W2 + C2) / cBP2;
    
    if (isNaN(window.b0) || !isFinite(window.b0)) {
        window.b0 = 1; window.b1 = window.b2 = window.a1 = window.a2 = 0;
    }
    if (isNaN(window.b0R) || !isFinite(window.b0R)) {
        window.b0R = 1; window.b1R = window.b2R = window.a1R = window.a2R = 0;
    }
};

// 🔒 🚀 【🚨 真．左耳 8 階巴特沃斯中括號下標原裝死鎖大歸位】🔒
window.applyFilterLeft = function(x) {
    if (window.currentFilterMode === 'RAW') return x;
    
    // 🛑 左通道 Stage 1
    window.xv[2] = window.xv[1]; 
    window.xv[1] = window.xv[0]; 
    window.xv[0] = x;
    window.yv[2] = window.yv[1]; 
    window.yv[1] = window.yv[0];
    window.yv[0] = (window.b0 * window.xv[0]) + (window.b1 * window.xv[1]) + (window.b2 * window.xv[2]) 
                      - (window.a1 * window.yv[1]) - (window.a2 * window.yv[2]);
    if (isNaN(window.yv[0]) || !isFinite(window.yv[0])) window.yv[0] = 0;
    
    // 🛑 左通道 Stage 2
    window.xv2[2] = window.xv2[1]; 
    window.xv2[1] = window.xv2[0]; 
    window.xv2[0] = window.yv[0];
    window.yv2[2] = window.yv2[1]; 
    window.yv2[1] = window.yv2[0];
    window.yv2[0] = (window.b0 * window.xv2[0]) + (window.b1 * window.xv2[1]) + (window.b2 * window.xv2[2]) 
                       - (window.a1 * window.yv2[1]) - (window.a2 * window.yv2[2]);
    if (isNaN(window.yv2[0]) || !isFinite(window.yv2[0])) window.yv2[0] = 0;
    
    // 🛑 左通道 Stage 3
    window.xv3[2] = window.xv3[1]; 
    window.xv3[1] = window.xv3[0]; 
    window.xv3[0] = window.yv2[0];
    window.yv3[2] = window.yv3[1]; 
    window.yv3[1] = window.yv3[0];
    window.yv3[0] = (window.b0 * window.xv3[0]) + (window.b1 * window.xv3[1]) + (window.b2 * window.xv3[2]) 
                       - (window.a1 * window.yv3[1]) - (window.a2 * window.yv3[2]);
    if (isNaN(window.yv3[0]) || !isFinite(window.yv3[0])) window.yv3[0] = 0;
    
    // 🛑 左通道 Stage 4（8階 0~F1 帶通收官）
    window.xv4[2] = window.xv4[1]; 
    window.xv4[1] = window.xv4[0]; 
    window.xv4[0] = window.yv3[0];
    window.yv4[2] = window.yv4[1]; 
    window.yv4[1] = window.yv4[0];
    window.yv4[0] = (window.b0 * window.xv4[0]) + (window.b1 * window.xv4[1]) + (window.b2 * window.xv4[2]) 
                       - (window.a1 * window.yv4[1]) - (window.a2 * window.yv4[2]);
    
    if (isNaN(window.yv4[0]) || !isFinite(window.yv4[0])) {
        window.yv4[0] = window.yv4[1] = window.yv4[2] = window.xv4[0] = window.xv4[1] = window.xv4[2] = 0;
        window.yv3[0] = window.yv3[1] = window.yv3[2] = window.xv3[0] = window.xv3[1] = window.xv3[2] = 0;
        window.yv2[0] = window.yv2[1] = window.yv2[2] = window.xv2[0] = window.xv2[1] = window.xv2[2] = 0;
        window.yv[0]  = window.yv[1]  = window.yv[2]  = window.xv[0]  = window.xv[1]  = window.xv[2]  = 0;
    }
    return window.yv4[0];
};

// 🔒 🚀 【🚨 真．右耳 8 階巴特沃斯中括號下標原裝死鎖大歸位】🔒
window.applyFilterRight = function(x) {
    if (window.currentFilterMode === 'RAW') return x;
    
    // 🛑 右通道 Stage 1
    window.xvR[2] = window.xvR[1]; 
    window.xvR[1] = window.xvR[0]; 
    window.xvR[0] = x;
    window.yvR[2] = window.yvR[1]; 
    window.yvR[1] = window.yvR[0];
    window.yvR[0] = (window.b0R * window.xvR[0]) + (window.b1R * window.xvR[1]) + (window.b2R * window.xvR[2]) 
                       - (window.a1R * window.yvR[1]) - (window.a2R * window.yvR[2]);
    if (isNaN(window.yvR[0]) || !isFinite(window.yvR[0])) window.yvR[0] = 0;
    
    // 🛑 右通道 Stage 2
    window.xvR2[2] = window.xvR2[1]; 
    window.xvR2[1] = window.xvR2[0]; 
    window.xvR2[0] = window.yvR[0];
    window.yvR2[2] = window.yvR2[1]; 
    window.yvR2[1] = window.yvR2[0];
    window.yvR2[0] = (window.b0R * window.xvR2[0]) + (window.b1R * window.xvR2[1]) + (window.b2R * window.xvR2[2]) 
                        - (window.a1R * window.yvR2[1]) - (window.a2R * window.yvR2[2]);
    if (isNaN(window.yvR2[0]) || !isFinite(window.yvR2[0])) window.yvR2[0] = 0;
    
    // 🛑 右通道 Stage 3
    window.xvR3[2] = window.xvR3[1]; 
    window.xvR3[1] = window.xvR3[0]; 
    window.xvR3[0] = window.yvR2[0];
    window.yvR3[2] = window.yvR3[1]; 
    window.yvR3[1] = window.yvR3[0];
    window.yvR3[0] = (window.b0R * window.xvR3[0]) + (window.b1R * window.xvR3[1]) + (window.b2R * window.xvR3[2]) 
                        - (window.a1R * window.yvR3[1]) - (window.a2R * window.yvR3[2]);
    if (isNaN(window.yvR3[0]) || !isFinite(window.yvR3[0])) window.yvR3[0] = 0;
    
    // 🛑 右通道 Stage 4（8階 F1~F2 帶通收官）
    window.xvR4[2] = window.xvR4[1]; 
    window.xvR4[1] = window.xvR4[0]; 
    window.xvR4[0] = window.yvR3[0];
    window.yvR4[2] = window.yvR4[1]; 
    window.yvR4[1] = window.yvR4[0];
    window.yvR4[0] = (window.b0R * window.xvR4[0]) + (window.b1R * window.xvR4[1]) + (window.b2R * window.xvR4[2]) 
                        - (window.a1R * window.yvR4[1]) - (window.a2R * window.yvR4[2]);
    
    if (isNaN(window.yvR4[0]) || !isFinite(window.yvR4[0])) {
        window.yvR4[0] = window.yvR4[1] = window.yvR4[2] = window.xvR4[0] = window.xvR4[1] = window.xvR4[2] = 0;
        window.yvR3[0] = window.yvR3[1] = window.yvR3[2] = window.xvR3[0] = window.xvR3[1] = window.xvR3[2] = 0;
        window.yvR2[0] = window.yvR2[1] = window.yvR2[2] = window.xvR2[0] = window.xvR2[1] = window.xvR2[2] = 0;
        window.yvR[0]  = window.yvR[1]  = window.yvR[2]  = window.xvR[0]  = window.xvR[1]  = window.xvR[2]  = 0;
    }
    return window.yvR4[0];
};

// ==========================================
// 💡 3️⃣ 數位立體聲空間音訊流管道（2通道直通水管）
// ==========================================
window.oscNode = null; window.oscNode2 = null; window.scriptNode = null;
window.audioCtx = null; window.gainNode = null;

window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode = null; }
    if (window.oscNode2) { try { window.oscNode2.stop(); } catch(e){} window.oscNode2 = null; }
    if (window.scriptNode) window.scriptNode.disconnect();
    
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain();
        window.gainNode.connect(window.audioCtx.destination);
    }
    window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? window.currentVolume : 0.0, window.audioCtx.currentTime);
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();

    if (window.isSimulating) {
        window.updateFilterCoefficients();
        window.oscNode = window.audioCtx.createOscillator(); 
        window.oscNode2 = window.audioCtx.createOscillator();
        window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime); 
        window.oscNode2.frequency.setValueAtTime(window.currentSinFreq * 0.4, window.audioCtx.currentTime);
        
        window.scriptNode = window.audioCtx.createScriptProcessor(4096, 1, 2);
        window.scriptNode.onaudioprocess = function(audioProcessingEvent) {
            let leftOutput = audioProcessingEvent.outputBuffer.getChannelData(0);  
            let rightOutput = audioProcessingEvent.outputBuffer.getChannelData(1); 
            let bufLength = audioProcessingEvent.inputBuffer.length;
            
            for (let sample = 0; sample < bufLength; sample++) {
                let step1 = 2.0 * Math.PI * (window.currentSinFreq / window.currentSampleRate);
                let step2 = 2.0 * Math.PI * ((window.currentSinFreq * 0.4) / window.currentSampleRate);
                
                let rawVal = (Math.sin(window.simPhase) + Math.sin(window.simPhase2)) * 0.5;
                window.simPhase = (window.simPhase + step1) % (2 * Math.PI); 
                window.simPhase2 = (window.simPhase2 + step2) % (2 * Math.PI);
                
                let leftVal = window.applyFilterLeft ? window.applyFilterLeft(rawVal) : rawVal;
                let rightVal = window.applyFilterRight ? window.applyFilterRight(rawVal) : rawVal;
                
                // 🚀 🔒 【按鈕動態發聲分流與單邊 Solo 監聽控制】
                let leftOutVal = leftVal;
                let rightOutVal = rightVal;
                
                if (window.currentFilterMode === 'LP') {
                    rightOutVal = 0.0; // 👈 點擊 LP 時：右耳強制完全靜音，左耳獨奏 (Solo) 0~F1 低頻波！
                } 
				else if (window.currentFilterMode === 'HP') {
                    leftOutVal = 0.0;  // 👈 點擊 HP 時：左耳強制完全靜音，右耳獨奏 (Solo) F1~F2 主音針尖！
} 
else if (window.currentFilterMode === 'BP') {
// 👈 點擊 BP 時：保持左右一起放音，左耳放低頻，右耳放高頻！
leftOutVal = leftVal;
rightOutVal = rightVal;}
 
else if (window.currentFilterMode === 'RAW') {
leftOutVal = rawVal;
rightOutVal = rawVal;}

leftOutput[sample] = leftOutVal;
rightOutput[sample] = rightOutVal;
let plotVal = leftVal;

if (window.currentFilterMode === 'HP' || window.currentFilterMode === 'BP') {
plotVal = rightVal;} 
else if (window.currentFilterMode === 'RAW') {plotVal = rawVal;}

window.filteredDataLog.push(plotVal);
window.analysisBuffer[window.bufferIndex] = plotVal;window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;}

if (window.filteredDataLog.length > 10000) {
window.filteredDataLog = window.filteredDataLog.slice(-8000);}};
window.oscNode.connect(window.scriptNode);
window.oscNode2.connect(window.scriptNode);
window.scriptNode.connect(window.gainNode);
window.oscNode.start();
window.oscNode2.start();
}};
window.consumeRawBuffer = function(rawDataView) {let byteLen = rawDataView.byteLength;for (let i = 0; i < byteLen; i++) {let rawVal = (rawDataView.getUint8(i) / 127.5) - 1.0;let leftVal = window.applyFilterLeft(rawVal);let rightVal = window.applyFilterRight(rawVal);let plotVal = leftVal;if (window.currentFilterMode === 'HP' || window.currentFilterMode === 'BP') {plotVal = rightVal;} else if (window.currentFilterMode === 'RAW') {plotVal = rawVal;}window.filteredDataLog.push(plotVal);if (window.filteredDataLog.length > 10000) window.filteredDataLog.shift();window.analysisBuffer[window.bufferIndex] = plotVal;window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;}};


// ==========================================
// 💡 4️⃣ 快速傅立葉變換與真對數分貝標尺（dB LOG）渲染大腦
// ==========================================
function localFFT(re, im) {
    const n = re.length; 
    let bits = 0; 
    while ((1 << bits) < n) bits++;
    
    for (let i = 0; i < n; i++) {
        let rev = 0; 
        for (let j = 0; j < bits; j++) { 
            if ((i & (1 << j)) !== 0) rev |= (1 << (bits - 1 - j)); 
        }
        if (rev > i) { 
            let tr = re[i]; re[i] = re[rev]; re[rev] = tr; 
            let ti = im[i]; im[i] = im[rev]; im[rev] = ti; 
        }
    }
    
    for (let len = 2; len <= n; len <<= 1) {
        let ang = 2 * Math.PI / len * -1;
        let wlen_r = Math.cos(ang);
        let wlen_i = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let w_r = 1, w_i = 0;
            for (let j = 0; j < len / 2; j++) {
                let u_r = re[i + j];
                let u_i = im[i + j];
                let v_r = re[i + j + len / 2] * w_r - im[i + j + len / 2] * w_i;
                let v_i = re[i + j + len / 2] * w_i + im[i + j + len / 2] * w_r;
                re[i + j] = u_r + v_r; 
                im[i + j] = u_i + v_i; 
                re[i + j + len / 2] = u_r - v_r; 
                im[i + j + len / 2] = u_i - v_i;
                let next_w_r = w_r * wlen_r - w_i * wlen_i; 
                w_i = w_r * wlen_i + w_i * wlen_r; 
                w_r = next_w_r;
            }
        }
    }
}

window.globalRenderLoop = function() {
    requestAnimationFrame(window.globalRenderLoop); 
    window.renderFrameCounter++; 
    if (window.renderFrameCounter % 2 !== 0) return;
    
    let voltSteps = [1.0, 0.5, 0.0, -0.5, -1.0];
    let dbSteps = [0, -12, -30, -50];
    let midY = 200;

    if (!window.isSimulating && window.filteredDataLog.length === 0) {
        window.tCtx.clearRect(0, 0, 800, 400); 
        window.tCtx.fillStyle = '#111'; 
        window.tCtx.fillRect(0, 0, 800, 400); 
        window.tCtx.strokeStyle = '#333'; 
        window.tCtx.beginPath(); 
        voltSteps.forEach(v => { 
            window.tCtx.moveTo(0, midY - v * 145); 
            window.tCtx.lineTo(800, midY - v * 145); 
        }); 
        window.tCtx.stroke();
        
        window.tCtx.fillStyle = '#fff'; 
        window.tCtx.font = 'bold 12px Arial'; 
        window.tCtx.fillText("+1.0V", 25, 55); 
        window.tCtx.fillText("0.0V", 25, 204); 
        window.tCtx.fillText("-1.0V", 25, 345);
        
        window.fCanvas.getContext('2d').clearRect(0, 0, 800, 400); 
        window.fCtx.fillStyle = '#111'; 
        window.fCtx.fillRect(0, 0, 800, 400); 
        window.fCtx.strokeStyle = '#333'; 
        window.fCtx.beginPath(); 
        for (let k = 0; k <= 4; k++) {
            window.fCtx.moveTo(k * 200, 0);
            window.fCtx.lineTo(k * 200, 360);
        } 
        window.fCtx.stroke(); 
        
        window.fCtx.fillStyle = '#fff'; 
        let ticks = ["0.00 kHz", "1.25 kHz", "2.50 kHz", "3.75 kHz", "5.00 kHz"]; 
        for (let k = 0; k <= 4; k++) {
            window.fCtx.fillText(ticks[k], k * 200 + (k === 0 ? 15 : k === 4 ? -75 : -25), 385);
        }
        
        window.fCtx.strokeStyle = '#555555'; 
        window.fCtx.beginPath(); 
        dbSteps.forEach(db => { 
            window.fCtx.moveTo(0, 30 + (db / -50) * 310); 
            window.fCtx.lineTo(800, 30 + (db / -50) * 310); 
        }); 
        window.fCtx.stroke(); 
        
        window.fCtx.fillStyle = '#ffffff'; 
        window.fCtx.font = 'bold 11px Arial'; 
        dbSteps.forEach(db => window.fCtx.fillText(db + " dB", 20, 34 + (db / -50) * 310));
        
        document.getElementById('vppVal').innerText = "0.00 V"; 
        document.getElementById('rmsVal').innerText = "0.00 V"; 
        document.getElementById('freqVal').innerText = "0.0 Hz"; 
        return;
    }
    
    if (window.filteredDataLog.length < 10) return;
    let rawSlice = window.filteredDataLog.slice(-Math.max(64, Math.min(window.filteredDataLog.length, Math.round((3 * window.currentSampleRate) / (window.currentSinFreq * 0.4)))));
    let scaleY = 145.0; 
    let max = Math.max(...rawSlice);
    let min = Math.min(...rawSlice);
    let sq = 0; 
    rawSlice.forEach(v => sq += v * v);
    document.getElementById('vppVal').innerText = (max - min).toFixed(2) + " V"; 
    document.getElementById('rmsVal').innerText = Math.sqrt(sq / rawSlice.length).toFixed(2) + " V";
    
    let re = new Float32Array(window.FFT_SIZE);
    let im = new Float32Array(window.FFT_SIZE);
    for (let k = 0; k < window.FFT_SIZE; k++) {
        re[k] = window.analysisBuffer[(window.bufferIndex + k) % window.FFT_SIZE];
    }
    localFFT(re, im); 
    
    let magnitudes = new Float32Array(window.FFT_SIZE / 2);
    let maxMag = 0;
    let peakBinIndex = 0; // 🚀 🔒 換裝正宗全局最高點 Peak 追蹤索引
    
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { 
        magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); 
        if (m > 2) { // 跳過極低頻 DC 雜訊干擾
            if (magnitudes[m] > maxMag) {
                maxMag = magnitudes[m];
                peakBinIndex = m; // 🔒 實時咬定全局最強能量的網格點
            }
        }
    }
    
    let hzPerBin = window.currentSampleRate / window.FFT_SIZE; 
    let maxDisplayFreq = window.currentSinFreq * 1.5;
    let htmlMaxFreq = parseFloat(document.getElementById('sinFreqSlider')?.max) || 5000;
    if (maxDisplayFreq < 200) maxDisplayFreq = 200; 
    if (maxDisplayFreq > htmlMaxFreq) maxDisplayFreq = htmlMaxFreq;
    
    let currentFrameMaxMag = maxMag; 
    if (currentFrameMaxMag < 0.001) currentFrameMaxMag = 0.001;
    
    // 🚀 🔒 【徹底砸爛下標熔斷 Bug】文字頻率直接利用 PeakBin 進行物理換算，決不熔斷！
    let livePeakHz = peakBinIndex * hzPerBin;
    document.getElementById('freqVal').innerText = maxMag > 0.015 ? livePeakHz.toFixed(1) + " Hz" : "0.0 Hz";

    window.tCtx.clearRect(0, 0, 800, 400); 
    window.tCtx.fillStyle = '#111'; 
    window.tCtx.fillRect(0, 0, 800, 400); 
    window.tCtx.strokeStyle = '#333'; 
    window.tCtx.lineWidth = 1; 
    window.tCtx.beginPath(); 
    voltSteps.forEach(v => { 
        let yPos = midY - v * scaleY; 
        window.tCtx.moveTo(0, yPos); 
        window.tCtx.lineTo(800, yPos); 
    }); 
    window.tCtx.stroke();
    
    window.tCtx.fillStyle = '#ffffff'; 
    window.tCtx.font = 'bold 12px Arial'; 
    voltSteps.forEach(v => window.tCtx.fillText((v >= 0 ? "+" : "") + v.toFixed(1) + "V", 25, midY - v * scaleY + 4));
    
    window.tCtx.strokeStyle = '#00ff66'; 
    window.tCtx.lineWidth = 2.5; 
    window.tCtx.beginPath(); 
    window.tCtx.moveTo(0, midY - (rawSlice * scaleY)); 
    for (let j = 1; j < rawSlice.length; j++) { 
        window.tCtx.lineTo(j * (800 / (rawSlice.length - 1)), midY - (rawSlice[j] * scaleY)); 
    } 
    window.tCtx.stroke();
    
    window.tCtx.fillStyle = '#00ff66'; 
    window.tCtx.fillText("全幅時間: " + ((rawSlice.length / window.currentSampleRate) * 1000).toFixed(2) + " ms", 620, 380);

    window.fCtx.clearRect(0, 0, 800, 400); 
    window.fCtx.fillStyle = '#111'; 
    window.fCtx.fillRect(0, 0, 800, 400); 
    window.fCtx.strokeStyle = '#333'; 
    window.fCtx.beginPath(); 
    for (let k = 0; k <= 4; k++) window.fCtx.moveTo(k * 200, 0), window.fCtx.lineTo(k * 200, 360); 
    window.fCtx.stroke();
    
    window.fCtx.fillStyle = '#ffffff'; 
    for (let k = 0; k <= 4; k++) {
        window.fCtx.fillText((((maxDisplayFreq / 4) * k) / 1000).toFixed(2) + " kHz", k * 200 + (k === 0 ? 15 : k === 4 ? -75 : -25), 385);
    }
    
    window.fCtx.strokeStyle = '#555555'; 
    window.fCtx.lineWidth = 1; 
    window.fCtx.beginPath(); 
    dbSteps.forEach(db => { 
        window.fCtx.moveTo(0, 30 + ((db / -50) * 310)); 
        window.fCtx.lineTo(800, 30 + ((db / -50) * 310)); 
    }); 
    window.fCtx.stroke(); 
    
    window.fCtx.fillStyle = '#ffffff'; 
    window.fCtx.font = 'bold 11px Arial'; 
    dbSteps.forEach(db => window.fCtx.fillText(db + " dB", 20, 34 + ((db / -50) * 310)));
    
    window.fCtx.strokeStyle = '#ffad00'; 
    window.fCtx.lineWidth = 2.5; 
    window.fCtx.beginPath(); 
    let isFirstPoint = true;
    for (let n = 0; n < magnitudes.length; n++) { 
        let currentPointRealHz = n * hzPerBin; 
        if (currentPointRealHz > maxDisplayFreq) break; 
        let curX = (currentPointRealHz / maxDisplayFreq) * 800;
        
        let ratio = magnitudes[n] / currentFrameMaxMag; 
        if (ratio < 0.00001) ratio = 0.00001;
        let dbValue = 20.0 * Math.log10(ratio);
        if (dbValue < -50.0) dbValue = -50.0;
        let y = 30 + ((dbValue / -50.0) * 310);
        
        if (isNaN(y) || !isFinite(y)) y = 358.0; 
        if (y < 32.0) y = 32.0; 
        if (y > 358) y = 358; 
        
        if (isFirstPoint) { 
            window.fCtx.moveTo(curX, y); 
            isFirstPoint = false; 
        } else { 
            window.fCtx.lineTo(curX, y); 
        }
    } 
    window.fCtx.stroke();
};

// ==========================================
// 💡 5️⃣ !important 最高優先級控制框外觀事件引擎
// ==========================================
window.renderFilterButtonLights = function() {
    const btnIds = { RAW: 'filterRaw', LP: 'filterLP', HP: 'filterHP', BP: 'filterBP' };
    Object.keys(btnIds).forEach(mode => {
        let btnEl = document.getElementById(btnIds[mode]); 
        if (!btnEl) return;
        
        btnEl.style.setProperty('border', '2px solid #555555', 'important');
        btnEl.style.setProperty('border-radius', '6px', 'important');
        btnEl.style.setProperty('padding', '8px 16px', 'important');
        btnEl.style.setProperty('cursor', 'pointer', 'important');
        
        if (window.currentFilterMode === mode) {
            btnEl.style.setProperty('background-color', '#00ff66', 'important');
            btnEl.style.setProperty('color', '#111111', 'important');
btnEl.style.setProperty('border-color', '#00ff66', 'important');btnEl.style.setProperty('font-weight', 'bold', 'important');btnEl.classList.add('active');} else {btnEl.style.setProperty('background-color', '#3a3a3a', 'important');btnEl.style.setProperty('color', '#eeeeee', 'important');btnEl.style.setProperty('border-color', '#555555', 'important');btnEl.style.setProperty('font-weight', 'normal', 'important');btnEl.classList.remove('active');}});};document.getElementById('simBtn')?.addEventListener('click', () => {window.isSimulating = !window.isSimulating;document.getElementById('simBtn').innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試";window.initAudioGlobal();});document.addEventListener('click', (e) => {if (!e.target || !e.target.id) return;let clickId = e.target.id;if (clickId === 'speakerBtn') {window.isSpeakerOn = !window.isSpeakerOn;document.getElementById('speakerBtn').innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉";if (window.gainNode) window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? window.currentVolume : 0.0, window.audioCtx.currentTime);}const fModes = { filterRaw: 'RAW', filterLP: 'LP', filterHP: 'HP', filterBP: 'BP' };if (fModes[clickId]) {window.currentFilterMode = fModes[clickId];const f2View = document.getElementById('f2Container');if (f2View) f2View.style.display = (clickId === 'filterBP') ? 'flex' : 'none';window.updateFilterCoefficients();window.renderFilterButtonLights();}});document.addEventListener('input', (e) => {if (!e.target || !e.target.id || e.target.type !== 'range') return;let curVal = parseFloat(e.target.value);let sliderId = e.target.id;if (sliderId === "sampleRateSlider") {window.currentSampleRate = parseInt(curVal);window.updateFilterCoefficients();}if (sliderId === "sinFreqSlider") window.currentSinFreq = parseInt(curVal);if (sliderId === "f1Slider") {window.f1 = parseInt(curVal);window.updateFilterCoefficients();}if (sliderId === "f2Slider") {window.f2 = parseInt(curVal);if (e.target.nextElementSibling) e.target.nextElementSibling.innerText = window.f2 + " Hz";window.updateFilterCoefficients();}if (sliderId === "volumeSlider") {window.currentVolume = curVal;if (e.target.nextElementSibling) e.target.nextElementSibling.innerText = Math.round(curVal * 100) + "%";if (window.gainNode && window.isSpeakerOn) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime);}if (e.target.nextElementSibling && sliderId !== "f2Slider" && sliderId !== "volumeSlider") {e.target.nextElementSibling.innerText = curVal + " Hz";}});window.onload = function() {window.updateFilterCoefficients();window.renderFilterButtonLights();window.globalRenderLoop();};
