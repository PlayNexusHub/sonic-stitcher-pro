export interface AnalysisSummary {
  bpm: number;
  bpmAlt: number;
  bpmConfidence: number;
  camelot: string;
  keySemitone: number;
  keyConfidence: number;
  beatTimes: Float32Array;
  downbeatIndices: Uint32Array;
  phraseSpans: Array<[number, number]>;
  energyCurve: Float32Array;
  vocalLikelihood: Float32Array;
  kickTimes: Float32Array;
}

// Key to Camelot mapping
const KEY_TO_CAMELOT: { [key: number]: string } = {
  0: '8B', 1: '3B', 2: '10B', 3: '5B', 4: '12B', 5: '7B',
  6: '2B', 7: '9B', 8: '4B', 9: '11B', 10: '6B', 11: '1B',
  12: '5A', 13: '12A', 14: '7A', 15: '2A', 16: '9A', 17: '4A',
  18: '11A', 19: '6A', 20: '1A', 21: '8A', 22: '3A', 23: '10A'
};

export const analyzeTrack = async (buffer: AudioBuffer): Promise<AnalysisSummary> => {
  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  // Beat detection via spectral flux
  const beats = detectBeats(channelData, sampleRate);
  const bpmData = calculateBPM(beats, sampleRate);
  const downbeats = detectDownbeats(beats, bpmData.bpm);
  const phrases = detectPhrases(beats, downbeats);

  // Key detection
  const keyData = detectKey(buffer);

  // Energy analysis
  const energy = analyzeEnergy(channelData, sampleRate);

  // Vocal likelihood
  const vocalProb = estimateVocalPresence(buffer);

  // Kick detection
  const kicks = detectKicks(channelData, sampleRate, beats);

  return {
    bpm: bpmData.bpm,
    bpmAlt: bpmData.bpmAlt,
    bpmConfidence: bpmData.confidence,
    camelot: KEY_TO_CAMELOT[keyData.key] || '1A',
    keySemitone: keyData.key % 12,
    keyConfidence: keyData.confidence,
    beatTimes: new Float32Array(beats),
    downbeatIndices: new Uint32Array(downbeats),
    phraseSpans: phrases,
    energyCurve: energy,
    vocalLikelihood: vocalProb,
    kickTimes: new Float32Array(kicks)
  };
};

function detectBeats(data: Float32Array, sampleRate: number): number[] {
  const beats: number[] = [];
  const hopSize = 512;
  const windowSize = 2048;
  const spectralFlux: number[] = [];

  // Calculate spectral flux
  let prevSpectrum: Float32Array | null = null;
  
  for (let i = 0; i < data.length - windowSize; i += hopSize) {
    const window = data.slice(i, i + windowSize);
    const spectrum = fft(window);
    
    if (prevSpectrum) {
      let flux = 0;
      for (let j = 0; j < spectrum.length; j++) {
        const diff = Math.max(0, spectrum[j] - prevSpectrum[j]);
        flux += diff * diff;
      }
      spectralFlux.push(Math.sqrt(flux));
    }
    prevSpectrum = spectrum;
  }

  // Peak picking with adaptive threshold
  const windowLen = Math.floor(sampleRate / hopSize); // ~1 second
  for (let i = windowLen; i < spectralFlux.length - windowLen; i++) {
    const window = spectralFlux.slice(i - windowLen, i + windowLen);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const threshold = mean * 1.5;
    
    if (spectralFlux[i] > threshold && isLocalPeak(spectralFlux, i, 3)) {
      const timeSeconds = (i * hopSize) / sampleRate;
      beats.push(timeSeconds);
    }
  }

  return beats;
}

function calculateBPM(beats: number[], sampleRate: number): { bpm: number; bpmAlt: number; confidence: number } {
  if (beats.length < 2) return { bpm: 120, bpmAlt: 60, confidence: 0 };

  // Calculate inter-beat intervals
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    intervals.push(beats[i] - beats[i - 1]);
  }

  // Cluster intervals
  const histogram: { [key: number]: number } = {};
  intervals.forEach(interval => {
    const bpm = Math.round(60 / interval);
    histogram[bpm] = (histogram[bpm] || 0) + 1;
  });

  // Find most common BPM
  const sorted = Object.entries(histogram).sort((a, b) => b[1] - a[1]);
  const mainBPM = parseInt(sorted[0]?.[0] || '120');
  const altBPM = mainBPM > 100 ? Math.round(mainBPM / 2) : mainBPM * 2;
  const confidence = (sorted[0]?.[1] || 0) / intervals.length;

  return { bpm: mainBPM, bpmAlt: altBPM, confidence };
}

function detectDownbeats(beats: number[], bpm: number): number[] {
  if (beats.length < 4) return [0];
  
  const downbeats: number[] = [];
  const beatInterval = 60 / bpm;
  const barsInSeconds = beatInterval * 4;

  // Estimate first downbeat
  let currentBar = 0;
  downbeats.push(0);

  for (let i = 1; i < beats.length; i++) {
    const expectedDownbeat = currentBar * barsInSeconds;
    if (Math.abs(beats[i] - expectedDownbeat) < beatInterval * 0.5) {
      downbeats.push(i);
      currentBar++;
    } else if (beats[i] > expectedDownbeat + beatInterval) {
      currentBar = Math.floor(beats[i] / barsInSeconds);
      downbeats.push(i);
    }
  }

  return downbeats;
}

