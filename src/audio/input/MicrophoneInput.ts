import type { AudioInputKind } from "./AudioInputSource";
import { BaseInput } from "./BaseInput";

/**
 * Microphone / line-input capture via getUserMedia. Constraints disable the
 * browser DSP (echo cancellation / noise suppression / AGC) and request stereo,
 * matching the proven AudioEngine live-input setup.
 */
export class MicrophoneInput extends BaseInput {
  readonly kind: AudioInputKind = "microphone";

  async start(): Promise<void> {
    // beginRequest() bumps the generation (invalidating any in-flight start())
    // and enters "requesting"; we hold this generation to detect being superseded.
    const generation = this.beginRequest();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
        },
      });
    } catch (err) {
      // Superseded while pending: a newer request/teardown already moved on; stay quiet.
      if (generation !== this.generation) return;
      const error = this.toError(err);
      // AbortError = the request was cancelled/superseded by the platform — benign,
      // revert to idle. NotAllowedError (and anything else) is a real failure.
      if (error.name === "AbortError") {
        this.setState("idle");
      } else {
        this.setState("error", error);
      }
      return;
    }

    // Superseded while getUserMedia() was pending: stop the orphan stream, don't attach.
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      this.setState("error", new Error("The selected input did not provide an audio track."));
      return;
    }

    this.wireStream(stream, track);
    this.setState("live");
  }
}
