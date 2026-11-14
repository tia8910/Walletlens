# Kokoro voice helper: same as kokoro_onnx.Kokoro.create, but feeds the speed
# input as float32, which this model export expects.
import numpy as np, wave, kokoro_onnx
class Voice(kokoro_onnx.Kokoro):
    def _create_audio(self, phonemes, voice, speed):
        phonemes = phonemes[:kokoro_onnx.MAX_PHONEME_LENGTH]
        tokens = np.array(self.tokenizer.tokenize(phonemes), dtype=np.int64)
        style = np.array(voice[len(tokens)], dtype=np.float32)
        out = self.sess.run(None, {'input_ids': [[0, *tokens, 0]], 'style': style, 'speed': np.array([speed], dtype=np.float32)})[0]
        return (out[0] if out.ndim == 2 else out), kokoro_onnx.SAMPLE_RATE
def write(fn, a, sr):
    p = (np.clip(a, -1, 1) * 32767).astype(np.int16)
    with wave.open(fn, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(p.tobytes())
