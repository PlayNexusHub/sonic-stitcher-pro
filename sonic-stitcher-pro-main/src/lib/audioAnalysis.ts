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
  try {
    if (!buffer || buffer.length === 0 || buffer.sampleRate <= 0) {
      throw new Error('Invalid audio buffer');
    }

    const channelData = buffer.getChannelData(0);
    if (!channelData || channelData.length === 0) {
      throw new Error('Invalid channel data');
    }

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
  } catch (error) {
    console.error('Analysis error:', error);
    // Return default analysis on error
    return {
      bpm: 120,
      bpmAlt: 60,
      bpmConfidence: 0,
      camelot: '1A',
      keySemitone: 0,
      keyConfidence: 0,
      beatTimes: new Float32Array([0, 0.5, 1.0, 1.5]),
      downbeatIndices: new Uint32Array([0, 4, 8, 12]),
      phraseSpans: [[0, 16]],
      energyCurve: new Float32Array([0.5]),
      vocalLikelihood: new Float32Array([0.3]),
      kickTimes: new Float32Array([0, 0.5, 1.0, 1.5])
    };
  }
};

function detectBeats(data: Float32Array, sampleRate: number): number[] {
  const beats: number[] = [];
  const hopSize = 512;
  const windowSize = 2048;
  const spectralFlux: number[] = [];

  // Validate input
  if (!data || data.length < windowSize || sampleRate <= 0) {
    // Return default beats if data is too short
    return [0, 0.5, 1.0, 1.5];
  }

  // Calculate spectral flux
  let prevSpectrum: Float32Array | null = null;
  
  for (let i = 0; i < data.length - windowSize; i += hopSize) {
    const window = data.slice(i, i + windowSize);
    if (window.length < windowSize) break;
    
    const spectrum = fft(window);
    if (!spectrum || spectrum.length === 0) continue;
    
    if (prevSpectrum) {
      let flux = 0;
      const minLen = Math.min(spectrum.length, prevSpectrum.length);
      for (let j = 0; j < minLen; j++) {
        const diff = Math.max(0, spectrum[j] - prevSpectrum[j]);
        flux += diff * diff;
      }
      if (flux > 0) {
        spectralFlux.push(Math.sqrt(flux));
      }
    }
    prevSpectrum = spectrum;
  }

  // Peak picking with adaptive threshold
  if (spectralFlux.length < 2) {
    // Return default beats if not enough spectral flux data
    return [0, 0.5, 1.0, 1.5];
  }

  const windowLen = Math.max(1, Math.floor(sampleRate / hopSize)); // ~1 second
  for (let i = windowLen; i < spectralFlux.length - windowLen; i++) {
    const window = spectralFlux.slice(i - windowLen, i + windowLen);
    if (window.length === 0) continue;
    
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    if (!isFinite(mean) || mean <= 0) continue;
    
    const threshold = mean * 1.5;
    
    if (spectralFlux[i] > threshold && isLocalPeak(spectralFlux, i, 3)) {
      const timeSeconds = (i * hopSize) / sampleRate;
      if (isFinite(timeSeconds) && timeSeconds >= 0) {
        beats.push(timeSeconds);
      }
    }
  }

  // Ensure we have at least some beats
  if (beats.length === 0) {
    return [0, 0.5, 1.0, 1.5];
  }

  return beats;
}

function calculateBPM(beats: number[], sampleRate: number): { bpm: number; bpmAlt: number; confidence: number } {
  if (beats.length < 2) return { bpm: 120, bpmAlt: 60, confidence: 0 };

  // Calculate inter-beat intervals
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const interval = beats[i] - beats[i - 1];
    if (interval > 0 && isFinite(interval)) {
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) {
    return { bpm: 120, bpmAlt: 60, confidence: 0 };
  }

  // Cluster intervals
  const histogram: { [key: number]: number } = {};
  intervals.forEach(interval => {
    if (interval > 0 && isFinite(interval)) {
      const bpm = Math.round(60 / interval);
      if (bpm > 0 && bpm < 300) { // Reasonable BPM range
        histogram[bpm] = (histogram[bpm] || 0) + 1;
      }
    }
  });

  if (Object.keys(histogram).length === 0) {
    return { bpm: 120, bpmAlt: 60, confidence: 0 };
  }

  // Find most common BPM
  const sorted = Object.entries(histogram).sort((a, b) => b[1] - a[1]);
  const mainBPM = Math.max(60, Math.min(200, parseInt(sorted[0]?.[0] || '120')));
  const altBPM = mainBPM > 100 ? Math.round(mainBPM / 2) : mainBPM * 2;
  const confidence = Math.min(1, Math.max(0, (sorted[0]?.[1] || 0) / intervals.length));

  return { bpm: mainBPM, bpmAlt: altBPM, confidence };
}

