// Launch the isolated production build for a complete browser check.
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3100'], {
  // Dummy Google credentials so the sign-in page has the same layout as production.
  env: { ...process.env, NEXT_TEST_BUILD:'1', ADMIN_MAIL:'@example.test', NEXT_PUBLIC_APP_URL:'http://localhost:3100', AUTH_GOOGLE_ID:'browser-test', AUTH_GOOGLE_SECRET:'browser-test' }, stdio: ['ignore','pipe','pipe'],
});
let output='';server.stdout.on('data',chunk=>{output+=chunk.toString();});server.stderr.on('data',chunk=>{output+=chunk.toString();});
try {
 let ready=false;
 for(let attempt=0;attempt<60;attempt++) {
  if(server.exitCode!==null)throw new Error(`Test server exited: ${output}`);
  try { const response=await fetch('http://localhost:3100',{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;} } catch {}
  await setTimeout(250);
 }
 if(!ready)throw new Error('Test server did not start');
 await new Promise((resolve,reject)=>{
  const test=spawn(process.execPath,[process.env.TEST_BROWSER_SCRIPT || 'tests/browser/shared-session.mjs'],{env:{...process.env,TEST_BASE_URL:'http://localhost:3100'},stdio:'inherit'});
  test.on('error',reject);test.on('exit',code=>code===0?resolve():reject(new Error(`Browser test exited ${code}`)));
 });
} finally {server.kill('SIGTERM');}