function detectPhrases(beats: number[], downbeats: number[]): Array<[number, number]> {
  const phrases: Array<[number, number]> = [];
  
  for (let i = 0; i < downbeats.length; i += 4) {
    if (i + 4 <= downbeats.length) {
      phrases.push([downbeats[i], 16]); // 16 beat phrases (4 bars)
    }
  }

  return phrases;
}

function detectKey(buffer: AudioBuffer): { key: number; confidence: number } {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  // Simple chromagram analysis
  const chromagram = new Array(12).fill(0);
  const hopSize = 4096;

  for (let i = 0; i < data.length - hopSize; i += hopSize) {
    const window = data.slice(i, i + hopSize);
    const spectrum = fft(window);
    
    // Map frequencies to pitch classes
    for (let j = 0; j < spectrum.length / 2; j++) {
      const freq = (j * sampleRate) / hopSize;
      if (freq < 80 || freq > 5000) continue;
      
      const pitchClass = Math.round(12 * Math.log2(freq / 440)) % 12;
      const normalizedPC = (pitchClass + 12) % 12;
      chromagram[normalizedPC] += spectrum[j];
    }
  }

  // Find dominant pitch class
  const maxIdx = chromagram.indexOf(Math.max(...chromagram));
  const total = chromagram.reduce((a, b) => a + b, 0);
  const confidence = chromagram[maxIdx] / total;

  return { key: maxIdx, confidence };
}

function analyzeEnergy(data: Float32Array, sampleRate: number): Float32Array {
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms windows
  const energy: number[] = [];

  for (let i = 0; i < data.length; i += windowSize) {
    const window = data.slice(i, i + windowSize);
    const rms = Math.sqrt(window.reduce((sum, val) => sum + val * val, 0) / window.length);
    energy.push(rms);
  }

  // Smooth energy curve
  const smoothed = new Float32Array(energy.length);
  const smoothWindow = 5;
  for (let i = 0; i < energy.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = -smoothWindow; j <= smoothWindow; j++) {
      if (i + j >= 0 && i + j < energy.length) {
        sum += energy[i + j];
        count++;
      }
    }
    smoothed[i] = sum / count;
  }

  return smoothed;
}

function estimateVocalPresence(buffer: AudioBuffer): Float32Array {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const hopSize = 4096;
  const vocalProb: number[] = [];

  for (let i = 0; i < data.length - hopSize; i += hopSize) {
    const window = data.slice(i, i + hopSize);
    const spectrum = fft(window);
    
    // Vocal frequency range emphasis (2-5 kHz)
    let vocalEnergy = 0;
    let totalEnergy = 0;
    
    for (let j = 0; j < spectrum.length / 2; j++) {
      const freq = (j * sampleRate) / hopSize;
      const energy = spectrum[j];
      totalEnergy += energy;
      
      if (freq >= 2000 && freq <= 5000) {
        vocalEnergy += energy * 2; // Emphasis
      }
    }
    
    vocalProb.push(totalEnergy > 0 ? vocalEnergy / totalEnergy : 0);
  }

  return new Float32Array(vocalProb);
}

function detectKicks(data: Float32Array, sampleRate: number, beats: number[]): number[] {
  const kicks: number[] = [];
  const windowSize = Math.floor(sampleRate * 0.05); // 50ms

  beats.forEach(beatTime => {
    const beatSample = Math.floor(beatTime * sampleRate);
    const searchStart = Math.max(0, beatSample - windowSize);
    const searchEnd = Math.min(data.length, beatSample + windowSize);
    
    // Low-pass filter for kick range (50-120 Hz)
    let maxEnergy = 0;
    let kickSample = beatSample;
    
    for (let i = searchStart; i < searchEnd; i += 512) {
      const window = data.slice(i, i + 512);
      const spectrum = fft(window);
      
      let lowEnergy = 0;
      for (let j = 0; j < 20; j++) { // Low frequencies
        lowEnergy += spectrum[j];
      }
      
      if (lowEnergy > maxEnergy) {
        maxEnergy = lowEnergy;
        kickSample = i;
      }
    }
    
    kicks.push(kickSample / sampleRate);
  });

  return kicks;
}

// Simple FFT implementation (magnitude only)
function fft(data: Float32Array): Float32Array {
  const n = data.length;
  const spectrum = new Float32Array(n);
  
  for (let k = 0; k < n / 2; k++) {
    let real = 0;
    let imag = 0;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * k * i) / n;
      real += data[i] * Math.cos(angle);
      imag -= data[i] * Math.sin(angle);
    }
    spectrum[k] = Math.sqrt(real * real + imag * imag);
  }
  
  return spectrum;
}

function isLocalPeak(data: number[], index: number, range: number): boolean {
  const value = data[index];
  for (let i = index - range; i <= index + range; i++) {
    if (i !== index && i >= 0 && i < data.length && data[i] >= value) {
      return false;
    }
  }
  return true;
}
