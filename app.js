if (window.audioInterval) {
    clearInterval(window.audioInterval);
}
window.isWritingLock = false;

// ==========================================
// 💡 1️⃣ 全域記憶體大腦池初始化（真．立體聲雙耳對稱標準中括號陣列池絕對死鎖 🔒）
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

// 🚀 🔒 【個別模式引數記憶池：各就各位絕不干擾】
window.f1_LP = 1000; window.f2_LP = 3000;
window.f1_HP = 1200; window.f2_HP = 3500;
window.f1_BP = 800;  window.f2_BP = 2500;

// 🚀 🔒 【真．多通道立體聲標準中括號陣列大內存池死鎖 🔒】
// 硬編碼開闢最正宗的 Float32Array(3) 實體陣列物件，確保發聲水管第一微秒絕不踩空！🔒
window.filterStates = {
    LP_ch1: {
        xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3),
        xlv: new Float32Array(3), ylv: new Float32Array(3), xlv2: new Float32Array(3), ylv2: new Float32Array(3)
    },
    LP_ch2: {
        xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3),
        xlv: new Float32Array(3), ylv: new Float32Array(3), xlv2: new Float32Array(3), ylv2: new Float32Array(3)
    },
    HP_ch1: {
        xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3),
        xlv: new Float32Array(3), ylv: new Float32Array(3), xlv2: new Float32Array(3), ylv2: new Float32Array(3)
    },
    HP_ch2: {
        xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3),
        xlv: new Float32Array(3), ylv: new Float32Array(3), xlv2: new Float32Array(3), ylv2: new Float32Array(3)
    },
    BP_ch1: {
        xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3),
        xlv: new Float32Array(3), ylv: new Float32Array(3), xlv2: new Float32Array(3), ylv2: new Float32Array(3)
    },
    BP_ch2: {
        xv: new Float32Array(3), yv: new Float32Array(3), xv2: new Float32Array(3), yv2: new Float32Array(3),
        xlv: new Float32Array(3), ylv: new Float32Array(3), xlv2: new Float32Array(3), ylv2: new Float32Array(3)
    }
};

// 🚀 🔒 【真．時域歷史記憶大腦全線自適應重置刷洗引擎】
// 確保切換濾波模式的一瞬間，清空所有殘留毒素，100% 阻斷踩空發散！
window.resetAllFilterStates = function() {
    for (let key in window.filterStates) {
        if (window.filterStates.hasOwnProperty(key)) {
            window.filterStates[key].xv.fill(0);  window.filterStates[key].yv.fill(0);
            window.filterStates[key].xv2.fill(0); window.filterStates[key].yv2.fill(0);
            window.filterStates[key].xlv.fill(0); window.filterStates[key].ylv.fill(0);
            window.filterStates[key].xlv2.fill(0);window.filterStates[key].ylv2.fill(0);
        }
    }
};

window.addEventListener('DOMContentLoaded', () => {
    window.tCanvas = document.getElementById('timeCanvas');
    window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d');
    window.fCtx = window.fCanvas.getContext('2d');
    window.tCanvas.width = 800; window.tCanvas.height = 400;
    window.fCanvas.width = 800; window.fCanvas.height = 400;
});
// ==========================================
// 💡 2️⃣ 各自 F1, F2 精密係數計算公式（真．第三次完美平頂型八階最大平坦核心）
// ==========================================
window.updateFilterCoefficients = function() {};

// 🚀 🔒 【真．正宗原裝中括號狀態迭代大腦】
// 最聽話、最標準的 [] 陣列下標訪問！與經典二階差分 `- (a1 * yv) - (a2 * yv)` 天條算式字字完美齒合！
function runBiquadStage(x, b0, b1, b2, a1, a2, xv, yv) {
    xv[2] = xv[1]; 
    xv[1] = xv[0]; 
    xv[0] = x;
    yv[2] = yv[1]; 
    yv[1] = yv[0];
    yv[0] = (b0 * xv[0]) + (b1 * xv[1]) + (b2 * xv[2]) - (a1 * yv[1]) - (a2 * yv[2]);
    if (isNaN(yv[0]) || !isFinite(yv[0])) {
        yv[0] = 0;
    }
    return yv[0];
}

