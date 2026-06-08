//12827

if (window.audioInterval) {
    clearInterval(window.audioInterval);
}
window.isWritingLock = false;

// ==========================================
// 💡 1️⃣ 全域記憶體大腦池初始化（96檔暫存器 100% 實體平鋪死鎖 🔒）
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

// 🚀 🔒 【各別模式引數記憶池：調適極度方便，各就各位絕不干擾】
window.f1_LP = 1000; window.f2_LP = 3000;
window.f1_HP = 1200; window.f2_HP = 3500;
window.f1_BP = 800;  window.f2_BP = 2500;

// 🚀 🔒 【96檔實體點命名暫存器全域平鋪大死鎖 🔒】
// 徹底砸爛陣列物件與中括號！用最聽話的實體小變數（_0, _1, _2）剛性控死歷史移位！
// 1. 左聲道高通前級 4 級狀態
window.xv_0 = 0; window.xv_1 = 0; window.xv_2 = 0; window.yv_0 = 0; window.yv_1 = 0; window.yv_2 = 0;
window.xv2_0 = 0; window.xv2_1 = 0; window.xv2_2 = 0; window.yv2_0 = 0; window.yv2_1 = 0; window.yv2_2 = 0;
window.xv3_0 = 0; window.xv3_1 = 0; window.xv3_2 = 0; window.yv3_0 = 0; window.yv3_1 = 0; window.yv3_2 = 0;
window.xv4_0 = 0; window.xv4_1 = 0; window.xv4_2 = 0; window.yv4_0 = 0; window.yv4_1 = 0; window.yv4_2 = 0;

// 2. 左聲道低通後級 4 級狀態
window.xlv_0 = 0; window.xlv_1 = 0; window.xlv_2 = 0; window.ylv_0 = 0; window.ylv_1 = 0; window.ylv_2 = 0;
window.xlv2_0 = 0; window.xlv2_1 = 0; window.xlv2_2 = 0; window.ylv2_0 = 0; window.ylv2_1 = 0; window.ylv2_2 = 0;
window.xlv3_0 = 0; window.xlv3_1 = 0; window.xlv3_2 = 0; window.ylv3_0 = 0; window.ylv3_1 = 0; window.ylv3_2 = 0;
window.xlv4_0 = 0; window.xlv4_1 = 0; window.xlv4_2 = 0; window.ylv4_0 = 0; window.ylv4_1 = 0; window.ylv4_2 = 0;

// 3. 右聲道高通前級 4 級狀態
window.xvR_0 = 0; window.xvR_1 = 0; window.xvR_2 = 0; window.yvR_0 = 0; window.yvR_1 = 0; window.yvR_2 = 0;
window.xvR2_0 = 0; window.xvR2_1 = 0; window.xvR2_2 = 0; window.yvR2_0 = 0; window.yvR2_1 = 0; window.yvR2_2 = 0;
window.xvR3_0 = 0; window.xvR3_1 = 0; window.xvR3_2 = 0; window.yvR3_0 = 0; window.yvR3_1 = 0; window.yvR3_2 = 0;
window.xvR4_0 = 0; window.xvR4_1 = 0; window.xvR4_2 = 0; window.yvR4_0 = 0; window.yvR4_1 = 0; window.yvR4_2 = 0;

// 4. 右聲道低通後級 4 級狀態
window.xlvR_0 = 0; window.xlvR_1 = 0; window.xlvR_2 = 0; window.ylvR_0 = 0; window.ylvR_1 = 0; window.ylvR_2 = 0;
window.xlvR2_0 = 0; window.xlvR2_1 = 0; window.xlvR2_2 = 0; window.ylvR2_0 = 0; window.ylvR2_1 = 0; window.ylvR2_2 = 0;
window.xlvR3_0 = 0; window.xlvR3_1 = 0; window.xlvR3_2 = 0; window.ylvR3_0 = 0; window.ylvR3_1 = 0; window.ylvR3_2 = 0;
window.xlvR4_0 = 0; window.xlvR4_1 = 0; window.xlvR4_2 = 0; window.ylvR4_0 = 0; window.ylvR4_1 = 0; window.ylvR4_2 = 0;

