const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/**
 * Nearest equal-tempered note name for a frequency (A4 = 440 Hz). Returns e.g.
 * "A4", "C#5". Empty string for non-positive input.
 */
export function noteName(freq: number): string {
  if (freq <= 0) return "";
  // MIDI 69 == A4 == 440 Hz; 12 semitones per octave.
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}
