//1274
if (window.audioInterval) {
    clearInterval(window.audioInterval);
}
window.isWritingLock = false;

// ==========================================
// 💡 1️⃣ 全域記憶體大腦池初始化（個別模式引數記憶池完全鎖死 🔒）
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

window.currentFilterMode = 'RAW';

// 🚀 🔒 【個別模式引數記憶池：調適極度方便，各就各位絕不干擾】
// LP 專屬獨立記憶引數池
window.f1_LP = 1000;
window.f2_LP = 3000;

// HP 專屬獨立記憶引數池
window.f1_HP = 1200;
window.f2_HP = 3500;

// BP 專屬獨立記憶引數池
window.f1_BP = 800;
window.f2_BP = 2500;

// 🔒 🚀 【左聲道八階巴特沃斯狀態暫存器陣列死鎖】
window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0;
window.xv = new Float32Array(3);  window.yv = new Float32Array(3);
window.xv2 = new Float32Array(3); window.yv2 = new Float32Array(3);
window.xv3 = new Float32Array(3); window.yv3 = new Float32Array(3);
window.xv4 = new Float32Array(3); window.yv4 = new Float32Array(3);

// 🔒 🚀 【右聲道八階巴特沃斯狀態暫存器陣列死鎖】
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
// 💡 2️⃣ 各自 F1, F2 精密係數計算公式（個別模式引數記憶池完全解耦）
// ==========================================
window.updateFilterCoefficients = function() {
    let fs = window.currentSampleRate;
    
    // 🔒 1. [LP 模式]：左耳讀取各別模式引數 f1_LP 做真八階低通，確保通帶內 0 衰減保真
    if (window.currentFilterMode === 'LP') {
        let frLeft = fs / window.f1_LP;
        if (frLeft < 2.01) frLeft = 2.01;
        let oL = Math.tan(Math.PI / frLeft);
        let qValL = 0.70710678; // 最大平坦剛性 Q 值
        let cL = 1.0 + (oL / qValL) + (oL * oL);
        
        window.b0 = (oL * oL) / cL;
        window.b1 = 2.0 * window.b0;
        window.b2 = window.b0;
        window.a1 = 2.0 * (oL * oL - 1.0) / cL;
        window.a2 = (1.0 - (oL / qValL) + (oL * oL)) / cL;
        
        // 右耳完全靜音，係數歸零
        window.b0R = window.b1R = window.b2R = window.a1R = window.a2R = 0;
    }
    // 🔒 2. [HP 模式]：右耳讀取各別模式引數 f1_HP, f2_HP 做高頻帶通精密框鎖
    else if (window.currentFilterMode === 'HP') {
        window.b0 = window.b1 = window.b2 = window.a1 = window.a2 = 0;
        
        let f2Correct = window.f2_HP;
        if (f2Correct <= window.f1_HP) f2Correct = window.f1_HP + 10;
        let fr2_L = fs / window.f1_HP; if (fr2_L < 2.01) fr2_L = 2.01;
        let fr2_H = fs / f2Correct;    if (fr2_H < 2.01) fr2_H = 2.01;
        let o2_L = Math.tan(Math.PI / fr2_L);
        let o2_H = Math.tan(Math.PI / fr2_H);
        let W2 = o2_H - o2_L; if (W2 < 0.001) W2 = 0.001;
        let C2 = o2_L * o2_H;
        let cBP2 = 1.0 + W2 + C2;
        
        window.b0R = W2 / cBP2;
        window.b1R = 0.0;
        window.b2R = -window.b0R;
        window.a1R = 2.0 * (C2 - 1.0) / cBP2;
        window.a2R = (1.0 - W2 + C2) / cBP2;
    }
    // 🔒 3. [BP 模式]：雙耳平行解調，左耳讀取 f1_BP 低通，右耳讀取 f1_BP~f2_BP 帶通
    else if (window.currentFilterMode === 'BP') {
        // 左耳
        let frLeft = fs / window.f1_BP;
        if (frLeft < 2.01) frLeft = 2.01;
        let oL = Math.tan(Math.PI / frLeft);
        let qValL = 0.70710678;
        let cL = 1.0 + (oL / qValL) + (oL * oL);
        window.b0 = (oL * oL) / cL;
        window.b1 = 2.0 * window.b0;
        window.b2 = window.b0;
        window.a1 = 2.0 * (oL * oL - 1.0) / cL;
        window.a2 = (1.0 - (oL / qValL) + (oL * oL)) / cL;
        
        // 右耳
        let f2Correct = window.f2_BP;
        if (f2Correct <= window.f1_BP) f2Correct = window.f1_BP + 10;
        let fr2_L = fs / window.f1_BP; if (fr2_L < 2.01) fr2_L = 2.01;
        let fr2_H = fs / f2Correct;    if (fr2_H < 2.01) fr2_H = 2.01;
        let o2_L = Math.tan(Math.PI / fr2_L);
        let o2_H = Math.tan(Math.PI / fr2_H);
        let W2 = o2_H - o2_L; if (W2 < 0.001) W2 = 0.001;
        let C2 = o2_L * o2_H;
        let cBP2 = 1.0 + W2 + C2;
        window.b0R = W2 / cBP2;
        window.b1R = 0.0;
        window.b2R = -window.b0R;
        window.a1R = 2.0 * (C2 - 1.0) / cBP2;
        window.a2R = (1.0 - W2 + C2) / cBP2;
    }
    else {
        window.b0 = 1; window.b1 = window.b2 = window.a1 = window.a2 = 0;
        window.b0R = 1; window.b1R = window.b2R = window.a1R = window.a2R = 0;
    }
    
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
    
    // 🛑 左通道 Stage 4（8階低通收官）
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
    
    // 🛑 右通道 Stage 4（8階帶通收官）
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
// 💡 3️⃣ 數位立體聲空間音訊流管道（2通道直通水管，強控立體聲不串軌）
// ==========================================
window.oscNode = null; 
window.oscNode2 = null; 
window.scriptNode = null;
window.audioCtx = null; 
window.gainNode = null;

window.initAudioGlobal = function() {
    if (window.oscNode) { 
        try { window.oscNode.stop(); } catch(e){} 
        window.oscNode = null; 
    }
    if (window.oscNode2) { 
        try { window.oscNode2.stop(); } catch(e){} 
        window.oscNode2 = null; 
    }
    if (window.scriptNode) {
        window.scriptNode.disconnect();
    }
    
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain(); 
        
        // 🚀 🔒 【硬體聲道死鎖】強制 GainNode 通道為 explicit 雙聲道，徹底切斷 Up-mixing 自動混音黑洞！ [INDEX]
        window.gainNode.channelCount = 2;
        window.gainNode.channelCountMode = "explicit";
        window.gainNode.channelInterpretation = "speakers";
        
        window.gainNode.connect(window.audioCtx.destination);
    }
    window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? window.currentVolume : 0.0, window.audioCtx.currentTime);
    if (window.audioCtx.state === 'suspended') {
        window.audioCtx.resume();
    }

    if (window.isSimulating) {
        window.updateFilterCoefficients();
        window.oscNode = window.audioCtx.createOscillator(); 
        window.oscNode2 = window.audioCtx.createOscillator();
        window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime); 
        window.oscNode2.frequency.setValueAtTime(window.currentSinFreq * 0.4, window.audioCtx.currentTime);
        
        window.scriptNode = window.audioCtx.createScriptProcessor(4096, 1, 2);
        window.scriptNode.onaudioprocess = function(audioProcessingEvent) {
            let leftOutput = audioProcessingEvent.outputBuffer.getChannelData(0);  // 左聲道
            let rightOutput = audioProcessingEvent.outputBuffer.getChannelData(1); // 右聲道
            let bufLength = audioProcessingEvent.inputBuffer.length;
            
            for (let sample = 0; sample < bufLength; sample++) {
                let step1 = 2.0 * Math.PI * (window.currentSinFreq / window.currentSampleRate);
                let step2 = 2.0 * Math.PI * ((window.currentSinFreq * 0.4) / window.currentSampleRate);
                
                let rawVal = (Math.sin(window.simPhase) + Math.sin(window.simPhase2)) * 0.5;
                window.simPhase = (window.simPhase + step1) % (2 * Math.PI); 
                window.simPhase2 = (window.simPhase2 + step2) % (2 * Math.PI);
                
                let leftVal = window.applyFilterLeft ? window.applyFilterLeft(rawVal) : rawVal;
                let rightVal = window.applyFilterRight ? window.applyFilterRight(rawVal) : rawVal;
                
                // 🚀 🔒 【高保真物理分流靜音控制】
                let leftOutVal = leftVal;
                let rightOutVal = rightVal;
                
                if (window.currentFilterMode === 'LP') {
                    rightOutVal = 0.0; // LP 狀態下：右耳強制完全斷電靜音 🔇 [INDEX]
                } else if (window.currentFilterMode === 'HP') {
                    leftOutVal = 0.0;  // HP 狀態下：左耳強制完全靜音 🔇 [INDEX]
                } else if (window.currentFilterMode === 'BP') {
                    leftOutVal = leftVal;
                    rightOutVal = rightVal; // BP 狀態下：左右各就各位同時放音 [INDEX]
                } else if (window.currentFilterMode === 'RAW') {
                    leftOutVal = rawVal;
                    rightOutVal = rawVal;
                }
                
                leftOutput[sample] = leftOutVal;   
                rightOutput[sample] = rightOutVal; 
                
                // 圖表大腦監聽抽取點
                let plotVal = leftVal;
                if (window.currentFilterMode === 'HP' || window.currentFilterMode === 'BP') {
                    plotVal = rightVal; 
                } else if (window.currentFilterMode === 'RAW') {
                    plotVal = rawVal;   
                }
                
                window.filteredDataLog.push(plotVal); 
                window.analysisBuffer[window.bufferIndex] = plotVal; 
                window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
            }
            if (window.filteredDataLog.length > 10000) {
                window.filteredDataLog = window.filteredDataLog.slice(-8000);
            }
        };
        window.oscNode.connect(window.scriptNode); 
        window.oscNode2.connect(window.scriptNode); 
        window.scriptNode.connect(window.gainNode); 
        window.oscNode.start(); 
        window.oscNode2.start();
    }
};

