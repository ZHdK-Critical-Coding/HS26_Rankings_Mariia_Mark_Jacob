/* Shared protocol between engine.html and the display pages.

   BroadcastChannel("ranking") messages:
     {type:"hello"}                      display -> engine : please send a full snapshot
     {type:"snapshot", seq, categories:[{name,headline}], rankings:{cat:[{id,title,image}]}}
     {type:"duel", seq, category, positions:[i, i+1]  (0-based, i = upper),
        a:{id,title,image}  (entity that was at i before the duel),
        b:{id,title,image}  (entity that was at i+1 before the duel),
        metric, values:[valueA, valueB], winner:id, swapped:bool}
   seq increases by 1 per duel; a gap means a display missed something -> it asks for a snapshot. */

const CHANNEL_NAME = "ranking";
const TIERS = ["S", "A", "B", "C", "D"];

/** Tier index 0..4 for a 0-based position, equal fifths. */
function tierOf(pos, n) {
  return Math.min(TIERS.length - 1, Math.floor((pos * TIERS.length) / n));
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Connects a display page. Calls onSnapshot(msg) and onDuel(msg); handles resync. */
function connectDisplay({ onSnapshot, onDuel, onStatus = () => {} }) {
  const ch = new BroadcastChannel(CHANNEL_NAME);
  let seq = null;
  let retry = null;

  function requestSnapshot() {
    ch.postMessage({ type: "hello" });
    clearInterval(retry);
    // keep asking until an engine answers (engine might be opened later)
    retry = setInterval(() => ch.postMessage({ type: "hello" }), 2000);
    onStatus("waiting for engine…");
  }

  ch.onmessage = ({ data: msg }) => {
    if (msg.type === "snapshot") {
      clearInterval(retry);
      seq = msg.seq;
      onStatus("live");
      onSnapshot(msg);
    } else if (msg.type === "duel") {
      if (seq === null) return;                       // no snapshot yet
      if (msg.seq !== seq + 1) { seq = null; requestSnapshot(); return; }
      seq = msg.seq;
      onDuel(msg);
    }
  };

  requestSnapshot();
  return { requestSnapshot: () => { seq = null; requestSnapshot(); } };
}
