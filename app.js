// Helper to format large numbers
const numFormatter = new Intl.NumberFormat('en-US');

// Moro's Inverse Normal CDF Approximation for the Upper Tail
// Returns the Z-score for a given extreme tail probability
function zScoreFromTailP(tailP) {
    if (tailP >= 0.5) return 0;
    
    // We only need the extreme tail branch
    const q = Math.sqrt(-2 * Math.log(tailP));
    
    const c = [
        -0.007784894002430293, 
        -0.3223964580411365, 
        -2.400758277161838, 
        -2.549732539343734, 
        4.374664141464968, 
        2.938163982698783
    ];
    
    const d = [
        0.007784695709041462, 
        0.3224671290700398, 
        2.445134137142996, 
        3.754408661907416
    ];
    
    const val = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / 
               ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
               
    return -val; 
}

function updateCalculator() {
    // 1. Get Array Specs
    const sizeMB = parseFloat(document.getElementById('cacheSize').value) || 0;
    let yieldTarget = parseFloat(document.getElementById('yieldTarget').value) || 0;
    
    // Safety Clamps for Math limits
    if (yieldTarget >= 100) yieldTarget = 99.999999;
    if (yieldTarget <= 0) yieldTarget = 0.0001;
    if (sizeMB <= 0) return;
    
    const N = sizeMB * 1024 * 1024 * 8; // total bits
    const Y = yieldTarget / 100.0;
    
    // Calculate P_fail per cell. Using identity 1 - Y^(1/N) approx -ln(Y)/N
    const tailP = -Math.log(Y) / N;
    
    // Calculate Z score distance from mean
    const zScore = zScoreFromTailP(tailP);
    
    // 2. Get Base Cell Specs at 25C
    const rMuBase = parseFloat(document.getElementById('readMu').value) || 0;
    const rSig = parseFloat(document.getElementById('readSigma').value) || 0;
    
    const wMuBase = parseFloat(document.getElementById('writeMu').value) || 0;
    const wSig = parseFloat(document.getElementById('writeSigma').value) || 0;
    
    const retMuBase = parseFloat(document.getElementById('retMu').value) || 0;
    const retSig = parseFloat(document.getElementById('retSigma').value) || 0;

    const ebMuBase = parseFloat(document.getElementById('ebMu').value) || 0;
    const ebSig = parseFloat(document.getElementById('ebSigma').value) || 0;

    let temperature = parseFloat(document.getElementById('temperature').value);
    if(isNaN(temperature)) temperature = 25;
    if(temperature > 500) temperature = 500; // Physical Clamp
    if(temperature < -273) temperature = -273; // Physical Clamp
    const deltaT = temperature - 25;
    
    let lifetime = parseFloat(document.getElementById('lifetime').value);
    if(isNaN(lifetime)) lifetime = 0;
    if(lifetime > 100) lifetime = 100;
    if(lifetime < 0) lifetime = 0;
    // Lifetime aging coefficient: +5 mV per year degradation for Read, Retention, and EB.
    const ageDegradation = lifetime * 5;

    // Apply scaling coefficients based on physical modeling
    // Write Vmin reduces by ~0.4mV/C, Read Vmin increases by ~0.2mV/C, Retention by ~0.4mV/C
    const rMu = rMuBase + (deltaT * 0.2) + ageDegradation;
    const wMu = wMuBase + (deltaT * -0.4);
    const retMu = retMuBase + (deltaT * 0.4) + ageDegradation;
    const ebMu = ebMuBase + (deltaT * 0.2) + ageDegradation;

    // 3. Compute limits
    const readVccmin = rMu + zScore * rSig;
    const writeVccmin = wMu + zScore * wSig;
    const retVccmin = retMu + zScore * retSig;
    const ebVccmin = ebMu + zScore * ebSig;
    
    // 4. Update UI labels
    document.getElementById('totalBitsLabel').textContent = numFormatter.format(Math.round(N));
    document.getElementById('pFailLabel').textContent = tailP.toExponential(4);
    document.getElementById('zScoreLabel').textContent = zScore.toFixed(3) + 'σ';
    
    document.getElementById('readVminOut').textContent = Math.round(readVccmin) + ' mV';
    document.getElementById('writeVminOut').textContent = Math.round(writeVccmin) + ' mV';
    document.getElementById('retVminOut').textContent = Math.round(retVccmin) + ' mV';
    document.getElementById('ebVminOut').textContent = Math.round(ebVccmin) + ' mV';
    
    // Determine overall cache Vccmin
    const maxVccmin = Math.max(readVccmin, writeVccmin, retVccmin, ebVccmin);
    let limiter = "---";
    if (maxVccmin === readVccmin) limiter = "Read Vmin (SNM)";
    else if (maxVccmin === writeVccmin) limiter = "Write Vmin (WM)";
    else if (maxVccmin === retVccmin) limiter = "Retention (DRV)";
    else limiter = "Erratic Bit";
    
    document.getElementById('cacheVccminOut').textContent = Math.round(maxVccmin) + ' mV';
    document.getElementById('limiterType').textContent = limiter;
    
    // 5. Animate Bars - Normalize to 1000mV or the max if > 1000
    const scaleMax = Math.max(1000, maxVccmin + 50);
    
    document.getElementById('readFill').style.width = Math.min(100, (readVccmin / scaleMax) * 100) + '%';
    document.getElementById('writeFill').style.width = Math.min(100, (writeVccmin / scaleMax) * 100) + '%';
    document.getElementById('retFill').style.width = Math.min(100, (retVccmin / scaleMax) * 100) + '%';
    document.getElementById('ebFill').style.width = Math.min(100, (ebVccmin / scaleMax) * 100) + '%';
    
    // 6. Update Distribution Chart
    if (typeof Chart !== 'undefined') {
        updateChart(rMu, rSig, wMu, wSig, retMu, retSig, ebMu, ebSig, maxVccmin, zScore);
    }
}

