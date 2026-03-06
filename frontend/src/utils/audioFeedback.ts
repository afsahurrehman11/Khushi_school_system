// Audio utility for success/failure sounds using Web Audio API
export class AudioFeedback {
  private audioContext: AudioContext | null = null;
  private successAudio: HTMLAudioElement | null = null;
  private failureAudio: HTMLAudioElement | null = null;
  private successAvailable = false;
  private failureAvailable = false;

  // public path where sound files are expected
  // Use a relative path (no leading slash) so assets resolve correctly
  // both when served over HTTP and when loaded from file:// (Electron builds)
  private basePath = './sounds/';

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Try to preload success/failure audio elements
      try {
        this.successAudio = new Audio(this.basePath + 'success.mp3');
        this.successAudio.preload = 'auto';
        this.successAudio.addEventListener('canplaythrough', () => {
          this.successAvailable = true;
        }, { once: true });
        this.successAudio.addEventListener('error', () => {
          this.successAvailable = false;
        }, { once: true });

        this.failureAudio = new Audio(this.basePath + 'failure.mp3');
        this.failureAudio.preload = 'auto';
        this.failureAudio.addEventListener('canplaythrough', () => {
          this.failureAvailable = true;
        }, { once: true });
        this.failureAudio.addEventListener('error', () => {
          this.failureAvailable = false;
        }, { once: true });
      } catch (e) {
        // ignore; will fall back to WebAudio tones
        this.successAvailable = false;
        this.failureAvailable = false;
      }
    }
  }

  private playTone(frequency: number, duration: number, volume: number = 0.3) {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + duration
    );

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  async playSuccess() {
    if (this.successAvailable && this.successAudio) {
      try {
        // Play the preloaded HTMLAudioElement
        await this.successAudio.play();
        return;
      } catch (_) {
        // fallback to WebAudio
      }
    }

    // Fallback: Pleasant ascending chime: C -> E -> G
    this.playTone(523.25, 0.15, 0.2); // C5
    setTimeout(() => this.playTone(659.25, 0.15, 0.2), 100); // E5
    setTimeout(() => this.playTone(783.99, 0.3, 0.2), 200); // G5
  }

  async playFailure() {
    if (this.failureAvailable && this.failureAudio) {
      try {
        await this.failureAudio.play();
        return;
      } catch (_) {
        // fallback to WebAudio
      }
    }

    // Fallback: Descending error tone: G -> E -> C
    this.playTone(392.00, 0.15, 0.15); // G4
    setTimeout(() => this.playTone(329.63, 0.15, 0.15), 100); // E4
    setTimeout(() => this.playTone(261.63, 0.3, 0.15), 200); // C4
  }

  playWarning() {
    // If you want a file for warning you can add it similarly; fallback to double beep
    this.playTone(440.00, 0.1, 0.15); // A4
    setTimeout(() => this.playTone(440.00, 0.1, 0.15), 150);
  }
}

export const audioFeedback = new AudioFeedback();