// 全域巴特沃斯係數指標剛性初始化
window.b0_HP = 1; window.b1_HP = 0; window.b2_HP = 0; window.a1_HP = 0; window.a2_HP = 0;
window.b0_LP = 1; window.b1_LP = 0; window.b2_LP = 0; window.a1_LP = 0; window.a2_LP = 0;

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
// 💡 2️⃣ 各自 F1, F2 精密係數計算公式（三大模式各別模式引數完全解耦）
// ==========================================
window.updateFilterCoefficients = function() {
    let fs = window.currentSampleRate;
    let qVal = 0.70710678; // 巴特沃斯最大平坦剛性 Q 值
    
    // 🔒 1. 抓取當前模式下的實時 F1、F2 截止頻率參數
    let f1_cur = 1000;
    let f2_cur = 3000;
    
    if (window.currentFilterMode === 'LP') { 
        f1_cur = window.f1_LP; f2_cur = window.f2_LP; 
    } else if (window.currentFilterMode === 'HP') { 
        f1_cur = window.f1_HP; f2_cur = window.f2_HP; 
    } else if (window.currentFilterMode === 'BP') { 
        f1_cur = window.f1_BP; f2_cur = window.f2_BP; 
    }
    
    if (f2_cur <= f1_cur) f2_cur = f1_cur + 10;

    // 🔒 2. 實時動態調製「真八階高通 (HP) 係數組」（下限 f1_cur）
    let frH = fs / f1_cur; if (frH < 2.01) frH = 2.01;
    let oH = Math.tan(Math.PI / frH);
    let cH = 1.0 + (oH / qVal) + (oH * oH);
    window.b0_HP = 1.0 / cH;         
    window.b1_HP = -2.0 * window.b0_HP; 
    window.b2_HP = window.b0_HP;
    window.a1_HP = 2.0 * (1.0 - oH * oH) / cH; 
    window.a2_HP = (1.0 - (oH / qVal) + (oH * oH)) / cH;

    // 🔒 3. 實時動態調製「真八階低通 (LP) 係數組」（上限 f2_cur）
    let frL = fs / f2_cur; if (frL < 2.01) frL = 2.01;
    let oL = Math.tan(Math.PI / frL);
    let cL = 1.0 + (oL / qVal) + (oL * oL);
    window.b0_LP = (oL * oL) / cL;   
    window.b1_LP = 2.0 * window.b0_LP; 
    window.b2_LP = window.b0_LP;
    window.a1_LP = 2.0 * (oL * oL - 1.0) / cL; 
    window.a2_LP = (1.0 - (oL / qVal) + (oL * oL)) / cL;
};