function detectDownbeats(beats: number[], bpm: number): number[] {
  if (beats.length < 4 || bpm <= 0 || !isFinite(bpm)) {
    return [0, 4, 8, 12]; // Return default downbeats
  }
  
  const downbeats: number[] = [];
  const beatInterval = 60 / bpm;
  if (!isFinite(beatInterval) || beatInterval <= 0) {
    return [0, 4, 8, 12];
  }
  
  const barsInSeconds = beatInterval * 4;

  // Estimate first downbeat
  let currentBar = 0;
  downbeats.push(0);

  for (let i = 1; i < beats.length; i++) {
    if (!isFinite(beats[i])) continue;
    
    const expectedDownbeat = currentBar * barsInSeconds;
    if (Math.abs(beats[i] - expectedDownbeat) < beatInterval * 0.5) {
      downbeats.push(i);
      currentBar++;
    } else if (beats[i] > expectedDownbeat + beatInterval) {
      currentBar = Math.floor(beats[i] / barsInSeconds);
      downbeats.push(i);
    }
  }

  // Ensure we have at least some downbeats
  if (downbeats.length === 0) {
    return [0, 4, 8, 12];
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
  try {
    if (!buffer || buffer.length === 0) {
      return { key: 0, confidence: 0 };
    }

    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    if (!data || data.length === 0 || sampleRate <= 0) {
      return { key: 0, confidence: 0 };
    }
    
    // Simple chromagram analysis
    const chromagram = new Array(12).fill(0);
    const hopSize = 4096;

    for (let i = 0; i < data.length - hopSize; i += hopSize) {
      const window = data.slice(i, i + hopSize);
      if (window.length < hopSize) break;
      
      const spectrum = fft(window);
      if (!spectrum || spectrum.length === 0) continue;
      
      // Map frequencies to pitch classes
      for (let j = 0; j < spectrum.length / 2; j++) {
        const freq = (j * sampleRate) / hopSize;
        if (freq < 80 || freq > 5000 || !isFinite(freq)) continue;
        
        try {
          const pitchClass = Math.round(12 * Math.log2(freq / 440)) % 12;
          const normalizedPC = (pitchClass + 12) % 12;
          if (normalizedPC >= 0 && normalizedPC < 12 && isFinite(spectrum[j])) {
            chromagram[normalizedPC] += spectrum[j];
          }
        } catch (e) {
          // Skip invalid pitch calculations
          continue;
        }
      }
    }

    // Find dominant pitch class
    const maxVal = Math.max(...chromagram);
    if (!isFinite(maxVal) || maxVal === 0) {
      return { key: 0, confidence: 0 };
    }

    const maxIdx = chromagram.indexOf(maxVal);
    const total = chromagram.reduce((a, b) => a + b, 0);
    const confidence = total > 0 ? Math.min(1, Math.max(0, chromagram[maxIdx] / total)) : 0;

    return { key: maxIdx, confidence };
  } catch (error) {
    console.error('Key detection error:', error);
    return { key: 0, confidence: 0 };
  }
}

function analyzeEnergy(data: Float32Array, sampleRate: number): Float32Array {
  try {
    if (!data || data.length === 0 || sampleRate <= 0) {
      return new Float32Array([0.5]);
    }

    const windowSize = Math.max(1, Math.floor(sampleRate * 0.02)); // 20ms windows
    const energy: number[] = [];

    for (let i = 0; i < data.length; i += windowSize) {
      const window = data.slice(i, i + windowSize);
      if (window.length === 0) break;
      
      const sumSquared = window.reduce((sum, val) => {
        const v = isFinite(val) ? val : 0;
        return sum + v * v;
      }, 0);
      
      const rms = window.length > 0 ? Math.sqrt(sumSquared / window.length) : 0;
      energy.push(isFinite(rms) ? rms : 0);
    }

    if (energy.length === 0) {
      return new Float32Array([0.5]);
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
      smoothed[i] = count > 0 ? (isFinite(sum / count) ? sum / count : 0) : 0;
    }

    return smoothed;
  } catch (error) {
    console.error('Energy analysis error:', error);
    return new Float32Array([0.5]);
  }
}

function estimateVocalPresence(buffer: AudioBuffer): Float32Array {
  try {
    if (!buffer || buffer.length === 0) {
      return new Float32Array([0.3]);
    }

    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    if (!data || data.length === 0 || sampleRate <= 0) {
      return new Float32Array([0.3]);
    }

    const hopSize = 4096;
    const vocalProb: number[] = [];

    for (let i = 0; i < data.length - hopSize; i += hopSize) {
      const window = data.slice(i, i + hopSize);
      if (window.length < hopSize) break;
      
      const spectrum = fft(window);
      if (!spectrum || spectrum.length === 0) continue;
      
      // Vocal frequency range emphasis (2-5 kHz)
      let vocalEnergy = 0;
      let totalEnergy = 0;
      
      for (let j = 0; j < spectrum.length / 2; j++) {
        const freq = (j * sampleRate) / hopSize;
        const energy = isFinite(spectrum[j]) ? spectrum[j] : 0;
        totalEnergy += energy;
        
        if (freq >= 2000 && freq <= 5000 && isFinite(freq)) {
          vocalEnergy += energy * 2; // Emphasis
        }
      }
      
      const prob = totalEnergy > 0 ? Math.min(1, Math.max(0, vocalEnergy / totalEnergy)) : 0;
      vocalProb.push(isFinite(prob) ? prob : 0);
    }

    if (vocalProb.length === 0) {
      return new Float32Array([0.3]);
    }

    return new Float32Array(vocalProb);
  } catch (error) {
    console.error('Vocal presence estimation error:', error);
    return new Float32Array([0.3]);
  }
}

function detectKicks(data: Float32Array, sampleRate: number, beats: number[]): number[] {
  try {
    if (!data || data.length === 0 || sampleRate <= 0 || !beats || beats.length === 0) {
      return [0, 0.5, 1.0, 1.5];
    }

    const kicks: number[] = [];
    const windowSize = Math.max(1, Math.floor(sampleRate * 0.05)); // 50ms

    beats.forEach(beatTime => {
      if (!isFinite(beatTime) || beatTime < 0) return;
      
      const beatSample = Math.floor(beatTime * sampleRate);
      const searchStart = Math.max(0, beatSample - windowSize);
      const searchEnd = Math.min(data.length, beatSample + windowSize);
      
      if (searchStart >= searchEnd) {
        kicks.push(beatTime);
        return;
      }
      
      // Low-pass filter for kick range (50-120 Hz)
      let maxEnergy = 0;
      let kickSample = beatSample;
      
      for (let i = searchStart; i < searchEnd; i += 512) {
        const window = data.slice(i, i + 512);
        if (window.length === 0) break;
        
        const spectrum = fft(window);
        if (!spectrum || spectrum.length === 0) continue;
        
        let lowEnergy = 0;
        for (let j = 0; j < Math.min(20, spectrum.length); j++) { // Low frequencies
          if (isFinite(spectrum[j])) {
            lowEnergy += spectrum[j];
          }
        }
        
        if (lowEnergy > maxEnergy && isFinite(lowEnergy)) {
          maxEnergy = lowEnergy;
          kickSample = i;
        }
      }
      
      const kickTime = kickSample / sampleRate;
      if (isFinite(kickTime) && kickTime >= 0) {
        kicks.push(kickTime);
      }
    });

    if (kicks.length === 0) {
      return [0, 0.5, 1.0, 1.5];
    }

    return kicks;
  } catch (error) {
    console.error('Kick detection error:', error);
    return [0, 0.5, 1.0, 1.5];
  }
}

// Simple FFT implementation (magnitude only)
function fft(data: Float32Array): Float32Array {
  if (!data || data.length === 0) {
    return new Float32Array(1024); // Return empty spectrum
  }
  
  const n = data.length;
  const spectrum = new Float32Array(n);
  
  for (let k = 0; k < n / 2; k++) {
    let real = 0;
    let imag = 0;
    for (let i = 0; i < n; i++) {
      if (!isFinite(data[i])) continue;
      const angle = (2 * Math.PI * k * i) / n;
      real += data[i] * Math.cos(angle);
      imag -= data[i] * Math.sin(angle);
    }
    const magnitude = Math.sqrt(real * real + imag * imag);
    spectrum[k] = isFinite(magnitude) ? magnitude : 0;
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
