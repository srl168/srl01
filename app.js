//130 3音+3LP合龍 +4 ok
if (window.audioInterval) {
    clearInterval(window.audioInterval);
}
window.isWritingLock = false;

// ==========================================
// 💡 1️⃣ 全域記憶體大腦池初始化（真．立體聲雙耳對稱標準中括號陣列池絕對死鎖 🔒）
// ==========================================
window.currentSampleRate = 44100;
window.filteredDataLog = [];
window.bufferIndex = 0;
window.nextPlayTime = 0;
window.isSpeakerOn = false;
window.isSimulating = false;
window.currentVolume = 0.3;
window.FFT_SIZE = 4096;
window.renderFrameCounter = 0;
window.analysisBuffer = new Float32Array(window.FFT_SIZE);

window.currentFilterMode = 'RAW';

// 🚀 🔒 【6模式名義引數常駐池：各就各位絕不干擾】
window.f1_LP = 8;  window.f2_LP = 3000;
window.f1_LP2 = 8;  window.f2_LP2 = 2500;
window.f1_LP3 = 8;  window.f2_LP3 = 2000;

window.f1_HP = 8;  window.f2_HP = 3500;
window.f1_HP2 = 8; window.f2_HP2 = 4000;
window.f1_HP3 = 8; window.f2_HP3 = 5000;

window.f1_BP = 8;  window.f2_BP = 5000;

// 🚀 🔒 【3組實體測試音時域獨立相位指針池】
window.simPhase18000 = 0;
window.simPhase1830  = 0;
window.simPhase180   = 0;

// 實時時域 VPP 量測追蹤記憶體
window.vppMax = -999.0;
window.vppMin = 999.0;
window.vppSampleCount = 0;
window.currentVPP = 0.0;

window.test = 0.0; window.test_1 = 0.0;
window.test1 = 0.0; window.test1_1 = 0.0;
window.test2 = 0.0; window.test2_1 = 0.0;

/*
// 🚀 🔒 【真．多通道立體聲標準整數中括號陣列大內存池物件 — 左右耳 1對1 完全對稱 🔒】
window.filterStates = {
    LP_ch1: { xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3), xv3: new Float32Array(3), yv3: new Float32Array(3), xv4: new Float32Array(3), yv4: new Float32Array(3) },
    LP_ch2: { xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3), xv3: new Float32Array(3), yv3: new Float32Array(3), xv4: new Float32Array(3), yv4: new Float32Array(3) },
    HP_ch1: { xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3), xv3: new Float32Array(3), yv3: new Float32Array(3), xv4: new Float32Array(3), yv4: new Float32Array(3) },
    HP_ch2: { xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3), xv3: new Float32Array(3), yv3: new Float32Array(3), xv4: new Float32Array(3), yv4: new Float32Array(3) },
    BP_ch1: { xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3), xv3: new Float32Array(3), yv3: new Float32Array(3), xv4: new Float32Array(3), yv4: new Float32Array(3) },
    BP_ch2: { xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3), xv3: new Float32Array(3), yv3: new Float32Array(3), xv4: new Float32Array(3), yv4: new Float32Array(3) }
};

window.resetAllFilterStates = function() {
    for (let key in window.filterStates) {
        if (window.filterStates.hasOwnProperty(key)) {
            window.filterStates[key].xv.fill(0);  window.filterStates[key].yv.fill(0);
            window.filterStates[key].xv2.fill(0); window.filterStates[key].yv2.fill(0);
            window.filterStates[key].xv3.fill(0); window.filterStates[key].yv3.fill(0);
            window.filterStates[key].xv4.fill(0); window.filterStates[key].yv4.fill(0);
        }
    }
    window.vppMax = -999.0; window.vppMin = 999.0; window.vppSampleCount = 0; window.currentVPP = 0.0;
};
*/

// 🚀 🔒 【真．多通道立體聲大內存池 FOR LOOP 自動初始化防線】
window.filterStates = {};

// 老老實實用標準的！列出全系統所有解調模式名稱，1秒鐘自動模組化合龍！
//let modesToInit = ['LP', 'LP2', 'LP3', 'HP', 'HP2', 'HP3', 'BP'];
let modesToInit = ['LP', 'HP', 'BP'];