// ==========================================
// 💡 3️⃣ 雙聲道平行解調映射矩陣（純常數點命名，100% 絕對全線通電大開機 🔒）
// ==========================================
window.applyFilterLeft = function(x) {
    if (window.currentFilterMode === 'RAW') return x;
    if (window.currentFilterMode === 'HP') return 0.0; // HP 模式下：左耳強制完全物理斷電靜音 🔇
    
    // 💡 LP 和 BP 模式：左耳跑最平坦、級聯水管完全接通的 8 階高低通串聯矩陣！
    // 🛑 前級：高通 4 級級聯（高達 8 階）
    window.xv_2 = window.xv_1; window.xv_1 = window.xv_0; window.xv_0 = x;
    window.yv_2 = window.yv_1; window.yv_1 = window.yv_0;
    window.yv_0 = (window.b0_HP * window.xv_0) + (window.b1_HP * window.xv_1) + (window.b2_HP * window.xv_2) - (window.a1_HP * window.yv_1) - (window.a2_HP * window.yv_2);
    
    window.xv2_2 = window.xv2_1; window.xv2_1 = window.xv2_0; window.xv2_0 = window.yv_0;
    window.yv2_2 = window.yv2_1; window.yv2_1 = window.yv2_0;
    window.yv2_0 = (window.b0_HP * window.xv2_0) + (window.b1_HP * window.xv2_1) + (window.b2_HP * window.xv2_2) - (window.a1_HP * window.yv2_1) - (window.a2_HP * window.yv2_2);
    
    window.xv3_2 = window.xv3_1; window.xv3_1 = window.xv3_0; window.xv3_0 = window.yv2_0;
    window.yv3_2 = window.yv3_1; window.yv3_1 = window.yv3_0;
    window.yv3_0 = (window.b0_HP * window.xv3_0) + (window.b1_HP * window.xv3_1) + (window.b2_HP * window.xv3_2) - (window.a1_HP * window.yv3_1) - (window.a2_HP * window.yv3_2);
    
    window.xv4_2 = window.xv4_1; window.xv4_1 = window.xv4_0; window.xv4_0 = window.yv3_0;
    window.yv4_2 = window.yv4_1; window.yv4_1 = window.yv4_0;
    window.yv4_0 = (window.b0_HP * window.xv4_0) + (window.b1_HP * window.xv4_1) + (window.b2_HP * window.xv4_2) - (window.a1_HP * window.yv4_1) - (window.a2_HP * window.yv4_2);

    // 🛑 後級：低通 4 級級聯（高達 8 階），水管連環滾動（yv4_0 -> xlv -> ylv -> xlv2...）
    window.xlv_2 = window.xlv_1; window.xlv_1 = window.xlv_0; window.xlv_0 = window.yv4_0;
    window.ylv_2 = window.ylv_1; window.ylv_1 = window.ylv_0;
    window.ylv_0 = (window.b0_LP * window.xlv_0) + (window.b1_LP * window.xlv_1) + (window.b2_LP * window.xlv_2) - (window.a1_LP * window.ylv_1) - (window.a2_LP * window.ylv_2);
    
    window.xlv2_2 = window.xlv2_1; window.xlv2_1 = window.xlv2_0; window.xlv2_0 = window.ylv_0;
    window.ylv2_2 = window.ylv2_1; window.ylv2_1 = window.ylv2_0;
    window.ylv2_0 = (window.b0_LP * window.xlv2_0) + (window.b1_LP * window.xlv2_1) + (window.b2_LP * window.xlv2_2) - (window.a1_LP * window.ylv2_1) - (window.a2_LP * window.ylv2_2);
    
    window.xlv3_2 = window.xlv3_1; window.xlv3_1 = window.xlv3_0; window.xlv3_0 = window.ylv2_0;
    window.ylv3_2 = window.ylv3_1; window.ylv3_1 = window.ylv3_0;
    window.ylv3_0 = (window.b0_LP * window.xlv3_0) + (window.b1_LP * window.xlv3_1) + (window.b2_LP * window.xlv3_2) - (window.a1_LP * window.ylv3_1) - (window.a2_LP * window.ylv3_2);
    
    window.xlv4_2 = window.xlv4_1; window.xlv4_1 = window.xlv4_0; window.xlv4_0 = window.ylv3_0;
    window.ylv4_2 = window.ylv4_1; window.ylv4_1 = window.ylv4_0;
    window.ylv4_0 = (window.b0_LP * window.xlv4_0) + (window.b1_LP * window.xlv4_1) + (window.b2_LP * window.xlv4_2) - (window.a1_LP * window.ylv4_1) - (window.a2_LP * window.ylv4_2);

    if (isNaN(window.ylv4_0) || !isFinite(window.ylv4_0)) { window.ylv4_0 = 0; }
    return window.ylv4_0;
};

