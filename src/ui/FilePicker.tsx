import { useId, useState, type DragEvent } from "react";

interface FilePickerProps {
  /** Called with the audio file the user chose or dropped. */
  onFile(file: File): void;
  /** True while an acquisition is in flight (disables the picker). */
  busy?: boolean;
}

/**
 * Load an audio file as a source: a native file input (keyboard-reachable,
 * accessibly labelled) plus a drag-and-drop zone. Both paths funnel the first
 * audio file to onFile.
 */
export function FilePicker({ onFile, busy = false }: FilePickerProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  const inputId = useId();

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="panel" role="group" aria-label="Audio file">
      <p className="panel__title">Audio file</p>
      <div
        data-dropzone="true"
        className={dragOver ? "dropzone dropzone--over" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <label htmlFor={inputId} className="dropzone__label">
          Choose an audio file or drop one here
        </label>
        <input
          id={inputId}
          type="file"
          accept="audio/*"
          className="btn"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </div>
    </div>
  );
}
