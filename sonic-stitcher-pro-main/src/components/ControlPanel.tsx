import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Settings2, Download, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AudioPlayer } from "./AudioPlayer";
import { mergeAudioFiles, MergedAudioResult } from "@/lib/audioProcessor";
import { MixMode } from "@/lib/transitionEngine";
import { getTransitionDescription } from "@/lib/transitionEngine";
import { Badge } from "@/components/ui/badge";

interface ControlPanelProps {
  showPro: boolean;
  onTogglePro: () => void;
  hasFiles: boolean;
  trackA: File | null;
  trackB: File | null;
}

export const ControlPanel = ({ showPro, onTogglePro, hasFiles, trackA, trackB }: ControlPanelProps) => {
  const [mixMode, setMixMode] = useState<MixMode>("neutral");
  const [crossfadeDuration, setCrossfadeDuration] = useState([8]);
  const [mergedAudio, setMergedAudio] = useState<MergedAudioResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportFormat, setExportFormat] = useState("wav24");

  const handleProMerge = async () => {
    if (!hasFiles || !trackA || !trackB) {
      toast.error("Please upload both tracks first");
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading("Analyzing tracks with AI...", {
      description: "Detecting BPM, key, energy, and planning intelligent transition"
    });

    try {
      const result = await mergeAudioFiles(
        trackA, 
        trackB, 
        crossfadeDuration[0],
        mixMode
      );
      setMergedAudio(result);
      
      const description = getTransitionDescription(result.analysis.plan);
      toast.success("Intelligent merge complete!", {
        id: toastId,
        description: `${description} | ${result.analysis.trackA.bpm.toFixed(0)} BPM (${result.analysis.trackA.camelot}) → ${result.analysis.trackB.bpm.toFixed(0)} BPM (${result.analysis.trackB.camelot})`
      });
    } catch (error) {
      console.error("Merge error:", error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
        ? error 
        : "Unknown error occurred";
      
      // Log full error details for debugging
      if (error instanceof Error) {
        console.error("Error stack:", error.stack);
        console.error("Error name:", error.name);
      }
      
      toast.error("Merge failed", {
        id: toastId,
        description: errorMessage
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    if (!mergedAudio) {
      toast.error("Please merge tracks first");
      return;
    }

    const fileName = `merged-track-${Date.now()}.wav`;
    const link = document.createElement("a");
    link.href = mergedAudio.url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("Download started!", {
      description: `Downloading ${fileName}`
    });
  };

  const handleStopPlayback = () => {
    // Optionally clear the merged audio
  };

  return (
    <div className="space-y-4">
      {/* Simple Mode Controls */}
      <Card className="p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Merge Controls</h3>
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <Switch checked={showPro} onCheckedChange={onTogglePro} />
              <span className="text-sm text-muted-foreground">Pro</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mix Mode</Label>
              <Select value={mixMode} onValueChange={(v) => setMixMode(v as MixMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral">Neutral (Auto-Select)</SelectItem>
                  <SelectItem value="festival">Festival (Aggressive FX)</SelectItem>
                  <SelectItem value="club_smooth">Club Smooth (Long Blends)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                AI analyzes tempo, key, energy & vocals to choose the best transition
              </p>
            </div>

            {mergedAudio && (
              <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Analysis Results</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Track A</div>
                    <div className="font-medium">{mergedAudio.analysis.trackA.bpm.toFixed(1)} BPM</div>
                    <Badge variant="outline" className="mt-1">{mergedAudio.analysis.trackA.camelot}</Badge>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Track B</div>
                    <div className="font-medium">{mergedAudio.analysis.trackB.bpm.toFixed(1)} BPM</div>
                    <Badge variant="outline" className="mt-1">{mergedAudio.analysis.trackB.camelot}</Badge>
                  </div>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <div className="text-muted-foreground text-xs">Transition Style</div>
                  <div className="font-medium text-sm capitalize">
                    {mergedAudio.analysis.plan.style.replace('_', ' ')}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {getTransitionDescription(mergedAudio.analysis.plan)}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button 
            onClick={handleProMerge}
            disabled={!hasFiles || isProcessing}
            className="w-full h-12 text-base font-semibold"
            size="lg"
          >
            <Sparkles className="mr-2 h-5 w-5" />
            {isProcessing ? "Processing..." : "Pro Merge"}
          </Button>
        </div>
      </Card>

      {/* Playback Section */}
      {mergedAudio && (
        <AudioPlayer 
          audioUrl={mergedAudio.url}
          onStop={handleStopPlayback}
        />
      )}

      {/* Pro Panel */}
      {showPro && (
        <Card className="p-6 border-primary/30">
          <div className="space-y-6">
            <h3 className="font-semibold text-lg text-primary">Pro Settings</h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Crossfade Curve Duration (bars)</Label>
                <div className="flex items-center gap-4">
                  <Slider 
                    value={crossfadeDuration}
                    onValueChange={setCrossfadeDuration}
                    min={2}
                    max={32}
                    step={2}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-8 text-right">{crossfadeDuration[0]}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Crossfade Curve</Label>
                <Select defaultValue="scurve">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scurve">S-Curve</SelectItem>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="exponential">Exponential</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target Loudness (LUFS)</Label>
                <Select defaultValue="-14">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-14">-14 LUFS (Streaming)</SelectItem>
                    <SelectItem value="-12">-12 LUFS (Mastered)</SelectItem>
                    <SelectItem value="-9">-9 LUFS (Club)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>True Peak Ceiling</Label>
                <Select defaultValue="-1.0">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1.0">-1.0 dBTP</SelectItem>
                    <SelectItem value="-0.5">-0.5 dBTP</SelectItem>
                    <SelectItem value="-0.1">-0.1 dBTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Export Controls */}
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Export</h3>
          
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wav24">WAV 24-bit 48kHz</SelectItem>
                <SelectItem value="wav16">WAV 16-bit 44.1kHz</SelectItem>
                <SelectItem value="mp3">MP3 320kbps</SelectItem>
                <SelectItem value="flac">FLAC Lossless</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleExport}
            disabled={!mergedAudio}
            variant="outline"
            className="w-full"
          >
            <Download className="mr-2 h-4 w-4" />
            Export Merged Track
          </Button>
        </div>
      </Card>
    </div>
  );
};
