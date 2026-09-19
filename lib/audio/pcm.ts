// PCM16 little-endian, as returned by ElevenLabs with output_format=pcm_24000.
export function pcm16ToFloat32(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  if (bytes.byteLength % 2 !== 0) throw new Error("Incomplete PCM sample");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return samples;
}
