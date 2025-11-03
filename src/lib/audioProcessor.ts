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

  // Analyze both tracks
  console.log('Analyzing tracks...');
  const [analysisA, analysisB] = await Promise.all([
    analyzeTrack(bufferA),
    analyzeTrack(bufferB)
  ]);

  console.log('Track A:', { bpm: analysisA.bpm, key: analysisA.camelot });
  console.log('Track B:', { bpm: analysisB.bpm, key: analysisB.camelot });

  // Create intelligent transition plan
  let plan = createTransitionPlan(analysisA, analysisB, mixMode);
  
  // Apply manual overrides if provided
  if (manualOverride) {
    plan = { ...plan, ...manualOverride };
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
  const overlapStartA = Math.floor(plan.startBarA * 4 * beatDurationA * sampleRate);
  const crossfadeSamples = Math.floor(crossfadeDuration * sampleRate);
  const totalLength = overlapStartA + processedB.length;
  
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
    for (let i = 0; i < overlapStartA; i++) {
      outputData[i] = channelA[i];
    }

    // Crossfade region with style-specific curves
    const fadeStart = overlapStartA;
    const fadeEnd = Math.min(fadeStart + crossfadeSamples, processedA.length);
    
    for (let i = fadeStart; i < fadeEnd; i++) {
      const fadePosition = (i - fadeStart) / crossfadeSamples;
      
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
      const indexB = i - overlapStartA;
      const sampleB = indexB < processedB.length ? channelB[indexB] : 0;
      
      outputData[i] = sampleA * gainA + sampleB * gainB;
    }

    // Copy rest of track B
    for (let i = fadeEnd; i < totalLength; i++) {
      const indexB = i - overlapStartA;
      if (indexB < processedB.length) {
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
  const blob = await bufferToWave(finalBuffer, sampleRate);
  const url = URL.createObjectURL(blob);

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
  const arrayBuffer = await file.arrayBuffer();
  return await audioContext.decodeAudioData(arrayBuffer);
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
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numberOfChannels * 2;
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