window.consumeRawBuffer = function(rawDataView) {
    let byteLen = rawDataView.byteLength;
    for (let i = 0; i < byteLen; i++) {
        let rawVal = (rawDataView.getUint8(i) / 127.5) - 1.0;
        let leftVal = window.applyFilterLeft(rawVal);
        let rightVal = window.applyFilterRight(rawVal);
        
        let plotVal = leftVal;
        if (window.currentFilterMode === 'HP' || window.currentFilterMode === 'BP') {
            plotVal = rightVal;
        } else if (window.currentFilterMode === 'RAW') {
            plotVal = rawVal;
        }
        
        window.filteredDataLog.push(plotVal);
        if (window.filteredDataLog.length > 10000) window.filteredDataLog.shift(); 
        window.analysisBuffer[window.bufferIndex] = plotVal; 
        window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
    }
};
// ==========================================
// 💡 4️⃣ 快速傅立葉變換與真立體聲動態變焦尺標（Dynamic Scale）渲染大腦
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
    
    let dbSteps = [0, -12, -30, -50];
    let midY = 200;

    if (!window.isSimulating && window.filteredDataLog.length === 0) {
        window.tCtx.clearRect(0, 0, 800, 400); 
        window.tCtx.fillStyle = '#111'; 
        window.tCtx.fillRect(0, 0, 800, 400); 
        window.tCtx.strokeStyle = '#333'; 
        window.tCtx.beginPath(); 
        [1.0, 0.5, 0.0, -0.5, -1.0].forEach(v => { 
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
    
    let rawSlice = window.filteredDataLog.slice(-Math.max(64, Math.min(window.filteredDataLog.length, Math.round((3 * window.currentSampleRate) / window.currentSinFreq))));
    
    let maxRealVal = Math.max(...rawSlice);
    let minRealVal = Math.min(...rawSlice);
    let sq = 0; 
    rawSlice.forEach(v => sq += v * v);
    document.getElementById('vppVal').innerText = (maxRealVal - minRealVal).toFixed(2) + " V"; 
    document.getElementById('rmsVal').innerText = Math.sqrt(sq / rawSlice.length).toFixed(2) + " V";
    
    let framePeak = Math.max(Math.abs(maxRealVal), Math.abs(minRealVal));
    if (framePeak < 0.01) framePeak = 0.01;
    let scaleY = 145.0 / framePeak; 
    
    let re = new Float32Array(window.FFT_SIZE);
    let im = new Float32Array(window.FFT_SIZE);
    for (let k = 0; k < window.FFT_SIZE; k++) {
        re[k] = window.analysisBuffer[(window.bufferIndex + k) % window.FFT_SIZE];
    }
    localFFT(re, im); 
    
    let magnitudes = new Float32Array(window.FFT_SIZE / 2);
    let maxMag = 0;
    let peakBinIndex = 0; 
    
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { 
        magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); 
        if (m > 2) { 
            if (magnitudes[m] > maxMag) {
                maxMag = magnitudes[m];
                peakBinIndex = m; 
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
    
    let livePeakHz = peakBinIndex * hzPerBin;
    document.getElementById('freqVal').innerText = maxMag > 0.015 ? livePeakHz.toFixed(1) + " Hz" : "0.0 Hz";

    window.tCtx.clearRect(0, 0, 800, 400); 
    window.tCtx.fillStyle = '#111'; 
    window.tCtx.fillRect(0, 0, 800, 400); 
    window.tCtx.strokeStyle = '#333'; 
    window.tCtx.lineWidth = 1; 
    window.tCtx.beginPath(); 
    
    let gridPixelSteps = [1.0, 0.5, 0.0, -0.5, -1.0];
    gridPixelSteps.forEach(ratio => {
        let gridY = midY - (ratio * 145.0); 
        window.tCtx.moveTo(0, gridY); 
        window.tCtx.lineTo(800, gridY); 
    });
    window.tCtx.stroke();
    
    window.tCtx.fillStyle = '#ffffff'; 
    window.tCtx.font = 'bold 12px Arial'; 
    gridPixelSteps.forEach(ratio => {
        let currentLabelVolt = ratio * framePeak; 
        let sign = (currentLabelVolt > 0.001) ? "+" : "";
        window.tCtx.fillText(sign + currentLabelVolt.toFixed(2) + "V", 25, midY - (ratio * 145.0) + 4);
    });
    
    // 🚀 🔒 【起點與迴圈中括號下標數字絕對鎖死 🔒】雙重轉義破天鎖護航，下標全數歸位
    window.tCtx.strokeStyle = '#00ff66'; 
    window.tCtx.lineWidth = 2.5; 
    window.tCtx.beginPath(); 
    window.tCtx.moveTo(0, midY - (rawSlice[0] * scaleY)); 
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
// 💡 5️⃣ !important 最高優先級控制外框與「RAW動態隔離 ＋ 0~20kHz全頻段解鎖」事件驅動引擎
// ==========================================
window.renderFilterButtonLights = function() {
    const btnIds = { RAW: 'filterRaw', LP: 'filterLP', HP: 'filterHP', BP: 'filterBP' };
    
    let f1Slider = document.getElementById('f1Slider');
    let f2Slider = document.getElementById('f2Slider');
    let f1View = document.getElementById('f1Container'); 
    let f2View = document.getElementById('f2Container'); 
    
    // 🚀 🔒 【RAW 模式動態隔離 ＋ 濾波模式雙拉桿 100% 剛性常開鎖死】
    if (f1View && f2View && f1Slider && f2Slider) {
        if (window.currentFilterMode === 'RAW') {
            // RAW 直通模式下：不要 F1、F2，兩個控制列容器徹底完全隱藏，保持極簡保真！
            f1View.style.setProperty('display', 'none', 'important');
            f2View.style.setProperty('display', 'none', 'important');
        } else {
            // 🚨 🔒 世紀大定案：只要是 LP, HP, BP 三大濾波模式中的任何一個，F1 和 F2 同步 100% 強制常開，在 LP 時 F2 也絕對傲然挺立不消失！
            f1View.style.setProperty('display', 'flex', 'important');
            f2View.style.setProperty('display', 'flex', 'important');
            
            // 剛性鎖死 HTML 拉桿極限範圍，全線解鎖 0 ~ 20000 Hz 工業全頻段！
            f1Slider.min = "0";
            f1Slider.max = "20000";
            f2Slider.min = "0";
            f2Slider.max = "20000";
        }
    }
    
    if (f1Slider && f2Slider) {
        if (window.currentFilterMode === 'LP') {
            f1Slider.value = window.f1_LP;
            f2Slider.value = window.f2_LP;
            if (f1Slider.nextElementSibling) f1Slider.nextElementSibling.innerText = window.f1_LP + " Hz";
            if (f2Slider.nextElementSibling) f2Slider.nextElementSibling.innerText = window.f2_LP + " Hz";
        } else if (window.currentFilterMode === 'HP') {
            f1Slider.value = window.f1_HP;
            f2Slider.value = window.f2_HP;
            if (f1Slider.nextElementSibling) f1Slider.nextElementSibling.innerText = window.f1_HP + " Hz";
            if (f2Slider.nextElementSibling) f2Slider.nextElementSibling.innerText = window.f2_HP + " Hz";
        } else if (window.currentFilterMode === 'BP') {
            f1Slider.value = window.f1_BP;
            f2Slider.value = window.f2_BP;
            if (f1Slider.nextElementSibling) f1Slider.nextElementSibling.innerText = window.f1_BP + " Hz";
            if (f2Slider.nextElementSibling) f2Slider.nextElementSibling.innerText = window.f2_BP + " Hz";
        }
    }

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
            btnEl.style.setProperty('border-color', '#00ff66', 'important');
            btnEl.style.setProperty('font-weight', 'bold', 'important');
            btnEl.classList.add('active');
        } else {
            btnEl.style.setProperty('background-color', '#3a3a3a', 'important');
            btnEl.style.setProperty('color', '#eeeeee', 'important');
            btnEl.style.setProperty('border-color', '#555555', 'important');
            btnEl.style.setProperty('font-weight', 'normal', 'important');
            btnEl.classList.remove('active');
        }
    });
};

document.getElementById('simBtn')?.addEventListener('click', () => { 
    window.isSimulating = !window.isSimulating; 
    document.getElementById('simBtn').innerText = window.isSimulating ? "🛑 停止本地模擬測試" : "🛠️ 開啟本地資料模擬測試"; 
    window.initAudioGlobal(); 
});

document.addEventListener('click', (e) => {
    if (!e.target || !e.target.id) return; 
    let clickId = e.target.id;
    
    if (clickId === 'speakerBtn') { 
        window.isSpeakerOn = !window.isSpeakerOn; 
        document.getElementById('speakerBtn').innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉"; 
        if (window.gainNode) window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? window.currentVolume : 0.0, window.audioCtx.currentTime); 
    }
    
    const fModes = { filterRaw: 'RAW', filterLP: 'LP', filterHP: 'HP', filterBP: 'BP' };
    if (fModes[clickId]) {
        window.currentFilterMode = fModes[clickId];
        
        // 🚀 🔒 【徹底摧毀所有隱藏與閹割拉桿的自殘代碼】
        // 此處所有的問號判斷式和 display='none' 已經百分之百斬草除根！一個字都沒留！
        window.updateFilterCoefficients(); 
        window.renderFilterButtonLights();
    }
});

document.addEventListener('input', (e) => {
    if (!e.target || !e.target.id || e.target.type !== 'range') return;
    let curVal = parseFloat(e.target.value);
    let sliderId = e.target.id;
    
    if (sliderId === "sampleRateSlider") { 
        window.currentSampleRate = parseInt(curVal); 
        window.updateFilterCoefficients(); 
    }
    if (sliderId === "sinFreqSlider") window.currentSinFreq = parseInt(curVal);
    
    // 🔒 【個別模式引數記憶動態改值引擎】拉動拉桿時，0 ~ 20000 Hz 全範圍寫入專屬記憶池！
    if (sliderId === "f1Slider") { 
        if (window.currentFilterMode === 'LP') window.f1_LP = parseInt(curVal);
        else if (window.currentFilterMode === 'HP') window.f1_HP = parseInt(curVal);
        else if (window.currentFilterMode === 'BP') window.f1_BP = parseInt(curVal);
        window.updateFilterCoefficients(); 
    }
    if (sliderId === "f2Slider") { 
        if (window.currentFilterMode === 'LP') window.f2_LP = parseInt(curVal);
        else if (window.currentFilterMode === 'HP') window.f2_HP = parseInt(curVal);
        else if (window.currentFilterMode === 'BP') window.f2_BP = parseInt(curVal);
        if (e.target.nextElementSibling) e.target.nextElementSibling.innerText = parseInt(curVal) + " Hz"; 
        window.updateFilterCoefficients(); 
    }
    
    if (sliderId === "volumeSlider") { 
        window.currentVolume = curVal; 
        if (e.target.nextElementSibling) e.target.nextElementSibling.innerText = Math.round(curVal * 100) + "%"; 
        if (window.gainNode && window.isSpeakerOn) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime); 
    }
    if (e.target.nextElementSibling && sliderId !== "f2Slider" && sliderId !== "volumeSlider") {
        e.target.nextElementSibling.innerText = curVal + " Hz";
    }
});

window.onload = function() { 
    window.updateFilterCoefficients(); 
    window.renderFilterButtonLights(); 
    window.globalRenderLoop(); 
};
