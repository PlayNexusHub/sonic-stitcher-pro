import { AnalysisSummary } from './audioAnalysis';

export type TransitionStyle = 
  | "hard_downbeat" 
  | "eq_morph" 
  | "bass_swap" 
  | "vocal_aware" 
  | "stutter_entry";

export interface TransitionPlan {
  style: TransitionStyle;
  startBarA: number;
  startBarB: number;
  lengthBars: 4 | 8 | 16;
  tempoOps: Array<{ track: 'A' | 'B'; stretchPct: number }>;
  pitchOps: Array<{ track: 'A' | 'B'; semitones: number; formantPreserve: boolean }>;
  fx: Array<{ 
    type: 'sweep' | 'reverseVerb' | 'tapeStop' | 'stutter'; 
    atBeat: number; 
    params: Record<string, number> 
  }>;
}

export type MixMode = 'festival' | 'club_smooth' | 'neutral';

const CAMELOT_WHEEL: { [key: string]: string[] } = {
  '1A': ['1A', '12A', '2A', '1B'],
  '2A': ['2A', '1A', '3A', '2B'],
  '3A': ['3A', '2A', '4A', '3B'],
  '4A': ['4A', '3A', '5A', '4B'],
  '5A': ['5A', '4A', '6A', '5B'],
  '6A': ['6A', '5A', '7A', '6B'],
  '7A': ['7A', '6A', '8A', '7B'],
  '8A': ['8A', '7A', '9A', '8B'],
  '9A': ['9A', '8A', '10A', '9B'],
  '10A': ['10A', '9A', '11A', '10B'],
  '11A': ['11A', '10A', '12A', '11B'],
  '12A': ['12A', '11A', '1A', '12B'],
  '1B': ['1B', '12B', '2B', '1A'],
  '2B': ['2B', '1B', '3B', '2A'],
  '3B': ['3B', '2B', '4B', '3A'],
  '4B': ['4B', '3B', '5B', '4A'],
  '5B': ['5B', '4B', '6B', '5A'],
  '6B': ['6B', '5B', '7B', '6A'],
  '7B': ['7B', '6B', '8B', '7A'],
  '8B': ['8B', '7B', '9B', '8A'],
  '9B': ['9B', '8B', '10B', '9A'],
  '10B': ['10B', '9B', '11B', '10A'],
  '11B': ['11B', '10B', '12B', '11A'],
  '12B': ['12B', '11B', '1B', '12A']
};

export const createTransitionPlan = (
  analysisA: AnalysisSummary,
  analysisB: AnalysisSummary,
  mode: MixMode = 'neutral'
): TransitionPlan => {
  const tempoDelta = Math.abs(analysisA.bpm - analysisB.bpm) / analysisA.bpm;
  const keysCompatible = areKeysCompatible(analysisA.camelot, analysisB.camelot);
  
  // Calculate average vocal presence
  const avgVocalA = analysisA.vocalLikelihood.reduce((a, b) => a + b, 0) / analysisA.vocalLikelihood.length;
  const avgVocalB = analysisB.vocalLikelihood.reduce((a, b) => a + b, 0) / analysisB.vocalLikelihood.length;
  const bothVocal = avgVocalA > 0.3 && avgVocalB > 0.3;

  // Calculate energy difference
  const energyA = analysisA.energyCurve[analysisA.energyCurve.length - 1] || 0;
  const energyB = analysisB.energyCurve[0] || 0;
  const energyMismatch = Math.abs(energyA - energyB) > 0.3;

  // Decision matrix
  let style: TransitionStyle;
  let lengthBars: 4 | 8 | 16 = 8;
  const fx: TransitionPlan['fx'] = [];

  if (bothVocal) {
    // Vocal-aware: short transition to avoid vocal clash
    style = 'vocal_aware';
    lengthBars = 4;
  } else if (!keysCompatible && tempoDelta > 0.06) {
    // Keys clash + big tempo gap: hard cut
    style = 'hard_downbeat';
    lengthBars = 4;
    fx.push({ type: 'sweep', atBeat: -2, params: { duration: 1 } });
  } else if (keysCompatible && tempoDelta < 0.02) {
    // Perfect match: long EQ morph
    style = 'eq_morph';
    lengthBars = mode === 'club_smooth' ? 16 : 8;
  } else if (tempoDelta < 0.06) {
    // Moderate tempo: bass swap
    style = 'bass_swap';
    lengthBars = 8;
  } else {
    // Festival mode: aggressive entry
    style = mode === 'festival' ? 'stutter_entry' : 'hard_downbeat';
    lengthBars = 4;
    if (mode === 'festival') {
      fx.push({ type: 'stutter', atBeat: -4, params: { division: 8, bars: 1 } });
    }
  }

  // Add FX based on energy mismatch
  if (energyMismatch && energyB > energyA && mode === 'festival') {
    fx.push({ type: 'reverseVerb', atBeat: -4, params: { duration: 2 } });
  }

  // Tempo operations
  const tempoOps: TransitionPlan['tempoOps'] = [];
  if (tempoDelta > 0.02 && tempoDelta <= 0.06) {
    const targetBPM = (analysisA.bpm + analysisB.bpm) / 2;
    tempoOps.push({ 
      track: 'A', 
      stretchPct: ((targetBPM - analysisA.bpm) / analysisA.bpm) * 100 
    });
    tempoOps.push({ 
      track: 'B', 
      stretchPct: ((targetBPM - analysisB.bpm) / analysisB.bpm) * 100 
    });
  }

  // Pitch operations
  const pitchOps: TransitionPlan['pitchOps'] = [];
  if (!keysCompatible) {
    const semitoneShift = calculateKeyShift(analysisA.camelot, analysisB.camelot);
    if (Math.abs(semitoneShift) <= 1) {
      pitchOps.push({ 
        track: 'B', 
        semitones: semitoneShift, 
        formantPreserve: true 
      });
    }
  }

  // Find best transition bars (last quarter of track A)
  const totalBarsA = Math.max(1, Math.floor(analysisA.downbeatIndices.length / 4));
  const startBarA = Math.max(0, Math.floor(totalBarsA * 0.75));

  return {
    style,
    startBarA,
    startBarB: 0,
    lengthBars,
    tempoOps,
    pitchOps,
    fx
  };
};

function areKeysCompatible(keyA: string, keyB: string): boolean {
  const compatibleKeys = CAMELOT_WHEEL[keyA] || [];
  return compatibleKeys.includes(keyB);
}

function calculateKeyShift(keyA: string, keyB: string): number {
  // Extract semitone from Camelot (simplified)
  const numberA = parseInt(keyA);
  const numberB = parseInt(keyB);
  const shift = numberB - numberA;
  
  // Wrap to [-6, 6] range
  if (shift > 6) return shift - 12;
  if (shift < -6) return shift + 12;
  return shift;
}

export const getTransitionDescription = (plan: TransitionPlan): string => {
  const descriptions: { [key in TransitionStyle]: string } = {
    hard_downbeat: 'Hard cut on downbeat with smooth level transition',
    eq_morph: 'Gradual EQ crossfade for seamless blend',
    bass_swap: 'Low-end swap with sidechain compression',
    vocal_aware: 'Short transition avoiding vocal overlap',
    stutter_entry: 'Rhythmic stutter build into next track'
  };
  
  return descriptions[plan.style];
};
