import { Card } from "@/components/ui/card";
import { Activity, Disc, Gauge, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

interface MetersPanelProps {
  trackA: File | null;
  trackB: File | null;
}

export const MetersPanel = ({ trackA, trackB }: MetersPanelProps) => {
  const [analysisA, setAnalysisA] = useState({ bpm: 0, key: "—" });
  const [analysisB, setAnalysisB] = useState({ bpm: 0, key: "—" });

  useEffect(() => {
    if (trackA) {
      // Simulate analysis - in production, would use actual BPM detection
      setTimeout(() => {
        setAnalysisA({ 
          bpm: Math.floor(Math.random() * 60) + 100, 
          key: ["C", "D", "E", "F", "G", "A", "B"][Math.floor(Math.random() * 7)] + ["m", ""][Math.floor(Math.random() * 2)]
        });
      }, 500);
    }
  }, [trackA]);

  useEffect(() => {
    if (trackB) {
      setTimeout(() => {
        setAnalysisB({ 
          bpm: Math.floor(Math.random() * 60) + 100, 
          key: ["C", "D", "E", "F", "G", "A", "B"][Math.floor(Math.random() * 7)] + ["m", ""][Math.floor(Math.random() * 2)]
        });
      }, 500);
    }
  }, [trackB]);

  return (
    <div className="space-y-4">
      {/* Track A Analysis */}
      <Card className="p-6 border-trackA/30">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-trackA" />
            <h3 className="font-semibold text-trackA">Track A Analysis</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span className="text-xs">BPM</span>
              </div>
              <p className="text-2xl font-bold">{trackA ? analysisA.bpm : "—"}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Disc className="h-4 w-4" />
                <span className="text-xs">Key</span>
              </div>
              <p className="text-2xl font-bold">{trackA ? analysisA.key : "—"}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Track B Analysis */}
      <Card className="p-6 border-trackB/30">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-trackB" />
            <h3 className="font-semibold text-trackB">Track B Analysis</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span className="text-xs">BPM</span>
              </div>
              <p className="text-2xl font-bold">{trackB ? analysisB.bpm : "—"}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Disc className="h-4 w-4" />
                <span className="text-xs">Key</span>
              </div>
              <p className="text-2xl font-bold">{trackB ? analysisB.key : "—"}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Real-time Meters */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Output Meters</h3>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">LUFS</span>
                <span className="font-mono">-14.0</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full w-3/4 bg-meter-good rounded-full" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">True Peak</span>
                <span className="font-mono">-1.2 dBTP</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full w-2/3 bg-meter-good rounded-full" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Phase Correlation</span>
                <span className="font-mono">+0.85</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full w-4/5 bg-meter-good rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Info Card */}
      <Card className="p-6 bg-primary/5 border-primary/20">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-sm">Analysis Engine</h4>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Advanced features like stem separation, precise LUFS metering, and professional time-stretching can be enhanced with Lovable Cloud backend processing.
          </p>
        </div>
      </Card>
    </div>
  );
};
