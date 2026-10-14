let audio: AudioContext | null = null;

/** A short beep made in the browser, so it works offline. */
export function beep(): void {
  try {
    audio ??= new AudioContext();
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = 880;
    volume.gain.value = 0.15;
    tone.connect(volume).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.15);
  } catch {
    // No sound available; the call still shows on screen.
  }
}

/**
 * Says the call with one of the device's own voices, so it works offline. Returns false if there
 * isn't one, so a beep can be used instead.
 */
export function speak(text: string): boolean {
  if (!('speechSynthesis' in window)) return false;
  const voices = speechSynthesis.getVoices();
  const voice =
    voices.find((v) => v.localService && v.lang.startsWith('en')) ??
    voices.find((v) => v.localService);
  if (!voice) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  speechSynthesis.speak(utterance);
  return true;
}

/**
 * iOS only lets a page make sound after a tap, so the first press of each inspection wakes the
 * audio up, ready for the calls at 8 and 12 seconds.
 */
export function unlockSound(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    // No sound available.
  }
}
