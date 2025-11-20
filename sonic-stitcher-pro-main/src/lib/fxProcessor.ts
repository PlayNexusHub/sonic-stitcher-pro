export class FXProcessor {
  private audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  applyNoiseSweep(
    buffer: AudioBuffer,
    startTime: number,
    duration: number
  ): AudioBuffer {
    if (startTime < 0 || duration <= 0 || !isFinite(startTime) || !isFinite(duration)) {
      return buffer; // Return unchanged if invalid parameters
    }
    
    const sampleRate = buffer.sampleRate;
    const startSample = Math.max(0, Math.floor(startTime * sampleRate));
    const durationSamples = Math.floor(duration * sampleRate);

    const output = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      sampleRate
    );

    // Copy original audio
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      output.getChannelData(ch).set(buffer.getChannelData(ch));
    }

    // Generate white noise sweep
    const noise = new Float32Array(durationSamples);
    for (let i = 0; i < durationSamples; i++) {
      noise[i] = (Math.random() * 2 - 1) * 0.3;
    }

    // Apply high-pass filter with increasing cutoff
    for (let ch = 0; ch < output.numberOfChannels; ch++) {
      const channelData = output.getChannelData(ch);
      for (let i = 0; i < durationSamples; i++) {
        const progress = i / durationSamples;
        const gain = progress; // Fade in noise
        const sampleIdx = startSample + i;
        if (sampleIdx < channelData.length) {
          channelData[sampleIdx] += noise[i] * gain;
        }
      }
    }

    return output;
  }

  applyReverseReverb(
    buffer: AudioBuffer,
    startTime: number,
    duration: number
  ): AudioBuffer {
    if (startTime < 0 || duration <= 0 || !isFinite(startTime) || !isFinite(duration)) {
      return buffer; // Return unchanged if invalid parameters
    }
    
    const sampleRate = buffer.sampleRate;
    const startSample = Math.max(0, Math.floor(startTime * sampleRate));
    const durationSamples = Math.floor(duration * sampleRate);

    const output = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      sampleRate
    );

    // Copy original
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      output.getChannelData(ch).set(buffer.getChannelData(ch));
    }

    // Simple reverse echo effect
    for (let ch = 0; ch < output.numberOfChannels; ch++) {
      const channelData = output.getChannelData(ch);
      const reverb = new Float32Array(durationSamples);

      // Create decaying reverse echo
      for (let i = 0; i < durationSamples; i++) {
        const srcIdx = startSample + durationSamples - i;
        if (srcIdx < channelData.length) {
          const decay = 1 - (i / durationSamples);
          reverb[i] = channelData[srcIdx] * decay * 0.4;
        }
      }

      // Mix back in
      for (let i = 0; i < durationSamples; i++) {
        const targetIdx = startSample + i;
        if (targetIdx < channelData.length) {
          channelData[targetIdx] += reverb[i];
        }
      }
    }

    return output;
  }

  applyTapeStop(buffer: AudioBuffer, stopTime: number, duration: number = 1): AudioBuffer {
    if (stopTime < 0 || duration <= 0 || !isFinite(stopTime) || !isFinite(duration)) {
      return buffer; // Return unchanged if invalid parameters
    }
    
    const sampleRate = buffer.sampleRate;
    const stopSample = Math.max(0, Math.min(buffer.length, Math.floor(stopTime * sampleRate)));
    const durationSamples = Math.floor(duration * sampleRate);

    const output = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      sampleRate
    );

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const input = buffer.getChannelData(ch);
      const outputData = output.getChannelData(ch);

      for (let i = 0; i < buffer.length; i++) {
        if (i < stopSample - durationSamples) {
          outputData[i] = input[i];
        } else if (i < stopSample) {
          // Gradual pitch drop
          const progress = (i - (stopSample - durationSamples)) / durationSamples;
          const slowdown = 1 - (progress * progress); // Quadratic curve
          const readPos = stopSample - durationSamples + (i - (stopSample - durationSamples)) * slowdown;
          const readIdx = Math.floor(readPos);
          
          if (readIdx < input.length) {
            outputData[i] = input[readIdx] * (1 - progress * 0.5);
          }
        } else {
          outputData[i] = 0; // Silence after stop
        }
      }
    }

    return output;
  }

  applyStutter(
    buffer: AudioBuffer,
    startTime: number,
    division: number,
    bars: number,
    bpm: number
  ): AudioBuffer {
    if (startTime < 0 || division <= 0 || bars <= 0 || bpm <= 0 || !isFinite(startTime) || !isFinite(bpm)) {
      return buffer; // Return unchanged if invalid parameters
    }
    
    const sampleRate = buffer.sampleRate;
    const startSample = Math.max(0, Math.floor(startTime * sampleRate));
    const beatDuration = 60 / bpm;
    const stutterDuration = beatDuration * 4 * bars; // bars to seconds
    const stutterSamples = Math.floor(stutterDuration * sampleRate);
    const sliceDuration = (beatDuration * 4) / division; // Duration of each stutter slice
    const sliceSamples = Math.floor(sliceDuration * sampleRate);

    const output = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      sampleRate
    );

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const input = buffer.getChannelData(ch);
      const outputData = output.getChannelData(ch);

      // Copy everything before stutter
      for (let i = 0; i < startSample; i++) {
        outputData[i] = input[i];
      }

      // Apply stutter effect
      for (let i = 0; i < stutterSamples; i++) {
        const sliceIdx = Math.floor(i / sliceSamples);
        const posInSlice = i % sliceSamples;
        const srcIdx = startSample + posInSlice;
        
        if (srcIdx < input.length) {
          const targetIdx = startSample + i;
          if (targetIdx < outputData.length) {
            outputData[targetIdx] = input[srcIdx];
          }
        }
      }

      // Copy everything after
      for (let i = startSample + stutterSamples; i < buffer.length; i++) {
        if (i < input.length) {
          outputData[i] = input[i];
        }
      }
    }

    return output;
  }

  applyEQMorph(
    bufferA: AudioBuffer,
    bufferB: AudioBuffer,
    overlapStart: number,
    duration: number
  ): { bufferA: AudioBuffer; bufferB: AudioBuffer } {
    // This is a simplified version - real implementation would use BiquadFilters
    const sampleRate = bufferA.sampleRate;
    const startSample = Math.floor(overlapStart * sampleRate);
    const durationSamples = Math.floor(duration * sampleRate);

    const outputA = this.audioContext.createBuffer(
      bufferA.numberOfChannels,
      bufferA.length,
      sampleRate
    );
    const outputB = this.audioContext.createBuffer(
      bufferB.numberOfChannels,
      bufferB.length,
      sampleRate
    );

    // Copy and apply simple EQ curves
    for (let ch = 0; ch < bufferA.numberOfChannels; ch++) {
      const inputA = bufferA.getChannelData(ch);
      const dataA = outputA.getChannelData(ch);
      dataA.set(inputA);

      // Gradually reduce low end of A during transition
      for (let i = 0; i < durationSamples; i++) {
        const idx = startSample + i;
        if (idx < dataA.length) {
          const progress = i / durationSamples;
          const lowCut = 1 - progress * 0.7; // Reduce lows by 70%
          dataA[idx] *= lowCut;
        }
      }
    }

    for (let ch = 0; ch < bufferB.numberOfChannels; ch++) {
      const inputB = bufferB.getChannelData(ch);
      const dataB = outputB.getChannelData(ch);
      dataB.set(inputB);

      // Gradually introduce lows of B
      for (let i = 0; i < durationSamples; i++) {
        const idx = i;
        if (idx < dataB.length) {
          const progress = i / durationSamples;
          const lowBoost = progress; // Fade in lows
          dataB[idx] *= 0.3 + lowBoost * 0.7;
        }
      }
    }

    return { bufferA: outputA, bufferB: outputB };
  }
}