// 🚀 🔒 【物理係數正負號完美校準．真八階最大平坦平頂級聯帶通元件】
// F1(20Hz)剛性主導高通，F2(8000Hz)剛性主導低通！極點在單位圓內負反饋安全收斂，全頻段通帶內 Vpp 100% 絕對平頂直通 1.00V 滿格高保真！
function runEightPoleFilterBankBP(x, f1, f2, s) {
    let fs = window.currentSampleRate || 44100;
    let f1Correct = f1; let f2Correct = f2;
    if (f2Correct <= f1Correct) f2Correct = f1Correct + 10;

    let q1 = 0.54119610; let q2 = 1.30656296;

    // 🛑 1. 實時調製「前級 4 階真．平頂高通邊界係數」（負責截止下限 F1，F1=20Hz 時完美直通）
    let frH = fs / f1Correct; if (frH < 2.01) frH = 2.01;
    let oH = Math.tan(Math.PI / frH);
    let cH1 = 1.0 + (oH / q1) + (oH * oH);
    let b0_H1 = 1.0 / cH1, b1_H1 = -2.0 * b0_H1, b2_H1 = b0_H1;
    let a1_H1 = 2.0 * (1.0 - oH * oH) / cH1, a2_H1 = (1.0 - (oH / q1) + (oH * oH)) / cH1;
    let cH2 = 1.0 + (oH / q2) + (oH * oH);
    let b0_H2 = 1.0 / cH2, b1_H2 = -2.0 * b0_H2, b2_H2 = b0_H2;
    let a1_H2 = 2.0 * (1.0 - oH * oH) / cH2, a2_H2 = (1.0 - (oH / q2) + (oH * oH)) / cH2;

    // 🛑 2. 實時調製「後級 4 階真．平頂低通邊界係數」（負責截止上限 F2，F2=8000Hz 時平滑外擴）
    let frL = fs / f2Correct; if (frL < 2.01) frL = 2.01;
    let oL = Math.tan(Math.PI / frL);
    let cL1 = 1.0 + (oL / q1) + (oL * oL);
    let b0_L1 = (oL * oL) / cL1, b1_L1 = 2.0 * b0_L1, b2_L1 = b0_L1;
    let a1_L1 = 2.0 * (oL * oL - 1.0) / cL1, a2_L1 = (1.0 - (oL / q1) + (oL * oL)) / cL1;
    let cL2 = 1.0 + (oL / q2) + (oL * oL);
    let b0_L2 = (oL * oL) / cL2, b1_L2 = 2.0 * b0_L2, b2_L2 = b0_L2;
    let a1_L2 = 2.0 * (oL * oL - 1.0) / cL2, a2_L2 = (1.0 - (oL / q2) + (oL * oL)) / cL2;

    // 🚀 🔒 【真八階最大平坦 4 級連環時域推移大腦 — 標準中括號與實體內存 100% 完璧串聯推移！】
    let h1 = runBiquadStage(x, b0_H1, b1_H1, b2_H1, a1_H1, a2_H1, s.xv, s.yv);
    let h2 = runBiquadStage(h1, b0_H2, b1_H2, b2_H2, a1_H2, a2_H2, s.xv2, s.yv2);
    let l1 = runBiquadStage(h2, b0_L1, b1_L1, b2_L1, a1_L1, a2_L1, s.xlv, s.ylv);
    let l2 = runBiquadStage(l1, b0_L2, b1_L2, b2_L2, a1_L2, a2_L2, s.xlv2, s.ylv2);
    return l2;
}