window.applyFilterRight = function(x) {
    if (window.currentFilterMode === 'RAW') return x;
    if (window.currentFilterMode === 'LP') return 0.0; // LP 模式下：右耳強制完全物理斷電靜音 🔇
    
    // 💡 HP 和 BP 模式：右耳跑最平坦、級聯水管完全接通的 8 階高低通串聯矩陣！
    // 🛑 前級：高通 4 級級聯（高達 8 階）
    window.xvR_2 = window.xvR_1; window.xvR_1 = window.xvR_0; window.xvR_0 = x;
    window.yvR_2 = window.yvR_1; window.yvR_1 = window.yvR_0;
    window.yvR_0 = (window.b0_HP * window.xvR_0) + (window.b1_HP * window.xvR_1) + (window.b2_HP * window.xvR_2) - (window.a1_HP * window.yvR_1) - (window.a2_HP * window.yvR_2);
    
    window.xvR2_2 = window.xvR2_1; window.xvR2_1 = window.xvR2_0; window.xvR2_0 = window.yvR_0;
    window.yvR2_2 = window.yvR2_1; window.yvR2_1 = window.yvR2_0;
    window.yvR2_0 = (window.b0_HP * window.xvR2_0) + (window.b1_HP * window.xvR2_1) + (window.b2_HP * window.xvR2_2) - (window.a1_HP * window.yvR2_1) - (window.a2_HP * window.yvR2_2);
    
    window.xvR3_2 = window.xvR3_1; window.xvR3_1 = window.xvR3_0; window.xvR3_0 = window.yvR2_0;
    window.yvR3_2 = window.yvR3_1; window.yvR3_1 = window.yvR3_0;
    window.yvR3_0 = (window.b0_HP * window.xvR3_0) + (window.b1_HP * window.xvR3_1) + (window.b2_HP * window.xvR3_2) - (window.a1_HP * window.yvR3_1) - (window.a2_HP * window.yvR3_2);
    
    window.xvR4_2 = window.xvR4_1; window.xvR4_1 = window.xvR4_0; window.xvR4_0 = window.yvR3_0;
    window.yvR4_2 = window.yvR4_1; window.yvR4_1 = window.yvR4_0;
    window.yvR4_0 = (window.b0_HP * window.xvR4_0) + (window.b1_HP * window.xvR4_1) + (window.b2_HP * window.xvR4_2) - (window.a1_HP * window.yvR4_1) - (window.a2_HP * window.yvR4_2);

    // 🛑 後級：低通 4 級級聯（高達 8 階），水管連環滾動
    window.xlvR_2 = window.xlvR_1; window.xlvR_1 = window.xlvR_0; window.xlvR_0 = window.yvR4_0;
    window.ylvR_2 = window.ylvR_1; window.ylvR_1 = window.ylvR_0;
    window.ylvR_0 = (window.b0_LP * window.xlvR_0) + (window.b1_LP * window.xlvR_1) + (window.b2_LP * window.xlvR_2) - (window.a1_LP * window.ylvR_1) - (window.a2_LP * window.ylvR_2);
    
    window.xlvR2_2 = window.xlvR2_1; window.xlvR2_1 = window.xlvR2_0; window.xlvR2_0 = window.ylvR_0;
    window.ylvR2_2 = window.ylvR2_1; window.ylvR2_1 = window.ylvR2_0;
    window.ylvR2_0 = (window.b0_LP * window.xlvR2_0) + (window.b1_LP * window.xlvR2_1) + (window.b2_LP * window.xlvR2_2) - (window.a1_LP * window.ylvR2_1) - (window.a2_LP * window.ylvR2_2);
    
    window.xlvR3_2 = window.xlvR3_1; window.xlvR3_1 = window.xlvR3_0; window.xlvR3_0 = window.ylvR2_0;
    window.ylvR3_2 = window.ylvR3_1; window.ylvR3_1 = window.ylvR3_0;
    window.ylvR3_0 = (window.b0_LP * window.xlvR3_0) + (window.b1_LP * window.xlvR3_1) + (window.b2_LP * window.xlvR3_2) - (window.a1_LP * window.ylvR3_1) - (window.a2_LP * window.ylvR3_2);
    
    window.xlvR4_2 = window.xlvR4_1; window.xlvR4_1 = window.xlvR4_0; window.xlvR4_0 = window.ylvR3_0;
    window.ylvR4_2 = window.ylvR4_1; window.ylvR4_1 = window.ylvR4_0;
    // 🚀 🔒 【右耳尾端 Feedback 算式 100% 精確、字字血淚對齊右耳自己的暫存器，絕無跨耳串軌！】
    window.ylvR4_0 = (window.b0_LP * window.xlvR4_0) + (window.b1_LP * window.xlvR4_1) + (window.b2_LP * window.xlvR4_2) - (window.a1_LP * window.ylvR4_1) - (window.a2_LP * window.ylvR4_2);

    if (isNaN(window.ylvR4_0) || !isFinite(window.ylvR4_0)) { window.ylvR4_0 = 0; }
    return window.ylvR4_0;
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
        
        // 🚀 🔒 【硬體聲道死鎖】強制 GainNode 通道為 explicit 雙聲道，徹底切斷 Up-mixing 自動混音黑洞！
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
                    rightOutVal = 0.0; // LP 狀態下：右耳強制完全斷電靜音 🔇
                } else if (window.currentFilterMode === 'HP') {
                    leftOutVal = 0.0;  // HP 狀態下：左耳強制完全靜音 🔇
                } else if (window.currentFilterMode === 'BP') {
                    leftOutVal = leftVal;
                    rightOutVal = rightVal; // BP 狀態下：左右各就各位同時放音
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
    
    // 🚀 🔒 【時域自適應幾何繪圖起點與迴圈線路】中括號數字下標 [0], [j] 鐵證死鎖！🔒
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
    
    // 🚀 🔒 【真．100% 雙通道對稱容器剛性死鎖】
    // 精確錨定您最新重構的實體對稱 ID 節點 f1Container 與 f2Container，徹底消滅一切打架烏龍！
    let f1Box = document.getElementById('f1Container'); 
    let f2Box = document.getElementById('f2Container'); 
    
    if (f1Box && f2Box && f1Slider && f2Slider) {
        if (window.currentFilterMode === 'RAW') {
            // 💡 RAW 直通模式：雙通道外框大容器 100% 同步完全消失，徹底淨化，絕不冒出任何 F10 Hz 殘留文字！
            f1Box.style.setProperty('display', 'none', 'important');
            f2Box.style.setProperty('display', 'none', 'important');
        } else {
            // 💡 LP, HP, BP 三大濾波模式：雙通道外框大容器 100% 同步 flex 永久全出！LP 模式下 F2 也絕對傲然挺立！
            f1Box.style.setProperty('display', 'flex', 'important');
            f2Box.style.setProperty('display', 'flex', 'important');
            
            // 最高權限一鍵全開 0 ~ 20000 Hz 工業全頻段 HTML 硬件邊界
            f1Slider.setAttribute('min', '0');
            f1Slider.setAttribute('max', '20000');
            f2Slider.setAttribute('min', '0');
            f2Slider.setAttribute('max', '20000');
            
            f1Slider.min = "0";
            f1Slider.max = "20000";
            f2Slider.min = "0";
            f2Slider.max = "20000";
        }
    }
    
    // 🚀 🔒 【精確看板針尖更新】
    let txt1 = document.getElementById('freq1Val');
    let txt2 = document.getElementById('freq2Val');

    if (f1Slider && f2Slider) {
        if (window.currentFilterMode === 'LP') {
            f1Slider.value = window.f1_LP;
            f2Slider.value = window.f2_LP;
            if (txt1) txt1.innerText = window.f1_LP + " Hz";
            if (txt2) txt2.innerText = window.f2_LP + " Hz";
        } else if (window.currentFilterMode === 'HP') {
            f1Slider.value = window.f1_HP;
            f2Slider.value = window.f2_HP;
            if (txt1) txt1.innerText = window.f1_HP + " Hz";
            if (txt2) txt2.innerText = window.f2_HP + " Hz";
        } else if (window.currentFilterMode === 'BP') {
            f1Slider.value = window.f1_BP;
            f2Slider.value = window.f2_BP;
            if (txt1) txt1.innerText = window.f1_BP + " Hz";
            if (txt2) txt2.innerText = window.f2_BP + " Hz";
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
        
        window.updateFilterCoefficients(); 
        window.renderFilterButtonLights();
    }
});

