import { useRef } from "react";
import { Upload, X, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AudioUploaderProps {
  label: string;
  color: "trackA" | "trackB";
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const AudioUploader = ({ label, color, file, onFileChange }: AudioUploaderProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate audio file
      const validTypes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/x-m4a'];
      if (validTypes.includes(selectedFile.type) || selectedFile.name.match(/\.(mp3|wav|flac|m4a)$/i)) {
        onFileChange(selectedFile);
      }
    }
  };

  const borderColor = color === "trackA" ? "border-trackA/30" : "border-trackB/30";
  const bgColor = color === "trackA" ? "bg-trackA/5" : "bg-trackB/5";
  const textColor = color === "trackA" ? "text-trackA" : "text-trackB";

  return (
    <Card className={cn("p-6 border-2 transition-all", file ? borderColor : "border-border")}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className={cn("font-semibold text-lg", file && textColor)}>{label}</h3>
          {file && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFileChange(null)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {file ? (
          <div className={cn("p-4 rounded-lg flex items-center gap-3", bgColor)}>
            <File className={cn("h-5 w-5", textColor)} />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-muted-foreground transition-colors group"
          >
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground group-hover:text-foreground transition-colors" />
              <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                Click to upload
              </p>
              <p className="text-xs text-muted-foreground">
                MP3, WAV, FLAC, M4A
              </p>
            </div>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.wav,.flac,.m4a,audio/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </Card>
  );
};
