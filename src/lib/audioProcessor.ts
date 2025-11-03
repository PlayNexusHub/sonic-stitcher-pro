export interface MergedAudioResult {
  audioBuffer: AudioBuffer;
  blob: Blob;
  url: string;
}

export const mergeAudioFiles = async (
  fileA: File,
  fileB: File,
  crossfadeDuration: number = 8
): Promise<MergedAudioResult> => {
  const audioContext = new AudioContext();
  
  // Load both files
  const [bufferA, bufferB] = await Promise.all([
    loadAudioFile(fileA, audioContext),
    loadAudioFile(fileB, audioContext)
  ]);

  // Calculate merge parameters
  const sampleRate = audioContext.sampleRate;
  const crossfadeSamples = Math.floor(crossfadeDuration * sampleRate);
  
  // Find a good overlap point (last 25% of track A)
  const overlapStartA = Math.floor(bufferA.length * 0.75);
  const totalLength = overlapStartA + bufferB.length;
  
  // Create output buffer
  const numberOfChannels = Math.max(bufferA.numberOfChannels, bufferB.numberOfChannels);
  const mergedBuffer = audioContext.createBuffer(
    numberOfChannels,
    totalLength,
    sampleRate
  );

  // Process each channel
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const outputData = mergedBuffer.getChannelData(channel);
    const channelA = bufferA.getChannelData(Math.min(channel, bufferA.numberOfChannels - 1));
    const channelB = bufferB.getChannelData(Math.min(channel, bufferB.numberOfChannels - 1));

    // Copy track A up to overlap
    for (let i = 0; i < overlapStartA; i++) {
      outputData[i] = channelA[i];
    }

    // Crossfade region
    const fadeStart = overlapStartA;
    const fadeEnd = Math.min(fadeStart + crossfadeSamples, bufferA.length);
    
    for (let i = fadeStart; i < fadeEnd; i++) {
      const fadePosition = (i - fadeStart) / crossfadeSamples;
      const gainA = Math.cos(fadePosition * Math.PI * 0.5); // Smooth fade out
      const gainB = Math.sin(fadePosition * Math.PI * 0.5); // Smooth fade in
      
      const sampleA = i < bufferA.length ? channelA[i] : 0;
      const indexB = i - overlapStartA;
      const sampleB = indexB < bufferB.length ? channelB[indexB] : 0;
      
      outputData[i] = sampleA * gainA + sampleB * gainB;
    }

    // Copy rest of track B
    for (let i = fadeEnd; i < totalLength; i++) {
      const indexB = i - overlapStartA;
      if (indexB < bufferB.length) {
        outputData[i] = channelB[indexB];
      }
    }
  }

  // Apply normalization to prevent clipping
  normalizeBuffer(mergedBuffer);

  // Convert to WAV blob
  const blob = await bufferToWave(mergedBuffer, sampleRate);
  const url = URL.createObjectURL(blob);

  return {
    audioBuffer: mergedBuffer,
    blob,
    url
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
