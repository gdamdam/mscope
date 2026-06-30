import type { AudioInputKind } from "./AudioInputSource";
import { BaseInput } from "./BaseInput";

const NO_AUDIO_MESSAGE =
  "No audio track — re-share and enable 'Share tab audio'.";

/**
 * Tab/screen audio capture via getDisplayMedia. We request video (the picker
 * requires it) but only consume audio: the video track(s) are stopped immediately
 * after acquisition. The user clicking the browser's "Stop sharing" surfaces as
 * the audio track's 'ended' -> state "ended".
 */
export class TabCaptureInput extends BaseInput {
  readonly kind: AudioInputKind = "tab-capture";

  async start(): Promise<void> {
    const generation = this.beginRequest();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (err) {
      if (generation !== this.generation) return;
      const error = this.toError(err);
      // The user dismissing the picker rejects with NotAllowedError/AbortError —
      // benign, not an error condition; revert to idle.
      if (error.name === "AbortError" || error.name === "NotAllowedError") {
        this.setState("idle");
      } else {
        this.setState("error", error);
      }
      return;
    }

    // Superseded while the picker was open: discard the orphan stream entirely.
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      // No "Share tab audio" checkbox -> useless for a scope. Stop everything.
      stream.getTracks().forEach((track) => track.stop());
      this.setState("error", new Error(NO_AUDIO_MESSAGE));
      return;
    }

    // We never render the captured video; stop it now so the browser drops the
    // capture overhead and the audio track is all that remains on the stream.
    stream.getVideoTracks().forEach((track) => track.stop());

    this.wireStream(stream, audioTrack);
    this.setState("live");
  }
}
