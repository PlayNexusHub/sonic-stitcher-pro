import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { LineChart } from "lucide-react";

interface WaveformDisplayProps {
  trackA: File | null;
  trackB: File | null;
}

export const WaveformDisplay = ({ trackA, trackB }: WaveformDisplayProps) => {
  const canvasRefA = useRef<HTMLCanvasElement>(null);
  const canvasRefB = useRef<HTMLCanvasElement>(null);
  const [audioDataA, setAudioDataA] = useState<number[]>([]);
  const [audioDataB, setAudioDataB] = useState<number[]>([]);

  useEffect(() => {
    if (trackA) {
      processAudioFile(trackA, setAudioDataA);
    }
  }, [trackA]);

  useEffect(() => {
    if (trackB) {
      processAudioFile(trackB, setAudioDataB);
    }
  }, [trackB]);

  useEffect(() => {
    if (canvasRefA.current && audioDataA.length > 0) {
      drawWaveform(canvasRefA.current, audioDataA, "trackA");
    }
  }, [audioDataA]);

  useEffect(() => {
    if (canvasRefB.current && audioDataB.length > 0) {
      drawWaveform(canvasRefB.current, audioDataB, "trackB");
    }
  }, [audioDataB]);

  const processAudioFile = async (file: File, setData: (data: number[]) => void) => {
    try {
      const audioContext = new AudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const rawData = audioBuffer.getChannelData(0);
      const samples = 1000;
      const blockSize = Math.floor(rawData.length / samples);
      const filteredData: number[] = [];
      
      for (let i = 0; i < samples; i++) {
        let blockStart = blockSize * i;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[blockStart + j]);
        }
        filteredData.push(sum / blockSize);
      }
      
      setData(filteredData);
    } catch (error) {
      console.error("Error processing audio:", error);
    }
  };

  const drawWaveform = (canvas: HTMLCanvasElement, data: number[], color: "trackA" | "trackB") => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const barWidth = width / data.length;
    const midHeight = height / 2;

    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue(color === "trackA" ? "--track-a" : "--track-b")
      .trim()
      .replace(/hsl\(([\d\s,%.]+)\)/, "hsl($1 / 0.3)");

    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue(color === "trackA" ? "--track-a" : "--track-b")
      .trim();
    ctx.lineWidth = 1;

    for (let i = 0; i < data.length; i++) {
      const x = i * barWidth;
      const barHeight = data[i] * midHeight;
      
      ctx.fillRect(x, midHeight - barHeight, barWidth - 1, barHeight * 2);
      ctx.strokeRect(x, midHeight - barHeight, barWidth - 1, barHeight * 2);
    }

    // Center line
    ctx.strokeStyle = "hsl(var(--border))";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midHeight);
    ctx.lineTo(width, midHeight);
    ctx.stroke();
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <LineChart className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Waveform Display</h3>
        </div>

        <div className="space-y-4">
          {/* Track A Waveform */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-trackA">Track A</span>
              {trackA && (
                <span className="text-xs text-muted-foreground">
                  {(audioDataA.length > 0) && "Loaded"}
                </span>
              )}
            </div>
            <div className="bg-muted/30 rounded-lg p-2 border border-border">
              {trackA ? (
                <canvas
                  ref={canvasRefA}
                  className="w-full h-24"
                  style={{ display: "block" }}
                />
              ) : (
                <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
                  No audio loaded
                </div>
              )}
            </div>
          </div>

          {/* Track B Waveform */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-trackB">Track B</span>
              {trackB && (
                <span className="text-xs text-muted-foreground">
                  {(audioDataB.length > 0) && "Loaded"}
                </span>
              )}
            </div>
            <div className="bg-muted/30 rounded-lg p-2 border border-border">
              {trackB ? (
                <canvas
                  ref={canvasRefB}
                  className="w-full h-24"
                  style={{ display: "block" }}
                />
              ) : (
                <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
                  No audio loaded
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