// Bind Events
const yieldInput = document.getElementById('yieldTarget');
const dpmInput = document.getElementById('dpmTarget');
let syncLock = false;

yieldInput.addEventListener('input', (e) => {
    if(syncLock) return;
    syncLock = true;
    let y = parseFloat(yieldInput.value);
    if(!isNaN(y)) {
        if(y >= 100) y = 99.9999;
        if(y <= 0) y = 0.0001;
        dpmInput.value = ((100 - y) * 10000).toFixed(0);
    }
    syncLock = false;
});

dpmInput.addEventListener('input', (e) => {
    if(syncLock) return;
    syncLock = true;
    let d = parseFloat(dpmInput.value);
    if(!isNaN(d)) {
        if(d < 0.1) d = 0.1;
        if(d >= 1000000) d = 999999;
        yieldInput.value = (100 - (d / 10000)).toFixed(4);
    }
    syncLock = false;
});

const inputs = document.querySelectorAll('input');
inputs.forEach(input => {
    input.addEventListener('input', updateCalculator);
});

// Will be called at the bottom

let distributionChart = null;

const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw: (chart) => {
        const vccmin = chart.config.options.plugins.verticalLine?.vccmin;
        if (!vccmin) return;
        
        const xAxis = chart.scales.x;
        const yAxis = chart.scales.y;
        
        const xPos = xAxis.getPixelForValue(vccmin);
        // Only draw if inside chart area
        if (xPos >= xAxis.left && xPos <= xAxis.right) {
            const ctx = chart.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(xPos, yAxis.top);
            ctx.lineTo(xPos, yAxis.bottom);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#f59e0b';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            
            // Text label
            ctx.fillStyle = '#fca5a5';
            ctx.font = 'bold 12px Outfit';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(`Cache Vccmin Limit: ${Math.round(vccmin)} mV`, xPos - 8, yAxis.top + 8);
            ctx.restore();
        }
    }
};

if (typeof Chart !== 'undefined') {
    Chart.register(verticalLinePlugin);
}

function generateGaussianData(mu, sigma, xValues) {
    return xValues.map(x => {
        const exponent = -Math.pow(x - mu, 2) / (2 * Math.pow(sigma, 2));
        const coeff = 1 / (sigma * Math.sqrt(2 * Math.PI));
        return coeff * Math.exp(exponent);
    });
}

function updateChart(rMu, rSig, wMu, wSig, retMu, retSig, ebMu, ebSig, cacheVccmin, zScore) {
    const ctx = document.getElementById('distributionChart').getContext('2d');
    
    // Generate X values (e.g., 200 to 1200 mV)
    const minVal = Math.min(rMu - 4*rSig, wMu - 4*wSig, retMu - 4*retSig, ebMu - 4*ebSig, 250);
    const maxVal = Math.max(rMu + zScore*rSig + 3*rSig, wMu + zScore*wSig + 3*wSig, retMu + zScore*retSig + 3*retSig, ebMu + zScore*ebSig + 3*ebSig, cacheVccmin + 50);
    
    const xValues = [];
    for (let x = Math.floor(minVal); x <= Math.ceil(maxVal); x += 2) {
        xValues.push(x);
    }
    
    const readData = generateGaussianData(rMu, rSig, xValues);
    const writeData = generateGaussianData(wMu, wSig, xValues);
    const retData = generateGaussianData(retMu, retSig, xValues);
    const ebData = generateGaussianData(ebMu, ebSig, xValues);
    
    const data = {
        labels: xValues,
        datasets: [
            {
                label: `Read Vmin (μ=${rMu})`,
                data: readData,
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.4
            },
            {
                label: `Write Vmin (μ=${wMu})`,
                data: writeData,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.4
            },
            {
                label: `Retention Vmin (μ=${retMu})`,
                data: retData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.4
            },
            {
                label: `Erratic Bit Vmin (μ=${ebMu})`,
                data: ebData,
                borderColor: '#f43f5e',
                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.4
            }
        ]
    };

    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                verticalLine: { vccmin: cacheVccmin },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            return `Voltage: ${context[0].label} mV`;
                        },
                        label: function(context) {
                            if (context.raw < 1e-10) return null;
                            return `${context.dataset.label}: ${context.raw.toExponential(2)}`;
                        }
                    }
                },
                legend: {
                    labels: { color: '#e2e8f0', font: { family: 'Outfit', size: 13 } }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Vmin Limit required for cell (mV)', color: '#94a3b8', font: {family: 'Outfit'} },
                    ticks: { color: '#94a3b8', maxTicksLimit: 15 },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    title: { display: true, text: 'Probability Density', color: '#94a3b8', font: {family: 'Outfit'} },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        }
    };

    if (distributionChart) {
        distributionChart.destroy();
    }
    distributionChart = new Chart(ctx, config);
}

// Initial call
updateCalculator();