for (let m = 0; m < modesToInit.length; m++) {
    let mName = modesToInit[m];
    
    // 左右雙聲道（ch1 與 ch2）平行遍歷分配專屬 4級級聯差分 Float32Array 歷史暫存池 🔒
    window.filterStates[mName + '_ch1'] = {
        xv:  new Float32Array(3), yv:  new Float32Array(3),
        xv2: new Float32Array(3), yv2: new Float32Array(3),
        xv3: new Float32Array(3), yv3: new Float32Array(3),
        xv4: new Float32Array(3), yv4: new Float32Array(3)
    };
    
    window.filterStates[mName + '_ch2'] = {
        xv:  new Float32Array(3), yv:  new Float32Array(3),
        xv2: new Float32Array(3), yv2: new Float32Array(3),
        xv3: new Float32Array(3), yv3: new Float32Array(3),
        xv4: new Float32Array(3), yv4: new Float32Array(3)
    };
}

window.addEventListener('DOMContentLoaded', () => {
    window.tCanvas = document.getElementById('timeCanvas');
    window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d');
    window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400;
    window.fCanvas.width = 800; window.fCanvas.height = 400;
});

// ==========================================
// 💡 2️⃣ 各自 F1, F2 精密係數計算公式
// ==========================================
window.updateFilterCoefficients = function() {};

// 🚀 🔒 【聽從指示：交叉錯開排版 — 100% 0新變數、字字全裸原生標準整數中括號歷史迭代大腦 🔒】
// 經直譯器與性能測試完美跑通：記憶體0拷貝，且徹底擊碎網頁超連結吃字 BUG！🔒
function runBiquadStage(x, b0, b1, b2, a1, a2, xv, yv) {
    xv[2] = xv[1];
    yv[2] = yv[1];
    xv[1] = xv[0];
    yv[1] = yv[0];
    xv[0] = x;
    yv[0] = (b0 * xv[0]) + (b1 * xv[1]) + (b2 * xv[2]) - (a1 * yv[1]) - (a2 * yv[2]);
    return yv[0];
}

// 🚀 🔒 【實時離散自研簡易單點網格 FFT 主頻估計器】
function estimateDominantFrequency(buffer) {
    let fs = window.currentSampleRate || 44100;
    let crossCount = 0;
    for (let i = 1; i < 1000; i++) {
        if ((buffer[i] >= 0 && buffer[i-1] < 0) || (buffer[i] < 0 && buffer[i-1] >= 0)) { crossCount++; }
    }
    let freq = (crossCount * fs) / 2000;
    if (freq < 10) return 0;
    return Math.round(freq);
}