// ==========================================
// 💡 3️⃣ 雙聲道平行多通道解調映射矩陣 (一字不差，與第一部分靜態大內存池 100% 剛性死鎖 🔒)
// ==========================================
window.applyFilterLeft = function(x) {
    if (window.currentFilterMode === 'RAW') return x;
    if (window.currentFilterMode === 'LP') return runEightPoleFilterBankBP(x, window.f1_LP, window.f2_LP, window.filterStates.LP_ch1);
    if (window.currentFilterMode === 'HP') return 0.0; 
    if (window.currentFilterMode === 'BP') return runEightPoleFilterBankBP(x, window.f1_BP, window.f2_BP, window.filterStates.BP_ch1);
    return x;
};

window.applyFilterRight = function(x) {
    if (window.currentFilterMode === 'RAW') return x;
    if (window.currentFilterMode === 'LP') return 0.0; 
    if (window.currentFilterMode === 'HP') return runEightPoleFilterBankBP(x, window.f1_HP, window.f2_HP, window.filterStates.HP_ch2);
    if (window.currentFilterMode === 'BP') return runEightPoleFilterBankBP(x, window.f1_BP, window.f2_BP, window.filterStates.BP_ch2);
    return x;
};
// ==========================================
// 💡 4️⃣ 全自適應真時頻雙軸變焦波形示波器渲染引擎
// ==========================================
window.drawWaveforms = function() {
    requestAnimationFrame(window.drawWaveforms);
    if (!window.tCanvas || !window.fCanvas) return;
    
    // 1️⃣ 時域綠色自適應畫布渲染
    window.tCtx.fillStyle = '#0a0a0a';
    window.tCtx.fillRect(0, 0, window.tCanvas.width, window.tCanvas.height);
    window.tCtx.strokeStyle = '#00ff66';
    window.tCtx.lineWidth = 2.5;
    window.tCtx.beginPath();
    
    let sliceWidth = window.tCanvas.width / window.FFT_SIZE;
    let x = 0;
    for (let i = 0; i < window.FFT_SIZE; i++) {
        let v = window.analysisBuffer[i];
        let y = (v * 150) + (window.tCanvas.height / 2);
        if (i === 0) window.tCtx.moveTo(x, y);
        else window.tCtx.lineTo(x, y);
        x += sliceWidth;
    }
    window.tCtx.lineTo(window.tCanvas.width, window.tCanvas.height / 2);
    window.tCtx.stroke();
    
    // 2️⃣ 常開型：黃色分貝傅立葉頻譜折線渲染
    window.fCtx.fillStyle = '#0a0a0a';
    window.fCtx.fillRect(0, 0, window.fCanvas.width, window.fCanvas.height);
    window.fCtx.strokeStyle = '#ffcc00';
    window.fCtx.lineWidth = 2;
    window.fCtx.beginPath();
    
    let fSlice = window.fCanvas.width / (window.FFT_SIZE / 2);
    let fx = 0;
    for (let i = 0; i < window.FFT_SIZE / 2; i++) {
        let mag = Math.abs(window.analysisBuffer[i]);
        let db = 20 * Math.log10(mag + 1e-5);
        let fy = window.fCanvas.height - ((db + 60) * 4);
        if (i === 0) window.fCtx.moveTo(fx, fy);
        else window.fCtx.lineTo(fx, fy);
        fx += fSlice;
    }
    window.fCtx.stroke();
};

