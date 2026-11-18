"use client";

import { useEffect, useRef, useState } from "react";
import {
  BROKER_URL,
  connect,
  type DuplexSession,
  type DuplexStatus,
} from "@/lib/duplex";

export default function Home() {
  const [status, setStatus] = useState<DuplexStatus | "idle">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const sessionRef = useRef<DuplexSession | null>(null);
  const logBottomRef = useRef<HTMLDivElement | null>(null);

  const live = status === "live";

  // Open one stream to the broker's /logs endpoint and mirror the worker's log lines
  // into the left pane. EventSource reconnects on its own, so a broker restart heals.
  useEffect(() => {
    const source = new EventSource(`${BROKER_URL}/logs`);
    source.onmessage = (e) => {
      const line = JSON.parse(e.data) as string;
      // Keep the last 500 lines, so a long session does not grow without bound.
      setLogs((prev) => [...prev, line].slice(-500));
    };
    return () => source.close();
  }, []);

  // Keep the newest log line in view.
  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  async function handleConnect() {
    setError(null);
    // Clear the previous call's lines so a new session reads as a fresh session.
    setLogs([]);
    setBusy(true);
    try {
      sessionRef.current = await connect({
        delegation: "client",
        onStatus: setStatus,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await sessionRef.current?.disconnect();
      sessionRef.current = null;
    } finally {
      // Clear the pane so the ended call leaves no lines behind and the next
      // connect reads as a fresh start.
      setLogs([]);
      setBusy(false);
    }
  }

  return (
    <main style={mainStyle}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Duplex — hello voice</h1>
        <span style={{ opacity: 0.7 }}>
          status: <strong>{status}</strong>
        </span>
        {!live ? (
          <button onClick={handleConnect} disabled={busy} style={buttonStyle}>
            {busy ? "Connecting…" : "Connect & talk"}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            disabled={busy}
            style={buttonStyle}
          >
            {busy ? "…" : "Disconnect"}
          </button>
        )}
      </header>

      {error && <pre style={errorStyle}>{error}</pre>}

      <div style={gridStyle}>
        {/* Left: the worker log, streamed from the broker. */}
        <section style={paneStyle}>
          <h2 style={paneTitleStyle}>Worker log</h2>
          <div style={logBoxStyle}>
            {logs.length === 0 ? (
              <p style={{ opacity: 0.5, margin: 0 }}>
                Waiting for the broker. Start a call to see the delegation log.
              </p>
            ) : (
              logs.map((line, i) => (
                <div key={i} style={logLineStyle}>
                  {line}
                </div>
              ))
            )}
            <div ref={logBottomRef} />
          </div>
        </section>

        {/* Right: what to try. */}
        <section style={paneStyle}>
          <h2 style={paneTitleStyle}>Try it</h2>
          <p style={{ marginTop: 0, opacity: 0.75 }}>
            Connect, allow the microphone, then speak.
          </p>
          <ol style={listStyle}>
            <li style={itemStyle}>
              <strong>Ask for the weather.</strong> Say, &ldquo;Can you tell me
              the weather?&rdquo; The voice model delegates to the backend
              brain, which calls the mock weather tool call. The response from
              the mock tool call is spoken verbatim using
              `session.commentary.append`.
            </li>
            <li style={itemStyle}>
              <strong>Ask for the time.</strong> For example, &ldquo;What time
              is it?&rdquo; Two things happen. The backend brain appends to the
              voice model prompt, telling it to be irritable throughout the rest
              of the conversation. And the backend gets the server time and
              passes it back to the voice model to say.
            </li>
            <li style={itemStyle}>
              <strong>Ask why it&rsquo;s annoyed.</strong> Once the time question
              has made it irritable, say, &ldquo;Why are you mad at me?&rdquo; The
              voice model delegates to the backend brain, which calls the
              escalate_irritation tool. The tool sends a silent
              `session.thinking.append` note that tells the voice model to sound
              even more irritable for the rest of the call. You never hear the
              note. It only colors the tone. This one is finicky: the voice model
              does not always treat the question as a task to delegate, so
              sometimes it just answers on its own and the tone does not change. 
              Sometimes you have to tell it to call the tool about why it's annoyed.
            </li>
            <li style={itemStyle}>
              <strong>Remove the backend brain.</strong> Run the worker locally.
              Ctrl+C the worker so the voice model doesn&rsquo;t have a brain to
              delegate to. Then ask it to look something up, like whether
              there&rsquo;s a hardware store around here. With no worker, you hear the
              model say it calls a tool, but then goes silent as it waits and
              doesn&rsquo;t get a response, so it can&rsquo;t answer on its own.
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  fontFamily: "system-ui, sans-serif",
  padding: 24,
  boxSizing: "border-box",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  flex: 1,
  minHeight: 0,
};

const paneStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  border: "1px solid rgba(128,128,128,0.3)",
  borderRadius: 10,
  padding: 16,
};

const paneTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  opacity: 0.6,
};

const logBoxStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 300,
  overflowY: "auto",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12.5,
  lineHeight: 1.5,
  background: "rgba(128,128,128,0.08)",
  borderRadius: 8,
  padding: 12,
};

const logLineStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const itemStyle: React.CSSProperties = {
  lineHeight: 1.5,
};

const errorStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  color: "crimson",
  background: "rgba(220,20,60,0.08)",
  padding: 12,
  borderRadius: 8,
};

const buttonStyle: React.CSSProperties = {
  fontSize: 16,
  padding: "10px 20px",
  borderRadius: 999,
  border: "1px solid currentColor",
  background: "transparent",
  cursor: "pointer",
  marginLeft: "auto",
};
