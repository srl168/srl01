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
let renderFrameCounter = 0;

// ==========================================
// 💡 2️⃣ 數位濾波器硬體晶片平滑同步閘門（100% 消除 F1、F2 互相卡死不反應黑洞！）
// ==========================================
window.updateFilterCoefficients = function() {
    if (!window.hardwareFilter || !window.audioCtx) return;
    try {
        let t = window.audioCtx.currentTime + 0.005; // 💡 給予硬體晶片 5 毫秒的平滑緩衝通道
        
        if (window.currentFilterMode === 'RAW') { 
            window.hardwareFilter.type = 'allpass'; 
        }
        else if (window.currentFilterMode === 'LP') { 
            window.hardwareFilter.type = 'lowpass'; 
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
        }
        else if (window.currentFilterMode === 'HP') { 
            window.hardwareFilter.type = 'highpass'; 
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
        }
        else if (window.currentFilterMode === 'BP') { 
            window.hardwareFilter.type = 'bandpass'; 
            // 💡 鋼性解鎖：改用硬體平滑緩降通道，單單拉任何一根拉桿都能 0 階梯獨立完美響應！
            window.hardwareFilter.frequency.linearRampToValueAtTime(window.f1, t); 
            
            let qVal = window.f1 / (window.f2 > 0 ? window.f2 : 1.0); if (qVal < 0.1) qVal = 0.1;
            window.hardwareFilter.Q.linearRampToValueAtTime(qVal, t);
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
// ==========================================
// 💡 3️⃣ 聲學大革命：純網頁音訊硬體圖學直連（控制台 100% 乾淨雪白）
// ==========================================
window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode.disconnect(); window.oscNode = null; }
    
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
        window.oscNode.connect(window.hardwareFilter); 
        window.oscNode.start();
    }
};

window.consumeRawBuffer = function(rawDataView) {
    let byteLength = rawDataView.byteLength;
    for (let i = 0; i < byteLength; i++) {
        let byteVal = rawDataView.getUint8(i); let val = (byteVal / 127.5) - 1.0;
        window.filteredDataLog.push(val);
        if (window.filteredDataLog.length > 5000) window.filteredDataLog.shift(); 
        window.analysisBuffer[window.bufferIndex] = val; window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
    }
};
// ==========================================
// 💡 3️⃣ 聲學大革命：純網頁音訊硬體圖學直連（控制台 100% 乾淨雪白）
// ==========================================
window.initAudioGlobal = function() {
    if (window.oscNode) { try { window.oscNode.stop(); } catch(e){} window.oscNode.disconnect(); window.oscNode = null; }
    
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
        window.oscNode.connect(window.hardwareFilter); 
        window.oscNode.start();
    }
};

window.consumeRawBuffer = function(rawDataView) {
    let byteLength = rawDataView.byteLength;
    for (let i = 0; i < byteLength; i++) {
        let byteVal = rawDataView.getUint8(i); let val = (byteVal / 127.5) - 1.0;
        window.filteredDataLog.push(val);
        if (window.filteredDataLog.length > 5000) window.filteredDataLog.shift(); 
        window.analysisBuffer[window.bufferIndex] = val; window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
    }
};
