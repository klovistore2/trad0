"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSharedConversation } from "@/hooks/useSharedConversation";
import { languageLabel } from "@/lib/i18n/language-names";
import { translator } from "@/lib/i18n/strings";
import { ThemeToggle } from "./theme-toggle";
import { ShareSession } from "./share-session";
import { SettingsPanel } from "./settings-panel";
import { VoiceIntro } from "./voice-intro";
import { GuestVoiceOffer } from "./guest-voice-offer";
import { PipelineDiagnostics } from "./pipeline-diagnostics";
import { AudioDiagnostics } from "./audio-diagnostics";
import { OwnWords } from "./own-words";
import { LanguageMenus } from "./language-menus";

export function SharedConversation({ id, signedIn = false }: { id: string; signedIn?: boolean }) {
  const session = useSharedConversation(id, signedIn);
  const [settings, setSettings] = useState(false);
  const room = session.room;
  const soundActive = session.soundReady && session.soundOn;
  // Each participant reads their own language: the guest was handed a phone and shares none.
  const t = translator(room?.me.language ?? "en");
  const router = useRouter();
  const home = !room || room.me.language === "en" ? "/" : `/${room.me.language}`;
  // A closed conversation leaves nothing to do here: say so briefly, then go home.
  useEffect(() => {
    if (!session.ended) return;
    const timer = setTimeout(() => router.replace(home), 3000);
    return () => clearTimeout(timer);
  }, [session.ended, router, home]);
  const away = !room?.peer?.online;
  // The sentence being read, or the latest one when nothing is: large, with the one before it for
  // context and every newer sentence still waiting to be read below it.
  const lines = session.incoming;
  const focus = session.speakingTurn ?? lines.at(-1)?.turnId;
  const focusIndex = lines.findIndex(line => line.turnId === focus);
  const visible = lines.slice(Math.max(0, Math.min(focusIndex - 1, lines.length - 3)));
  const focusLine = useRef<HTMLParagraphElement>(null);
  useEffect(() => { focusLine.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [focus]);
  return <main className="conversation">
    {room?.me.hasAccount && <VoiceIntro consented={room.me.consented} t={t} onAccept={session.giveConsent} />}
    <header className="topbar">
      <Link className="wordmark" href="/">Trad0<span className="brand-dot">.</span></Link>
      <div className="topbar-actions">
        <span className="edition">TRAD0 · LIVE</span>
        {room?.peer && !session.ended && <button type="button" className="theme-toggle" onClick={() => setSettings(open => !open)}
          aria-label="Settings" title="Settings" aria-pressed={settings}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.9 14.2a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-1 1.46v.17a1.9 1.9 0 1 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-1H3.9a1.9 1.9 0 1 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 1-1.46V3.9a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 1 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46 1h.17a1.9 1.9 0 1 1 0 3.8h-.09a1.6 1.6 0 0 0-1.46 1Z" />
          </svg>
        </button>}
        <ThemeToggle />
      </div>
    </header>
    <section className="conversation-body">
      {session.ended ? <><h1>{t("conversationEnded")}</h1><p className="intro">{t("backHome")}</p><Link href={home}>Trad0</Link></>
      : !room ? <><h1>{t("connecting")}</h1>{session.message && <p className="error-message" role="alert">{session.message}</p>}<Link href="/">Trad0</Link></>
      : !room.peer ? <ShareSession id={id} />
      : settings ? <SettingsPanel id={id} me={room.me} speechSeconds={session.speechSeconds}
          speechOptions={session.speechOptions} onSpeechOptions={session.setSpeechOptions}
          onConsent={() => void session.giveConsent()} onRefresh={session.refresh} onUseClone={useClone => void session.setUseClone(useClone)}
          onClose={() => setSettings(false)} />
      : <>
        <LanguageMenus mine={room.me} theirs={room.peer} locale={room.me.language} disabled={session.changingLanguage}
          onMine={language => void session.setLanguage(room.me.slot, language)}
          onTheirs={language => void session.setLanguage(room.peer!.slot, language)} />
        <button type="button" className={`sound-icon${session.soundReady ? "" : " needs-tap"}`} aria-pressed={!soundActive}
          aria-label={!session.soundReady ? t("hearTranslation") : session.soundOn ? t("muteSound") : t("unmuteSound")}
          title={!session.soundReady ? t("hearTranslation") : session.soundOn ? t("muteSound") : t("unmuteSound")}
          onClick={() => session.soundReady ? session.toggleSound() : void session.enableSound()}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z" fill="currentColor" stroke="none" />
            {soundActive
              ? <><path d="M15.5 9.2a4 4 0 0 1 0 5.6" /><path d="M18 6.7a7.5 7.5 0 0 1 0 10.6" /></>
              : <><path d="M16 9.5l5 5" /><path d="M21 9.5l-5 5" /></>}
          </svg>
        </button>
        <span className="sound-icon-label">{!session.soundReady ? t("hearTranslation") : session.soundOn ? t("soundOn") : t("textOnly")}</span>
        <div className="translation-area">
          {lines.length ? <><span className="eyebrow">{t("theirWords")}</span><div className="transcript" lang={room.me.language} tabIndex={0}>
            {visible.map(line => line.turnId === focus
              ? <p key={line.turnId} ref={focusLine} className="current">{line.text}</p>
              : <p key={line.turnId}>{line.text}</p>)}
          </div></>
          : <><h1>{t("connectedTitle")}</h1><p className="intro">{t("connectedIntro")}</p></>}
          {session.voiceStatus === "playing" && <p className="quiet-note" role="status">♫ {t("playing")}</p>}
          <OwnWords original={session.translation.original} translation={session.translation.translation}
            mine={room.me.language} theirs={room.peer.language} t={t} />
          {/* Only for the accounts listed in ADMIN_MAIL; everyone else sees the conversation alone. */}
          {room.diagnostics && <PipelineDiagnostics room={room} read={session.readPipelineState} tuning={session.toneTuning} onTuning={session.setToneTuning}>
            <AudioDiagnostics read={session.readAudioState} onTestTone={() => void session.playTestTone()}
              voiceStatus={session.voiceStatus} received={session.received} me={room.me} peer={room.peer} />
          </PipelineDiagnostics>}
        </div>
        {!room.me.hasAccount && <GuestVoiceOffer id={id} seconds={session.spokenSeconds} t={t} />}
        <div className="controls">
          <p className="session-status" role="status"><span className={`status-dot ${room.peer.online ? "active" : ""}`} />{room.peer.online ? t("peerOnline") : t("peerOffline")}</p>
          {session.message && <p className="error-message" role="alert">{session.message}</p>}
          {session.connectionLost && <p className="quiet-note" role="status">{t("reconnecting")}</p>}
          {!session.enabled
            ? <button className="primary-button" disabled={session.starting || away} onClick={() => void session.start()}>{session.starting
                ? t("connecting")
                : away ? t("peerOffline")
                : session.floorFree ? t("startTalking") : t("joinIn")}</button>
            : session.hasFloor
              ? <>
                  <p className="floor-state live" role="status"><span className="status-dot active" />{t("micOpen")}</p>
                  <button disabled={session.claiming} className="primary-button stop-button" onClick={() => void session.releaseFloor()}>{t("doneSpeaking")}</button>
                </>
              : <>
                  <p className="floor-state" role="status"><span className="status-dot" />{session.floorFree ? t("bothClosed") : t("theyAreSpeaking")}</p>
                  <button disabled={session.claiming || away} className="primary-button" onClick={() => void session.takeFloor()}>{session.floorFree ? t("speak") : t("letMeSpeak")}</button>
                </>}
        </div>
      </>}
    </section>
    <footer><span className="footer-mark">↔</span><p>Trad0<br /><span>{languageLabel(room?.me.language ?? "en", room?.me.language ?? "en")}</span></p></footer>
  </main>;
}