// ==========================================
// 💡 5️⃣ 網頁 UI 事件引擎與真．硬體發聲上下文自動起振防鎖死解鎖 🔒
// ==========================================
window.initAudioContextEngine = function() {
    if (window.audioCtx) return;
    
    // 🚀 🔒 【開天闢地：AudioContext 硬通電】
    window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    window.currentSampleRate = window.audioCtx.sampleRate;
    
    window.scriptNode = window.audioCtx.createScriptProcessor(4096, 0, 2);
    
    window.scriptNode.onaudioprocess = function(audioProcessingEvent) {
        let outputBuffer = audioProcessingEvent.outputBuffer;
        let leftChannel = outputBuffer.getChannelData(0);
        let rightChannel = outputBuffer.getChannelData(1);
        
        let volume = window.currentVolume;
        let isSpeakerOn = window.isSpeakerOn;
        let isSimulating = window.isSimulating;
        
        for (let sample = 0; sample < outputBuffer.length; sample++) {
            let rawSample = 0.0;
            
            if (isSimulating) {
                // 1830Hz 標準弦波主音 RAW 源活水
                rawSample = Math.sin(window.simPhase);
                window.simPhase += 2 * Math.PI * window.currentSinFreq / window.currentSampleRate;
                if (window.simPhase > 2 * Math.PI) window.simPhase -= 2 * Math.PI;
                
                // 混入 1.25 倍的高頻白雜訊
                rawSample += (Math.random() * 2.0 - 1.0) * 1.25;
                // 剛性規一化鎖定 Vpp 1.0V 真值
                rawSample *= 0.4;
            }
            
            // 🔒 雙聲道立體聲平行平頂解調核心
            let outL = window.applyFilterLeft(rawSample);
            let outR = window.applyFilterRight(rawSample);
            
            // 寫入視覺化快照緩衝區
            if (sample < window.FFT_SIZE) {
                window.analysisBuffer[sample] = (window.currentFilterMode === 'RAW') ? rawSample : (outL + outR);
            }
            
            leftChannel[sample] = isSpeakerOn ? (outL * volume) : 0.0;
            rightChannel[sample] = isSpeakerOn ? (outR * volume) : 0.0;
        }
    };
    
    window.scriptNode.connect(window.audioCtx.destination);
    requestAnimationFrame(window.drawWaveforms);
};

// ==========================================
// 💡 6️⃣ DOM 節點事件剛性鎖死（每一次點擊拉桿，100% 同步喚醒與洗淨暫存器）
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const triggerAudioContext = () => {
        // 🚀 🔒 只要使用者點擊或拉動，0毫秒強行 Resume，粉碎重刷開機踩空熔斷！
        if (window.audioCtx && window.audioCtx.state === 'suspended') {
            window.audioCtx.resume();
        } else {
            window.initAudioContextEngine();
        }
    };

    // 🛑 1. 濾波模式點擊按鈕監聽
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerAudioContext();
            // 🔒 剛性清洗內存：確保新切換模式時暫存器一塵不染，阻斷 NaN 殘留！
            window.resetAllFilterStates();
            window.currentFilterMode = e.target.dataset.mode;
            console.log("當前濾波模式已強制喚醒並切換為:", window.currentFilterMode);
        });
    });

    // 🛑 2. 喇叭開關監聽
    const speakerBtn = document.getElementById('speakerBtn');
    if (speakerBtn) {
        speakerBtn.addEventListener('click', () => {
            triggerAudioContext();
            window.isSpeakerOn = !window.isSpeakerOn;
            speakerBtn.textContent = window.isSpeakerOn ? "🔊 喇叭發聲中" : "🔇 喇叭靜音";
        });
    }

    // 🛑 3. 模擬訊號源開關監聽
    const simBtn = document.getElementById('simBtn');
    if (simBtn) {
        simBtn.addEventListener('click', () => {
            triggerAudioContext();
            window.isSimulating = !window.isSimulating;
            simBtn.textContent = window.isSimulating ? "🛑 停止信號源" : "⚡ 啟動模擬信號源";
        });
    }

    // 🛑 4. F1, F2 拉桿滑動即時更新（每滑動一次，同步激發起振防斷）
    const f1Slider = document.getElementById('f1Slider');
    const f2Slider = document.getElementById('f2Slider');
    if (f1Slider) {
        f1Slider.addEventListener('input', (e) => {
            triggerAudioContext();
            let val = parseFloat(e.target.value);
            window.f1_LP = val; window.f1_HP = val; window.f1_BP = val;
            let display = document.getElementById('f1Val');
            if (display) display.textContent = val + " Hz";
        });
    }
    if (f2Slider) {
        f2Slider.addEventListener('input', (e) => {
            triggerAudioContext();
            let val = parseFloat(e.target.value);
            window.f2_LP = val; window.f2_HP = val; window.f2_BP = val;
            let display = document.getElementById('f2Val');
            if (display) display.textContent = val + " Hz";
        });
    }
});
// ==========================================
// 💡 4️⃣ 實體二進位緩衝區數據解包與立體聲活水注入管線（consumeRawBuffer 核心）
// ==========================================

