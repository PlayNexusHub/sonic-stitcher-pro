import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Settings2, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AudioPlayer } from "./AudioPlayer";
import { mergeAudioFiles, MergedAudioResult } from "@/lib/audioProcessor";

interface ControlPanelProps {
  showPro: boolean;
  onTogglePro: () => void;
  hasFiles: boolean;
  trackA: File | null;
  trackB: File | null;
}

export const ControlPanel = ({ showPro, onTogglePro, hasFiles, trackA, trackB }: ControlPanelProps) => {
  const [transitionStyle, setTransitionStyle] = useState("auto");
  const [transitionLength, setTransitionLength] = useState("standard");
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
    const toastId = toast.loading("Analyzing and merging tracks...", {
      description: "Processing audio files with crossfade transition"
    });

    try {
      const result = await mergeAudioFiles(trackA, trackB, crossfadeDuration[0]);
      setMergedAudio(result);
      
      toast.success("Merge complete!", {
        id: toastId,
        description: "Your tracks have been merged successfully"
      });
    } catch (error) {
      console.error("Merge error:", error);
      toast.error("Merge failed", {
        id: toastId,
        description: error instanceof Error ? error.message : "Unknown error occurred"
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
              <Label>Transition Style</Label>
              <Select value={transitionStyle} onValueChange={setTransitionStyle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Recommended)</SelectItem>
                  <SelectItem value="crossfade">Smart Crossfade</SelectItem>
                  <SelectItem value="eqsweep">EQ-Sweep Blend</SelectItem>
                  <SelectItem value="drumswap">Drum Swap</SelectItem>
                  <SelectItem value="vocal">Vocal-Aware</SelectItem>
                  <SelectItem value="hardcut">Hard Cut</SelectItem>
                  <SelectItem value="stutter">Stutter-Entry</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Transition Length</Label>
              <Select value={transitionLength} onValueChange={setTransitionLength}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short (4 bars)</SelectItem>
                  <SelectItem value="standard">Standard (8 bars)</SelectItem>
                  <SelectItem value="long">Long (16 bars)</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
