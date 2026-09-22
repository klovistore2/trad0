import { createRequire } from 'node:module';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const headers = { 'xi-api-key': process.env.ELEVENLABS_API_KEY };
const response = await fetch('https://api.elevenlabs.io/v2/voices?category=premade&page_size=1', { headers });
const voices = await response.json();
if (!response.ok || !voices.voices?.[0]) throw new Error(`Voice lookup failed: ${response.status}`);
const tokenResponse = await fetch('https://api.elevenlabs.io/v1/single-use-token/tts_websocket', { method: 'POST', headers });
const credentials = await tokenResponse.json();
if (!tokenResponse.ok) throw new Error(`Token request failed: ${tokenResponse.status}`);
const params = new URLSearchParams({ single_use_token: credentials.token, model_id: process.env.ELEVENLABS_TTS_MODEL || 'eleven_v3_conversational', output_format: 'pcm_24000', language_code: 'en' });
await new Promise((resolve, reject) => {
 const socket = new WebSocket(`wss://api.elevenlabs.io/v1/text-to-speech/${voices.voices[0].voice_id}/stream-input?${params}`);
 let bytes = 0; let firstAudioMs; const started = Date.now();
 const timer = setTimeout(() => { socket.close(); reject(new Error('Audio timeout')); }, 15000);
 socket.onopen = () => {
  socket.send(JSON.stringify({ text: ' ' }));
  socket.send(JSON.stringify({ text: 'This is an audio test. ' }));
  socket.send(JSON.stringify({ text: '' }));
 };
 socket.onmessage = ({ data }) => {
  const event = JSON.parse(data);
  if (event.audio) { bytes += Buffer.from(event.audio, 'base64').length; firstAudioMs ??= Date.now() - started; }
  if (event.isFinal || event.is_final) {
   clearTimeout(timer); socket.close();
   if (!bytes) { reject(new Error('No audio received')); return; }
   console.log(JSON.stringify({ audioBytes: bytes, firstAudioMs, durationSeconds: bytes / 48000 })); resolve();
  }
  if (event.error) { clearTimeout(timer); socket.close(); reject(new Error('Provider rejected audio request')); }
 };
 socket.onerror = () => { clearTimeout(timer); socket.close(); reject(new Error('WebSocket failed')); };
 socket.onclose = () => { clearTimeout(timer); if (!bytes) reject(new Error('No audio received')); else resolve(); };
});
