import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTranslationMessage } from "../lib/openai/events.ts";
import { POST } from "../app/api/openai/realtime-token/route.ts";

const request = (body = { targetLanguage: "th" }, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/openai/realtime-token", {
  method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("maps only documented transcript deltas; never displays audio or malformed payloads", () => {
  assert.deepEqual(parseTranslationMessage('{"type":"session.output_transcript.delta","delta":"สวัสดี"}'), { kind: "translation", delta: "สวัสดี" });
  assert.deepEqual(parseTranslationMessage('{"type":"session.input_transcript.delta","delta":"Bonjour"}'), { kind: "original", delta: "Bonjour" });
  for (const input of ["null", "garbage", '[]', '{"type":"session.output_audio.delta","delta":"audio"}', '{"type":"session.output_transcript.delta","delta":42}']) assert.equal(parseTranslationMessage(input), null);
  assert.deepEqual(parseTranslationMessage('{"type":"error"}'), { kind: "error" });
  assert.deepEqual(parseTranslationMessage('{"type":"session.closed"}'), { kind: "closed" });
});

test("credential endpoint validates origin, language and configuration before contacting OpenAI", async () => {
  const old = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_REALTIME_TRANSLATION_MODEL, url: process.env.NEXT_PUBLIC_APP_URL };
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_REALTIME_TRANSLATION_MODEL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  try {
    assert.equal((await POST(request({}, "https://other.example"))).status, 403);
    assert.equal((await POST(request({}, ""))).status, 403);
    assert.equal((await POST(request({ targetLanguage: "unsupported" }))).status, 400);
    assert.equal((await POST(request({ targetLanguage: ["th"] }))).status, 400);
    const response = await POST(request());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    process.env.OPENAI_API_KEY = "   ";
    process.env.OPENAI_REALTIME_TRANSLATION_MODEL = "   ";
    assert.equal((await POST(request())).status, 503);
  } finally {
    for (const [name, value] of [["OPENAI_API_KEY", old.key], ["OPENAI_REALTIME_TRANSLATION_MODEL", old.model], ["NEXT_PUBLIC_APP_URL", old.url]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test("uses translation session schema, returns only ephemeral credential and sanitizes failures", async () => {
  const previousFetch = globalThis.fetch;
  const old = { ...process.env };
  process.env.OPENAI_API_KEY = "test-permanent-secret";
  process.env.OPENAI_REALTIME_TRANSLATION_MODEL = "test-configurable-model";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/realtime/translations/client_secrets");
      assert.equal(options.headers.Authorization, "Bearer test-permanent-secret");
      assert.deepEqual(JSON.parse(options.body), { session: { model: "test-configurable-model", audio: { output: { language: "th" } } } });
      return Response.json({ value: "ephemeral", session: { private: "not forwarded" } });
    };
    assert.deepEqual(await (await POST(request())).json(), { value: "ephemeral" });
    globalThis.fetch = async () => Response.json({ value: "  " });
    assert.equal((await POST(request())).status, 502);
    globalThis.fetch = async () => Response.json({ error: "sensitive provider detail" }, { status: 401 });
    const failure = await POST(request());
    assert.equal(failure.status, 502);
    assert.doesNotMatch(await failure.text(), /sensitive|test-permanent-secret/);
    globalThis.fetch = async () => { throw new Error("timeout"); };
    assert.equal((await POST(request())).status, 504);
  } finally {
    globalThis.fetch = previousFetch;
    for (const name of ["OPENAI_API_KEY", "OPENAI_REALTIME_TRANSLATION_MODEL", "NEXT_PUBLIC_APP_URL"]) {
      if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name];
    }
  }
});

test("invalid app URL returns a controlled error without requesting credentials", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    for (const url of ["localhost:3000", "not a URL", "file:///tmp/app"]) {
      process.env.NEXT_PUBLIC_APP_URL = url;
      const response = await POST(request());
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /NEXT_PUBLIC_APP_URL/);
    }
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = oldUrl;
  }
});
