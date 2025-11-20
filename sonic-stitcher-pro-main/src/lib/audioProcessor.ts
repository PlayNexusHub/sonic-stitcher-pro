import { analyzeTrack, AnalysisSummary } from './audioAnalysis';
import { createTransitionPlan, TransitionPlan, MixMode } from './transitionEngine';
import { FXProcessor } from './fxProcessor';
import { MasteringProcessor } from './masteringProcessor';

export interface MergedAudioResult {
  audioBuffer: AudioBuffer;
  blob: Blob;
  url: string;
  analysis: {
    trackA: AnalysisSummary;
    trackB: AnalysisSummary;
    plan: TransitionPlan;
  };
}

export const mergeAudioFiles = async (
  fileA: File,
  fileB: File,
  crossfadeDuration: number = 8,
  mixMode: MixMode = 'neutral',
  manualOverride?: Partial<TransitionPlan>
): Promise<MergedAudioResult> => {
  const audioContext = new AudioContext();
  
  // Load both files
  const [bufferA, bufferB] = await Promise.all([
    loadAudioFile(fileA, audioContext),
    loadAudioFile(fileB, audioContext)
  ]);

  // Validate buffers
  if (!bufferA || !bufferB || bufferA.length === 0 || bufferB.length === 0) {
    throw new Error('Invalid audio files: buffers are empty or invalid');
  }

  // Analyze both tracks
  console.log('Analyzing tracks...');
  const [analysisA, analysisB] = await Promise.all([
    analyzeTrack(bufferA),
    analyzeTrack(bufferB)
  ]);

  // Validate BPM values
  if (!analysisA.bpm || !analysisB.bpm || isNaN(analysisA.bpm) || isNaN(analysisB.bpm) || analysisA.bpm <= 0 || analysisB.bpm <= 0) {
    throw new Error(`Invalid BPM detected: Track A: ${analysisA.bpm}, Track B: ${analysisB.bpm}`);
  }

  console.log('Track A:', { bpm: analysisA.bpm, key: analysisA.camelot });
  console.log('Track B:', { bpm: analysisB.bpm, key: analysisB.camelot });

  // Create intelligent transition plan
  let plan = createTransitionPlan(analysisA, analysisB, mixMode);
  
  // Apply manual overrides if provided
  if (manualOverride) {
    plan = { ...plan, ...manualOverride };
  }

  // Validate plan
  if (plan.startBarA < 0) {
    plan.startBarA = 0;
  }

  console.log('Transition plan:', plan);

  // Initialize processors
  const fxProcessor = new FXProcessor(audioContext);
  const masteringProcessor = new MasteringProcessor(audioContext);

  // Apply tempo/pitch adjustments if needed
  let processedA = bufferA;
  let processedB = bufferB;

  // Apply FX
  for (const fx of plan.fx) {
    const beatDuration = 60 / analysisA.bpm;
    const fxTime = plan.startBarA * 4 * beatDuration + fx.atBeat * beatDuration;
    
    // Skip FX if time is negative or invalid
    if (fxTime < 0 || isNaN(fxTime) || !isFinite(fxTime)) {
      console.warn(`Skipping FX ${fx.type} at invalid time: ${fxTime}`);
      continue;
    }
    
    try {
      switch (fx.type) {
        case 'sweep':
          processedA = fxProcessor.applyNoiseSweep(processedA, fxTime, fx.params.duration || 1);
          break;
        case 'reverseVerb':
          processedA = fxProcessor.applyReverseReverb(processedA, fxTime, fx.params.duration || 2);
          break;
        case 'tapeStop':
          processedA = fxProcessor.applyTapeStop(processedA, fxTime, fx.params.duration || 1);
          break;
        case 'stutter':
          processedB = fxProcessor.applyStutter(
            processedB, 
            0, 
            fx.params.division || 8, 
            fx.params.bars || 1,
            analysisB.bpm
          );
          break;
      }
    } catch (error) {
      console.error(`Error applying FX ${fx.type}:`, error);
      // Continue processing even if FX fails
    }
  }

  // Apply transition-specific processing
  if (plan.style === 'eq_morph') {
    const beatDuration = 60 / analysisA.bpm;
    const morphDuration = plan.lengthBars * 4 * beatDuration;
    const overlapStart = plan.startBarA * 4 * beatDuration;
    
    const morphed = fxProcessor.applyEQMorph(processedA, processedB, overlapStart, morphDuration);
    processedA = morphed.bufferA;
    processedB = morphed.bufferB;
  }

  // Calculate merge parameters
  const sampleRate = audioContext.sampleRate;
  const beatDurationA = 60 / analysisA.bpm;
  const overlapStartA = Math.max(0, Math.floor(plan.startBarA * 4 * beatDurationA * sampleRate));
  const crossfadeSamples = Math.floor(crossfadeDuration * sampleRate);
  
  // Ensure overlap doesn't exceed track A length
  const maxOverlap = Math.min(overlapStartA, processedA.length);
  const totalLength = maxOverlap + processedB.length;
  
  // Validate total length
  if (totalLength <= 0 || !isFinite(totalLength)) {
    throw new Error(`Invalid merge length: ${totalLength}`);
  }
  
  // Create output buffer
  const numberOfChannels = Math.max(processedA.numberOfChannels, processedB.numberOfChannels);
  const mergedBuffer = audioContext.createBuffer(
    numberOfChannels,
    totalLength,
    sampleRate
  );

  // Process each channel with intelligent crossfade
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const outputData = mergedBuffer.getChannelData(channel);
    const channelA = processedA.getChannelData(Math.min(channel, processedA.numberOfChannels - 1));
    const channelB = processedB.getChannelData(Math.min(channel, processedB.numberOfChannels - 1));

    // Copy track A up to overlap
    const copyEnd = Math.min(maxOverlap, processedA.length);
    for (let i = 0; i < copyEnd; i++) {
      outputData[i] = channelA[i];
    }

    // Crossfade region with style-specific curves
    const fadeStart = Math.min(maxOverlap, processedA.length);
    const actualCrossfadeSamples = Math.min(crossfadeSamples, processedA.length - fadeStart, processedB.length);
    const fadeEnd = Math.min(fadeStart + actualCrossfadeSamples, totalLength);
    
    for (let i = fadeStart; i < fadeEnd; i++) {
      const fadePosition = actualCrossfadeSamples > 0 ? (i - fadeStart) / actualCrossfadeSamples : 0;
      
      // Select curve based on transition style
      let gainA: number, gainB: number;
      if (plan.style === 'hard_downbeat') {
        // S-curve for smooth but quick transition
        const sCurve = (x: number) => x * x * (3 - 2 * x);
        gainA = 1 - sCurve(fadePosition);
        gainB = sCurve(fadePosition);
      } else if (plan.style === 'vocal_aware') {
        // Fast linear to minimize overlap
        gainA = 1 - fadePosition;
        gainB = fadePosition;
      } else {
        // Equal power crossfade for others
        gainA = Math.cos(fadePosition * Math.PI * 0.5);
        gainB = Math.sin(fadePosition * Math.PI * 0.5);
      }
      
      const sampleA = i < processedA.length ? channelA[i] : 0;
      const indexB = i - maxOverlap;
      const sampleB = indexB >= 0 && indexB < processedB.length ? channelB[indexB] : 0;
      
      outputData[i] = sampleA * gainA + sampleB * gainB;
    }

    // Copy rest of track B
    for (let i = fadeEnd; i < totalLength; i++) {
      const indexB = i - maxOverlap;
      if (indexB >= 0 && indexB < processedB.length) {
        outputData[i] = channelB[indexB];
      }
    }
  }

  // Check phase correlation
  const phaseCorr = masteringProcessor.checkPhaseCorrelation(processedA, processedB);
  console.log('Phase correlation:', phaseCorr);

  // Apply bass mono during overlap if needed
  let finalBuffer = mergedBuffer;
  if (plan.style === 'bass_swap' || phaseCorr < -0.3) {
    finalBuffer = masteringProcessor.makeBassMono(mergedBuffer, 120);
  }

  // Apply glue compression to transition region
  finalBuffer = masteringProcessor.applyGlueCompression(finalBuffer, -12, 2);

  // Normalize to target LUFS
  finalBuffer = masteringProcessor.normalizeLoudness(finalBuffer, -14);

  // Apply true-peak limiter
  finalBuffer = masteringProcessor.applyTruePeakLimiter(finalBuffer, -1.0);

  // Convert to WAV blob
  let blob: Blob;
  try {
    blob = await bufferToWave(finalBuffer, sampleRate);
    if (!blob || blob.size === 0) {
      throw new Error('Failed to create audio blob');
    }
  } catch (error) {
    throw new Error(`Failed to convert audio to WAV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  const url = URL.createObjectURL(blob);
  if (!url) {
    throw new Error('Failed to create object URL for merged audio');
  }

  return {
    audioBuffer: finalBuffer,
    blob,
    url,
    analysis: {
      trackA: analysisA,
      trackB: analysisB,
      plan
    }
  };
};

const loadAudioFile = async (file: File, audioContext: AudioContext): Promise<AudioBuffer> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('Audio file is empty or invalid');
    }
    const buffer = await audioContext.decodeAudioData(arrayBuffer);
    if (!buffer || buffer.length === 0) {
      throw new Error('Failed to decode audio data');
    }
    return buffer;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load audio file: ${error.message}`);
    }
    throw new Error('Failed to load audio file: Unknown error');
  }
};

const normalizeBuffer = (buffer: AudioBuffer) => {
  let maxVal = 0;
  
  // Find max value across all channels
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      maxVal = Math.max(maxVal, Math.abs(data[i]));
    }
  }

  // Normalize to -1.0 dB peak to prevent clipping
  if (maxVal > 0) {
    const gain = 0.891 / maxVal; // -1 dBTP
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        data[i] *= gain;
      }
    }
  }
};

const bufferToWave = async (buffer: AudioBuffer, sampleRate: number): Promise<Blob> => {
  if (!buffer || buffer.length === 0 || buffer.numberOfChannels === 0) {
    throw new Error('Invalid audio buffer for WAV conversion');
  }
  
  if (sampleRate <= 0 || !isFinite(sampleRate)) {
    throw new Error('Invalid sample rate for WAV conversion');
  }

  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numberOfChannels * 2;
  
  if (!isFinite(length) || length <= 0) {
    throw new Error('Invalid buffer length for WAV conversion');
  }
  
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  // Write WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);

  // Write interleaved audio data
  const channels = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
};
