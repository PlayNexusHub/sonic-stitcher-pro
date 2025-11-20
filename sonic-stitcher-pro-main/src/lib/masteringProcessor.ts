export class MasteringProcessor {
  private audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  normalizeLoudness(
    buffer: AudioBuffer,
    targetLUFS: number = -14
  ): AudioBuffer {
    // Measure integrated loudness (simplified LUFS approximation)
    const currentLUFS = this.measureLUFS(buffer);
    const gainAdjust = Math.pow(10, (targetLUFS - currentLUFS) / 20);

    const normalized = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const input = buffer.getChannelData(ch);
      const output = normalized.getChannelData(ch);
      
      for (let i = 0; i < input.length; i++) {
        output[i] = input[i] * gainAdjust;
      }
    }

    return normalized;
  }

  applyTruePeakLimiter(
    buffer: AudioBuffer,
    ceiling: number = -1.0
  ): AudioBuffer {
    const ceilingLinear = Math.pow(10, ceiling / 20);
    const limited = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const input = buffer.getChannelData(ch);
      const output = limited.getChannelData(ch);
      
      // Simple soft clipping with lookahead
      const lookahead = 10;
      for (let i = 0; i < input.length; i++) {
        let maxPeak = Math.abs(input[i]);
        
        // Lookahead
        for (let j = 1; j <= lookahead && i + j < input.length; j++) {
          maxPeak = Math.max(maxPeak, Math.abs(input[i + j]));
        }
        
        let sample = input[i];
        if (maxPeak > ceilingLinear) {
          const reduction = ceilingLinear / maxPeak;
          sample *= reduction;
        }
        
        // Soft clip
        output[i] = Math.tanh(sample * 1.5) * 0.95;
      }
    }

    return limited;
  }

  applyGlueCompression(
    buffer: AudioBuffer,
    threshold: number = -12,
    ratio: number = 2
  ): AudioBuffer {
    const thresholdLinear = Math.pow(10, threshold / 20);
    const compressed = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const attackSamples = Math.floor(0.01 * buffer.sampleRate); // 10ms
    const releaseSamples = Math.floor(0.08 * buffer.sampleRate); // 80ms
    let envelope = 0;

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const input = buffer.getChannelData(ch);
      const output = compressed.getChannelData(ch);
      envelope = 0;

      for (let i = 0; i < input.length; i++) {
        const inputAbs = Math.abs(input[i]);
        
        // Envelope follower
        if (inputAbs > envelope) {
          envelope += (inputAbs - envelope) / attackSamples;
        } else {
          envelope += (inputAbs - envelope) / releaseSamples;
        }
        
        // Calculate gain reduction
        let gain = 1;
        if (envelope > thresholdLinear) {
          const overshoot = envelope / thresholdLinear;
          gain = Math.pow(overshoot, (1 / ratio) - 1);
        }
        
        output[i] = input[i] * gain;
      }
    }

    return compressed;
  }

  makeBassMono(
    buffer: AudioBuffer,
    cutoffFreq: number = 120
  ): AudioBuffer {
    if (buffer.numberOfChannels < 2) return buffer;

    const output = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const outLeft = output.getChannelData(0);
    const outRight = output.getChannelData(1);

    // Simple moving average low-pass (approximation)
    const windowSize = Math.floor(buffer.sampleRate / (cutoffFreq * 2));

    for (let i = 0; i < buffer.length; i++) {
      // Sum low frequencies to mono
      let avgLeft = 0;
      let avgRight = 0;
      let count = 0;

      for (let j = Math.max(0, i - windowSize); j < Math.min(buffer.length, i + windowSize); j++) {
        avgLeft += left[j];
        avgRight += right[j];
        count++;
      }

      const monoLow = (avgLeft + avgRight) / (count * 2);
      const highLeft = left[i] - avgLeft / count;
      const highRight = right[i] - avgRight / count;

      outLeft[i] = monoLow + highLeft;
      outRight[i] = monoLow + highRight;
    }

    return output;
  }

  private measureLUFS(buffer: AudioBuffer): number {
    // Simplified LUFS measurement (K-weighted RMS approximation)
    let sumSquared = 0;
    let sampleCount = 0;

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        sumSquared += data[i] * data[i];
        sampleCount++;
      }
    }

    // Prevent division by zero
    if (sampleCount === 0 || sumSquared === 0) {
      return -60; // Return very quiet level for empty/silent buffer
    }

    const rms = Math.sqrt(sumSquared / sampleCount);
    if (rms <= 0 || !isFinite(rms)) {
      return -60;
    }
    
    const lufs = -0.691 + 10 * Math.log10(rms * rms);
    
    return isFinite(lufs) ? lufs : -60;
  }

  checkPhaseCorrelation(bufferA: AudioBuffer, bufferB: AudioBuffer): number {
    if (bufferA.numberOfChannels < 2 || bufferB.numberOfChannels < 2) return 1;

    const leftA = bufferA.getChannelData(0);
    const rightA = bufferA.getChannelData(1);
    const leftB = bufferB.getChannelData(0);
    const rightB = bufferB.getChannelData(1);

    const minLen = Math.min(leftA.length, leftB.length);
    if (minLen === 0) return 1;

    let correlation = 0;

    for (let i = 0; i < minLen; i++) {
      const mono = (leftA[i] + rightA[i] + leftB[i] + rightB[i]) / 4;
      const side = (leftA[i] - rightA[i] + leftB[i] - rightB[i]) / 4;
      correlation += mono * side;
    }

    const result = correlation / minLen;
    return isFinite(result) ? result : 1;
  }
}