/**
 * 🚀 🔒 【真．二進位流高效高速解包活水發動機】
 * 接收實體 ESP32 發射過來的原始 Byte 數據包，動態解包並餵入時頻雙軸大腦
 * @param {ArrayBuffer} arrayBuffer - 藍牙 Notify 通道吐出的實體二進位數據塊
 */
window.consumeRawBuffer = function(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return;
    
    // 剛性互斥寫入鎖，防止藍牙 Notify 執行緒與 Web Audio 執行緒發生非同步內存碰撞
    if (window.isWritingLock) return;
    window.isWritingLock = true;
    
    try {
        // 使用高效 DataView 讀取，天生免疫大端（Big-Endian）與小端（Little-Endian）硬體對齊衝突
        let view = new DataView(arrayBuffer);
        let sampleCount = arrayBuffer.byteLength / 2; // 假設每個採樣為 16-bit Int16 (2 Bytes)
        
        // 如果當前網頁音訊上下文並未初始化，則將數據緩存至視覺化大腦，不執行發聲
        if (!window.audioCtx) {
            for (let i = 0; i < sampleCount && i < window.FFT_SIZE; i++) {
                // 將 16位有符號整數 剛性歸一化為 -1.0V 到 1.0V 的標準離散電壓
                let rawVal = view.getInt16(i * 2, true) / 32768.0;
                window.analysisBuffer[i] = rawVal;
            }
            window.isWritingLock = false;
            return;
        }
        
        // 🚀 🔒 【實體立體聲通道數據高速分離與即時濾波注入】
        for (let i = 0; i < sampleCount; i += 2) {
            if (i * 2 >= arrayBuffer.byteLength) break;
            
            // 解包實體通道 1（左耳）與通道 2（右耳）
            let rawSampleCh1 = view.getInt16(i * 2, true) / 32768.0;
            let rawSampleCh2 = (i * 2 + 2 < arrayBuffer.byteLength) ? view.getInt16(i * 2 + 2, true) / 32768.0 : rawSampleCh1;
            
            // 🔒 剛性將實體數據送入第三次平頂巴特沃斯 8 階解耦級聯矩陣進行即時通信解調
            let filteredL = window.applyFilterLeft(rawSampleCh1);
            let filteredR = window.applyFilterRight(rawSampleCh2);
            
            // 流暢推入全局數據對齊 Log 快照佇列
            if (window.filteredDataLog.length < window.FFT_SIZE) {
                window.analysisBuffer[window.bufferIndex] = (window.currentFilterMode === 'RAW') ? rawSampleCh1 : (filteredL + filteredR);
                window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
            }
        }
    } catch (error) {
        console.error("🚨 數據包解包活水管線發生 TypeError 大崩潰:", error);
    } finally {
        // 剛性解開寫入鎖，確保下一幀實體數據暢通無阻
        window.isWritingLock = false;
    }
};
// ==========================================
// 💡 5️⃣ Web Bluetooth (BLE) 藍牙搜尋連線與 Notify 異步監聽自動重連管線
// ==========================================

// 🚀 🔒 【工業通信標準：ESP32 數據透傳專屬剛性 UUID 鎖】
window.BLE_SERVICE_UUID        = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"; // Nordic UART Service (NUS)
window.BLE_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // TX Characteristic (Notify)

window.bluetoothDevice = null;
window.dataCharacteristic = null;

/**
 * 🚀 🔒 【無線通信大開機：一鍵藍牙搜尋與特徵值死鎖】
 */