document.addEventListener('input', (e) => {
    if (!e.target || !e.target.id || e.target.type !== 'range') return;
    let curVal = parseFloat(e.target.value);
    let sliderId = e.target.id;
    
    let txt1 = document.getElementById('freq1Val');
    let txt2 = document.getElementById('freq2Val');
    
    if (sliderId === "sampleRateSlider") { 
        window.currentSampleRate = parseInt(curVal); 
        window.updateFilterCoefficients(); 
    }
    if (sliderId === "sinFreqSlider") window.currentSinFreq = parseInt(curVal);
    
    // 🔒 【個別模式引數記憶動態改值引擎】拉動拉桿時，0 ~ 20000 Hz 全範圍無阻礙寫入專屬記憶池！
    if (sliderId === "f1Slider") { 
        if (window.currentFilterMode === 'LP') window.f1_LP = parseInt(curVal);
        else if (window.currentFilterMode === 'HP') window.f1_HP = parseInt(curVal);
        else if (window.currentFilterMode === 'BP') window.f1_BP = parseInt(curVal);
        if (txt1) txt1.innerText = parseInt(curVal) + " Hz";
        window.updateFilterCoefficients(); 
    }
    if (sliderId === "f2Slider") { 
        if (window.currentFilterMode === 'LP') window.f2_LP = parseInt(curVal);
        else if (window.currentFilterMode === 'HP') window.f2_HP = parseInt(curVal);
        else if (window.currentFilterMode === 'BP') window.f2_BP = parseInt(curVal);
        if (txt2) txt2.innerText = parseInt(curVal) + " Hz"; 
        window.updateFilterCoefficients(); 
    }
    
    if (sliderId === "volumeSlider") { 
        window.currentVolume = curVal; 
        if (e.target.nextElementSibling) e.target.nextElementSibling.innerText = Math.round(curVal * 100) + "%"; 
        if (window.gainNode && window.isSpeakerOn) window.gainNode.gain.setValueAtTime(curVal, window.audioCtx.currentTime); 
    }
});

