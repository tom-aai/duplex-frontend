// Duplex SDK — browser client (Piece 1: connect & talk).
//
// One ergonomic call that does the whole WebRTC dance against our model (mocked by
// GPT-Live-1): mic capture, the `oai-events` data channel, SDP offer -> broker -> answer,
// and resolving once the session is live. Audio flows browser <-> model directly; the
// only server we touch is our own broker, for the SDP exchange.

export const BROKER_URL =
  process.env.NEXT_PUBLIC_BROKER_URL ?? "http://localhost:8000";

export type DuplexStatus =
  | "requesting-mic"
  | "creating-session"
  | "connecting"
  | "live"
  | "closing"
  | "closed";

export interface ConnectOptions {
  instructions?: string;
  /** "client": tools run in the server-side sideband worker. */
  delegation?: "client";
  onStatus?: (status: DuplexStatus) => void;
}

export interface DuplexSession {
  sessionId: string;
  disconnect: () => Promise<void>;
}

export async function connect(
  opts: ConnectOptions = {},
): Promise<DuplexSession> {
  const setStatus = opts.onStatus ?? (() => {});

  setStatus("requesting-mic");
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });

  const pc = new RTCPeerConnection();

  // Play the model's audio: route the remote track into a hidden <audio> element.
  const audioEl = document.createElement("audio");
  audioEl.autoplay = true;
  document.body.appendChild(audioEl);
  pc.ontrack = (e) => {
    audioEl.srcObject = e.streams[0];
  };

  // Send mic audio.
  mic.getTracks().forEach((track) => pc.addTrack(track, mic));

  // The event/data channel must be created before the offer.
  const events = pc.createDataChannel("oai-events");

  // Build the offer and gather ICE candidates.
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  // Broker the SDP exchange through our server (which holds the API key).
  setStatus("creating-session");
  const resp = await fetch(`${BROKER_URL}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sdp: pc.localDescription?.sdp,
      instructions: opts.instructions,
      delegation: opts.delegation,
    }),
  });
  if (!resp.ok) {
    cleanupMedia(pc, mic, audioEl);
    throw new Error(
      `broker /session failed: ${resp.status} ${await resp.text()}`,
    );
  }
  const { session_id, sdp } = (await resp.json()) as {
    session_id: string;
    sdp: string;
  };

  // Arm the session.started waiter *before* applying the answer to avoid a race.
  const started = waitForEvent(events, "session.started");
  await pc.setRemoteDescription({ type: "answer", sdp });

  setStatus("connecting");
  await started;
  setStatus("live");

  let closed = false;
  async function disconnect() {
    if (closed) return;
    closed = true;
    setStatus("closing");
    try {
      if (events.readyState === "open") {
        const closedEvt = waitForEvent(events, "session.closed", 3000).catch(
          () => {},
        );
        events.send(JSON.stringify({ type: "session.close" }));
        await closedEvt;
      }
    } finally {
      cleanupMedia(pc, mic, audioEl);
      // Tell the broker to tear down the server-side worker for this session, so it detaches
      // the sideband instead of thrashing on reattach after the call ends. Best-effort: a
      // failed teardown call must not break the browser-side cleanup above.
      try {
        await fetch(`${BROKER_URL}/session/${session_id}`, { method: "DELETE" });
      } catch {
        // ignore: the session is already gone from the browser's side.
      }
      setStatus("closed");
    }
  }

  return { sessionId: session_id, disconnect };
}

function cleanupMedia(
  pc: RTCPeerConnection,
  mic: MediaStream,
  audioEl: HTMLAudioElement,
) {
  mic.getTracks().forEach((t) => t.stop());
  pc.close();
  audioEl.srcObject = null;
  audioEl.remove();
}

function waitForIceGathering(
  pc: RTCPeerConnection,
  timeoutMs = 10000,
): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

function waitForEvent(
  events: RTCDataChannel,
  type: string,
  timeoutMs = 15000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg?.type === type) {
        cleanup();
        resolve(msg);
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error(`data channel error while waiting for ${type}`));
    };
    const cleanup = () => {
      events.removeEventListener("message", onMessage);
      events.removeEventListener("error", onError);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${type}`));
    }, timeoutMs);
    events.addEventListener("message", onMessage);
    events.addEventListener("error", onError);
  });
}
