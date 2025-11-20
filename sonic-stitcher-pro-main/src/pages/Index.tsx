import { useState } from "react";
import { AudioUploader } from "@/components/AudioUploader";
import { WaveformDisplay } from "@/components/WaveformDisplay";
import { ControlPanel } from "@/components/ControlPanel";
import { MetersPanel } from "@/components/MetersPanel";
import { Music2 } from "lucide-react";

const Index = () => {
  const [trackA, setTrackA] = useState<File | null>(null);
  const [trackB, setTrackB] = useState<File | null>(null);
  const [showPro, setShowPro] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Music2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Pro Audio Merger</h1>
                <p className="text-sm text-muted-foreground">Professional two-track mixing engine</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          {/* Left Column - Audio Workspace */}
          <div className="space-y-6">
            {/* Upload Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AudioUploader
                label="Track A"
                color="trackA"
                file={trackA}
                onFileChange={setTrackA}
              />
              <AudioUploader
                label="Track B"
                color="trackB"
                file={trackB}
                onFileChange={setTrackB}
              />
            </div>

            {/* Waveform Display */}
            <WaveformDisplay trackA={trackA} trackB={trackB} />

            {/* Control Panel */}
            <ControlPanel 
              showPro={showPro}
              onTogglePro={() => setShowPro(!showPro)}
              hasFiles={!!(trackA && trackB)}
              trackA={trackA}
              trackB={trackB}
            />
          </div>

          {/* Right Column - Meters and Analysis */}
          <MetersPanel trackA={trackA} trackB={trackB} />
        </div>
      </main>
    </div>
  );
};

export default Index;