window.onload = function() { 
    // 🔒 🚀 【頂層計算大重構】將第二段的 updateFilterCoefficients 在此重新洗滌，
    // 讓 LP, HP, BP 在底層運算時通通一體化，轉化為聽從專屬引數記憶池的「真雙截止帶通功能」！🔒
    window.updateFilterCoefficients = function() {
        let fs = window.currentSampleRate;
        let f1_cur = 1000, f2_cur = 3000;
        
        if (window.currentFilterMode === 'LP') { f1_cur = window.f1_LP; f2_cur = window.f2_LP; }
        else if (window.currentFilterMode === 'HP') { f1_cur = window.f1_HP; f2_cur = window.f2_HP; }
        else if (window.currentFilterMode === 'BP') { f1_cur = window.f1_BP; f2_cur = window.f2_BP; }
        
        if (f2_cur <= f1_cur) f2_cur = f1_cur + 10;
        let fr_L = fs / f1_cur; if (fr_L < 2.01) fr_L = 2.01;
        let fr_H = fs / f2_cur; if (fr_H < 2.01) fr_H = 2.01;
        let o_L = Math.tan(Math.PI / fr_L);
        let o_H = Math.tan(Math.PI / fr_H);
        let W = o_H - o_L; if (W < 0.001) W = 0.001;
        let C = o_L * o_H;
        let cBP = 1.0 + W + C;
        
        let b0_coef = W / cBP;
        let b1_coef = 0.0;
        let b2_coef = -b0_coef;
        let a1_coef = 2.0 * (C - 1.0) / cBP;
        let a2_coef = (1.0 - W + C) / cBP;
        
        if (window.currentFilterMode === 'LP') {
            window.b0 = b0_coef; window.b1 = b1_coef; window.b2 = b2_coef; window.a1 = a1_coef; window.a2 = a2_coef;
            window.b0R = window.b1R = window.b2R = window.a1R = window.a2R = 0;
        } else if (window.currentFilterMode === 'HP') {
            window.b0 = window.b1 = window.b2 = window.a1 = window.a2 = 0;
            window.b0R = b0_coef; window.b1R = b1_coef; window.b2R = b2_coef; window.a1R = a1_coef; window.a2R = a2_coef;
        } else if (window.currentFilterMode === 'BP') {
            window.b0 = b0_coef; window.b1 = b1_coef; window.b2 = b2_coef; window.a1 = a1_coef; window.a2 = a2_coef;
            window.b0R = b0_coef; window.b1R = b1_coef; window.b2R = b2_coef; window.a1R = a1_coef; window.a2R = a2_coef;
        }
    };
    
    window.updateFilterCoefficients(); 
    window.renderFilterButtonLights(); 
    window.globalRenderLoop(); 
};