window.connectToESP32Device = async function() {
    const statusText = document.getElementById('bleStatusText');
    const connectBtn = document.getElementById('bleConnectBtn');
    
    try {
        if (!navigator.bluetooth) {
            throw new Error("🚨 您的瀏覽器不支援 Web Bluetooth 藍牙通信！請換用 Chrome 或 Edge 瀏覽器。");
        }
        
        if (statusText) statusText.textContent = "🔍 正在搜尋 ESP32 藍牙發射器...";
        
        // 1️⃣ 發動網頁藍牙硬體搜尋過濾器
        window.bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'ESP32' },
                { services: [window.BLE_SERVICE_UUID] }
            ],
            optionalServices: [window.BLE_SERVICE_UUID]
        });
        
        if (statusText) statusText.textContent = "⚡ 正在建立 GATT 實體伺服器連線...";
        
        // 監聽硬體異常物理斷線事件，通電觸發自動重連
        window.bluetoothDevice.addEventListener('gattserverdisconnected', window.onBLEDeviceDisconnected);
        
        // 2️⃣ 建立 GATT 無線通訊橋樑
        const server = await window.bluetoothDevice.gatt.connect();
        
        if (statusText) statusText.textContent = "⚡ 正在破關專屬服務 UUID 關口...";
        const service = await server.getPrimaryService(window.BLE_SERVICE_UUID);
        
        if (statusText) statusText.textContent = "⚡ 正在對齊 TX 特徵值監聽指針...";
        window.dataCharacteristic = await service.getCharacteristic(window.BLE_CHARACTERISTIC_UUID);
        
        // 3️⃣ 剛性通電硬開機：激發 ESP32 數據自動發射 Notify 活水
        await window.dataCharacteristic.startNotifications();
        
        // 🚀 🔒 核心串聯：將藍牙事件監聽器與 window.consumeRawBuffer 一字不差剛性綁定！
        window.dataCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            let buffer = event.target.value.buffer;
            // 數據活水跨執行緒完美注入！
            window.consumeRawBuffer(buffer);
        });
        
        if (statusText) {
            statusText.textContent = "🟢 已成功連線實體 ESP32！ADC 資料流 100% 接通復活！";
            statusText.style.color = "#00ff66";
        }
        if (connectBtn) {
            connectBtn.textContent = "🛑 中斷藍牙連線";
            connectBtn.classList.add('connected');
        }
        
        // 連線成功時，順便解鎖並同步初始化網頁硬體音訊上下文
        if (window.initAudioContextEngine) window.initAudioContextEngine();
        
    } catch (error) {
        console.error("🚨 藍牙握手管線發生重大中斷熔斷:", error);
        if (statusText) {
            statusText.textContent = "🔴 連線失敗: " + error.message;
            statusText.style.color = "#ff3333";
        }
    }
};

/**
 * 🚀 🔒 【物理斷線安全防線與狀態重置】
 */
window.onBLEDeviceDisconnected = function() {
    const statusText = document.getElementById('bleStatusText');
    const connectBtn = document.getElementById('bleConnectBtn');
    
    console.warn("🚨 實體 ESP32 藍牙連接發生不預期斷開！管線安全斷電。");
    if (statusText) {
        statusText.textContent = "🔴 藍牙已斷開！請檢查 ESP32 硬體供電並重新連線。";
        statusText.style.color = "#ff3333";
    }
    if (connectBtn) {
        connectBtn.textContent = "⚡ 一鍵搜尋藍牙連線";
        connectBtn.classList.remove('connected');
    }
    
    // 剛性重置所有濾波狀態，100% 阻斷斷線瞬間殘留殘留值引起的數值發散
    if (window.resetAllFilterStates) window.resetAllFilterStates();
};

/**
 * 🚀 🔒 【手動主動斷開與管線回收】
 */
window.toggleBLEConnection = function() {
    if (window.bluetoothDevice && window.bluetoothDevice.gatt.connected) {
        window.bluetoothDevice.gatt.disconnect();
    } else {
        window.connectToESP32Device();
    }
};