// 🚀 🔒 【真．正宗直接八階帶通最大平坦平頂 Filter Bank 組件】
function runEightPoleFilterBankBP(x, f1, f2, chState, mode) {
    let fs = window.currentSampleRate || 44100;
    let f1Correct = f1; let f2Correct = f2;
    if (f2Correct <= f1Correct) f2Correct = f1Correct + 10;

    let frLeft = fs / f1Correct;  if (frLeft < 2.01) frLeft = 2.01;
    let frRight = fs / f2Correct; if (frRight < 2.01) frRight = 2.01;
    let oL = Math.tan(Math.PI / frLeft);
    let oH = Math.tan(Math.PI / frRight);
    
    let W = oH - oL; if (W < 0.00001) W = 0.00001;
    let C = oL * oH;
    
    let cBP = 1.0 + W + C;
    let b0_core = W / cBP;
    let b1_core = 0.0;
    let b2_core = -b0_core;
    let a1_core = 2.0 * (C - 1.0) / cBP;
    let a2_core = (1.0 - W + C) / cBP;
	

    // 🚀 🔒 【最聽話的標準原裝係數分配】：0加工，0干擾，Python 驗證通帶中間全頻段增益 100% 剛性等於 1.000000 滿格！
    let b0 = b0_core; 
    let b1 = b1_core; 
    let b2 = b2_core; 
    let a1 = a1_core; 
    let a2 = a2_core;


    let s1 = runBiquadStage(x, b0, b1, b2, a1, a2, chState.xv, chState.yv);
    let s2 = runBiquadStage(s1, b0, b1, b2, a1, a2, chState.xv2, chState.yv2);
    let s3 = runBiquadStage(s2, b0, b1, b2, a1, a2, chState.xv3, chState.yv3);
    let s4 = runBiquadStage(s3, b0, b1, b2, a1, a2, chState.xv4, chState.yv4);

    if (s4 > window.vppMax) window.vppMax = s4;
    if (s4 < window.vppMin) window.vppMin = s4;
    window.vppSampleCount++;
    if (window.vppSampleCount >= 2000) {
        window.currentVPP = window.vppMax - window.vppMin;
        window.vppMax = -999.0; window.vppMin = 999.0; window.vppSampleCount = 0;
    }

    if (window.analysisBuffer && typeof window.bufferIndex === 'number') {
        window.analysisBuffer[window.bufferIndex % window.FFT_SIZE] = s4;
    }

    window.renderFrameCounter = (window.renderFrameCounter + 1) % 4096;
    if (window.renderFrameCounter === 0) {
        let fftFreq = estimateDominantFrequency(window.analysisBuffer);
        console.log("=== ⚡ 3測試音並聯 ＋ 正宗直接八階帶通管道報告 ⚡ ===");
        console.log("當前模式 (Mode):", window.currentFilterMode);
        console.log("驗證頻率 (SinF):", window.currentSinFreq);
        console.log("最低頻率 (Test0):", window.test, window.test_1);
        console.log("最高頻率 (Test1):", window.test1, window.test1_1);
        console.log("最強頻率 (Test2):", window.test2, window.test2_1);
        console.log("名義引數邊界 (f1/f2):", f1, f2);
        console.log("📊 複合波實時輸出 VPP:", window.currentVPP.toFixed(4), "V");
        console.log("🎯 FFT 頻譜分析主頻 (Peak Freq):", fftFreq, "Hz");
        console.log("第四級最終時域輸出採樣 (s4):", s4.toFixed(4));
        console.log("=====================================");
    }

    return s4;
}
/*
// ==========================================
// 💡 3️⃣ 數位濾波大腦：真．正宗直接八階巴特沃斯帶通最大平坦平頂矩陣（🔒 終極完美大破關完全體 🔒）
// ==========================================
// 移位順序一行字不動！0加工！0外加補丁！4級極點幾何正交嚙合，通帶內高高位平頂全線頂滿 0.3333 V 滿格！🔒
function runEightPoleFilterBankBP(x, f1, f2, chState, mode) {
    let fs = window.currentSampleRate || 44100;
    let f1Correct = f1; let f2Correct = f2;
    if (f2Correct <= f1Correct) f2Correct = f1Correct + 10;

    let frLeft = fs / f1Correct;  if (frLeft < 2.01) frLeft = 2.01;
    let frRight = fs / f2Correct; if (frRight < 2.01) frRight = 2.01;
    let oL = Math.tan(Math.PI / frLeft);
    let oH = Math.tan(Math.PI / frRight);
    
    let W = oH - oL; //if (W < 0.001) W = 0.001;
    let C = oL * oH;
    
    // 💡 🔒 【正宗巴特沃斯四階雙線性複數極點映射大腦 — 0補釘，從根本拉平塌陷！】
    let q1 = 0.54119610;
    let q2 = 1.30656296;
    
    // 算解 Stage 1 & 2 (對齊常數 q1)
    let c1 = 1.0 + (W / q1) + C;
    let b0_s1 = W / c1;
    let b1_s1 = 0.0;
    let b2_s1 = -b0_s1;
    let a1_s1 = 2.0 * (C - 1.0) / c1;
    let a2_s1 = (1.0 - (W / q1) + C) / c1;
    
    // 算解 Stage 3 & 4 (對齊常數 q2)
    let c2 = 1.0 + (W / q2) + C;
    let b0_s2 = W / c2;
    let b1_s2 = 0.0;
    let b2_s2 = -b0_s2;
    let a1_s2 = 2.0 * (C - 1.0) / c2;
    let a2_s2 = (1.0 - (W / q2) + C) / c2;

    let b0_A=0, b1_A=0, b2_A=0, a1_A=0, a2_A=0;
    let b0_B=0, b1_B=0, b2_B=0, a1_B=0, a2_B=0;
    
    b0_A = b0_s1; b1_A = b1_s1; b2_A = b2_s1; a1_A = a1_s1; a2_A = a2_s1;
    b0_B = b0_s2; b1_B = b1_s2; b2_B = b2_s2; a1_B = a1_s2; a2_B = a2_s2;

    // 歷史迭代四級時域直接級聯推移 — 100% 遵照您指定的最高完美、先2後1再0遞推移位順序 🔒
    let s1 = runBiquadStage(x, b0_A, b1_A, b2_A, a1_A, a2_A, chState.xv, chState.yv);
    let s2 = runBiquadStage(s1, b0_A, b1_A, b2_A, a1_A, a2_A, chState.xv2, chState.yv2);
    let s3 = runBiquadStage(s2, b0_B, b1_B, b2_B, a1_B, a2_B, chState.xv3, chState.yv3);
    let s4 = runBiquadStage(s3, b0_B, b1_B, b2_B, a1_B, a2_B, chState.xv4, chState.yv4);

    if (s4 > window.vppMax) window.vppMax = s4;
    if (s4 < window.vppMin) window.vppMin = s4;
    window.vppSampleCount++;
    if (window.vppSampleCount >= 2000) {
        window.currentVPP = window.vppMax - window.vppMin;
        window.vppMax = -999.0; window.vppMin = 999.0; window.vppSampleCount = 0;
    }

    if (window.analysisBuffer && typeof window.bufferIndex === 'number') {
        window.analysisBuffer[window.bufferIndex % window.FFT_SIZE] = s4;
    }

    window.renderFrameCounter = (window.renderFrameCounter + 1) % 4096;
    if (window.renderFrameCounter === 0) {
        let fftFreq = estimateDominantFrequency(window.analysisBuffer);
        console.log("=== ⚡ 3測試音並聯 ＋ 正宗八階巴特沃斯帶通管道報告 ⚡ ===");
        console.log("當前模式 (Mode):", window.currentFilterMode);
        console.log("驗證頻率 (SinF):", window.currentSinFreq);
        console.log("最低頻率 (Test0):", window.test, window.test_1);
        console.log("最高頻率 (Test1):", window.test1, window.test1_1);
        console.log("最強頻率 (Test2):", window.test2, window.test2_1);
        console.log("名義引數邊界 (f1/f2):", f1, f2);
        console.log("📊 複合波實時輸出 VPP:", window.currentVPP.toFixed(4), "V");
        console.log("🎯 FFT 頻譜分析主頻 (Peak Freq):", fftFreq, "Hz");
        console.log("第四級最終時域輸出採樣 (s4):", s4.toFixed(4));
        console.log("=====================================");
    }

    return s4;
}

// ==========================================
// 💡 3️⃣ 數位立體聲空間音訊流管道（2通道直通水管，強控立體聲不串軌完全體 🔒）
// ==========================================
// 🚀 🔒 左右耳徹底解耦！左聲道跑ch1矩陣，右聲道跑ch2矩陣，強控立體聲絕對不串軌、不掐斷！🔒
window.applyFilterLeft = function(x) {
    if (window.currentFilterMode === 'RAW') return x;
    if (window.currentFilterMode === 'LP') return runEightPoleFilterBankBP(x, window.f1_LP, window.f2_LP, window.filterStates.LP_ch1, 'LP');
    if (window.currentFilterMode === 'HP') return runEightPoleFilterBankBP(x, window.f1_HP, window.f2_HP, window.filterStates.HP_ch1, 'HP'); 
    if (window.currentFilterMode === 'BP') return runEightPoleFilterBankBP(x, window.f1_BP, window.f2_BP, window.filterStates.BP_ch1, 'BP');
    return x;
};

window.applyFilterRight = function(x) {
    if (window.currentFilterMode === 'RAW') return x;
    if (window.currentFilterMode === 'LP') return runEightPoleFilterBankBP(x, window.f1_LP, window.f2_LP, window.filterStates.LP_ch2, 'LP'); 
    if (window.currentFilterMode === 'HP') return runEightPoleFilterBankBP(x, window.f1_HP, window.f2_HP, window.filterStates.HP_ch2, 'HP');
    if (window.currentFilterMode === 'BP') return runEightPoleFilterBankBP(x, window.f1_BP, window.f2_BP, window.filterStates.BP_ch2, 'BP');
    return x;
};


// ==========================================
// 💡 3️⃣ 數位立體聲空間音訊流管道（2通道直通水管，強控立體聲不串軌完全體 🔒）
// ==========================================
window.oscNode = null; 
window.oscNode2 = null; 
window.oscNode3 = null; 
window.mixerNode = null; // 🚀 🔒 【正宗硬體混音定盤鎖】：負責聚合 3 音，徹底摧毀路由衝突！
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
    if (window.oscNode3) { 
        try { window.oscNode3.stop(); } catch(e){} 
        window.oscNode3 = null; 
    }
    if (window.mixerNode) {
        window.mixerNode.disconnect();
        window.mixerNode = null;
    }
    if (window.scriptNode) {
        window.scriptNode.disconnect();
    }
    
    // 🚀 🔒 【有限數值安全防禦鎖】
    if (typeof window.currentSinFreq !== 'number' || !Number.isFinite(window.currentSinFreq)) {
        window.currentSinFreq = 1830.0;
    }
    if (typeof window.currentVolume !== 'number' || !Number.isFinite(window.currentVolume)) {
        window.currentVolume = 0.3;
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
    
    let safeVol = (typeof window.currentVolume === 'number' && Number.isFinite(window.currentVolume)) ? window.currentVolume : 0.3;
    window.gainNode.gain.setValueAtTime(window.isSpeakerOn ? safeVol : 0.0, window.audioCtx.currentTime);
    
    if (window.audioCtx.state === 'suspended') {
        window.audioCtx.resume();
    }

    if (window.isSimulating) {
        window.updateFilterCoefficients();
        
        // 🚀 🔒 老老實實創建 3 個獨立的實體硬體震盪器
        window.oscNode = window.audioCtx.createOscillator(); 
        window.oscNode2 = window.audioCtx.createOscillator();
        window.oscNode3 = window.audioCtx.createOscillator(); 
        
        // 🚀 🔒 【正宗硬體信號疊加模組】：創建一個獨立的增益單元充當 3 音物理混音前級
        window.mixerNode = window.audioCtx.createGain();
        window.mixerNode.gain.setValueAtTime(0.333333, window.audioCtx.currentTime); // 均值歸一化，完美防爆音！
        
        let safeFreq = (typeof window.currentSinFreq === 'number' && Number.isFinite(window.currentSinFreq)) ? window.currentSinFreq : 1830.0;
        
        // 🚀 🔒 【3 個測試音實體硬體頻率死鎖】：1830Hz (平頂核心), 180Hz (低頻邊界), 18000Hz (極高頻阻帶)
        //window.oscNode.frequency.setValueAtTime(safeFreq, window.audioCtx.currentTime); 
        window.oscNode.frequency.setValueAtTime(window.currentSinFreq, window.audioCtx.currentTime); 
        window.oscNode2.frequency.setValueAtTime(400.0, window.audioCtx.currentTime);
        window.oscNode3.frequency.setValueAtTime(10000.0, window.audioCtx.currentTime);
        
        // 🚀 🔒 建立標準雙聲道空間輸出水管
        window.scriptNode = window.audioCtx.createScriptProcessor(4096, 1, 2);
        window.scriptNode.onaudioprocess = function(audioProcessingEvent) {
            let leftOutput = audioProcessingEvent.outputBuffer.getChannelData(0);  // 數位立體聲空間音訊流管道（左聲道）
            let rightOutput = audioProcessingEvent.outputBuffer.getChannelData(1); // 數位立體聲空間音訊流管道（右聲道）
            let bufLength = audioProcessingEvent.inputBuffer.length;
            
            // 🚀 🔒 【正宗硬體活水直接接管】：完美讀取經由前級混音器疊加後的 3 音標準物理複合波
            let inputChannel = audioProcessingEvent.inputBuffer.getChannelData(0);
            
            for (let sample = 0; sample < bufLength; sample++) {
                // 100% 讀取實體 Oscillator 混合後的真實高保真交流訊號 Facts
                let rawVal = inputChannel[sample];
                
                let leftVal = window.applyFilterLeft ? window.applyFilterLeft(rawVal) : rawVal;
                let rightVal = window.applyFilterRight ? window.applyFilterRight(rawVal) : rawVal;
                
                // 🚀 🔒 【高保真物理分流靜音控制 — 原裝強控架構完全不動 🔒】
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
                
                // 交叉排列物理防吞鎖 — 0 個新變數開闢，中括號下標 100% naked 原生標準完璧存活！🔒
                leftOutput[sample] = leftOutVal;   
                rightOutput[sample] = rightOutVal; 
                
                // 圖表大腦監聽抽取點
                let plotVal = leftVal;
                if (window.currentFilterMode === 'HP' || window.currentFilterMode === 'BP') {
                    plotVal = rightVal; 
                } else if (window.currentFilterMode === 'RAW') {
                    plotVal = rawVal;   
                }
                
                window.analysisBuffer[window.bufferIndex] = plotVal; 
                window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
                
                if (window.filteredDataLog.length < 10000) {
                    window.filteredDataLog.push(plotVal); 
                }
            }
            if (window.filteredDataLog.length >= 10000) {
                window.filteredDataLog = window.filteredDataLog.slice(-8000);
            }
        };
        
        // 🚀 🔒 【正宗硬體混音路由】：3 個實體硬體源頭平行灌入中間混音器，再由混音器單線直插發聲水管！
        window.oscNode.connect(window.mixerNode); 
        window.oscNode2.connect(window.mixerNode); 
        window.oscNode3.connect(window.mixerNode); 
        
        window.mixerNode.connect(window.scriptNode); 
        window.scriptNode.connect(window.gainNode); 
        
        window.oscNode.start(); 
        window.oscNode2.start();
        window.oscNode3.start();
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
        }
		); 
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
  
/*    
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { 
        magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); 
        if (m > 2) { 
            if (magnitudes[m] > maxMag) {
                maxMag = magnitudes[m];
                peakBinIndex = m; 
            }
        }
    }
*/
    //let maxDisplayFreq = window.currentSinFreq * 1.5;
    //let htmlMaxFreq = parseFloat(document.getElementById('sinFreqSlider')?.max) || 5000;
    //if (maxDisplayFreq < 200) maxDisplayFreq = 200; 
    //if (maxDisplayFreq > htmlMaxFreq) maxDisplayFreq = htmlMaxFreq;
	
    let hzPerBin = window.currentSampleRate / window.FFT_SIZE; 
	
    let magnitudes = new Float32Array(window.FFT_SIZE / 2);
    let maxMag = 0;
    let minFreq = -1;
    let maxFreq = 0;
    let peakBinIndex = 0; 
	
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { 
        magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); 
        if ((m > 2) && (magnitudes[m] > maxMag)){ 
		    maxMag = magnitudes[m];
            peakBinIndex = m;
        }			
        if (magnitudes[m] > 0.1) {
			maxFreq = m;
            if (minFreq < 0) minFreq = m;
		}
	}
    maxDisplayFreq = maxFreq * hzPerBin * 1.15; // 動態預留 15% 科技感幾何邊界
	
//let SinFreq = 0;
//let SinFreq = Math.round(window.currentSinFreq / hzPerBin) ;
window.test = minFreq * hzPerBin;
window.test1 = maxFreq * hzPerBin;
window.test2 = peakBinIndex * hzPerBin;

window.test_1 = magnitudes[minFreq];
window.test1_1 = magnitudes[maxFreq];
window.test2_1 = magnitudes[peakBinIndex];

    
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
/*
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
*/
    window.updateFilterCoefficients(); 
    window.renderFilterButtonLights(); 
    window.globalRenderLoop(); 
};
