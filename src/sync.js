// Lightweight P2P sync using PeerJS Cloud (free, no credentials)
// Real-time while peers are online. Data also persists in localStorage.
// Namespace: window.DBSync

(function(){
  const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ];

  const STATE = {
    peer: null,
    isHost: false,
    hostId: null,
    conns: [],
    hostConn: null,
    lastTs: 0,
    getState: null,
    applyState: null,
    statusCb: null,
  };

  function status(s){
    try { STATE.statusCb && STATE.statusCb(String(s)); } catch {}
  }

  function safeParse(data){
    try { return JSON.parse(data); } catch { return null; }
  }

  function send(conn, obj){
    try { conn.open && conn.send(JSON.stringify(obj)); } catch {}
  }

  function broadcast(obj, except){
    if (STATE.isHost) {
      STATE.conns.forEach(c => { if (c !== except) send(c, obj); });
    } else if (STATE.hostConn) {
      send(STATE.hostConn, obj);
    }
  }

  function handleIncoming(obj, fromConn){
    if (!obj || !obj.type) return;
    if (obj.type === 'request-state') {
      if (!STATE.isHost || !STATE.getState) return;
      const current = STATE.getState();
      send(fromConn, { type: 'state', motoboys: current.motoboys || [], ts: current.ts || Date.now() });
      return;
    }

    if (obj.type === 'state' || obj.type === 'update') {
      const remoteTs = Number(obj.ts || 0);
      if (remoteTs <= STATE.lastTs) return;
      STATE.lastTs = remoteTs;
      if (STATE.applyState) STATE.applyState(obj.motoboys || []);
      if (STATE.isHost && obj.type === 'update') {
        // Reencaminha atualização para demais
        broadcast({ type: 'state', motoboys: obj.motoboys || [], ts: remoteTs }, fromConn);
      }
      return;
    }
  }

  function initAsHost(){
    STATE.isHost = true;
    status('host: ready');
    STATE.peer.on('connection', (conn) => {
      STATE.conns.push(conn);
      status(`host: peers ${STATE.conns.length}`);
      conn.on('data', (data) => handleIncoming(safeParse(data), conn));
      conn.on('close', () => {
        STATE.conns = STATE.conns.filter(c => c !== conn);
        status(`host: peers ${STATE.conns.length}`);
      });
      // envia estado inicial ao conectar
      if (STATE.getState) {
        const current = STATE.getState();
        send(conn, { type: 'state', motoboys: current.motoboys || [], ts: current.ts || Date.now() });
      }
    });
  }

  function initAsClient(){
    STATE.isHost = false;
    status('client: connecting');
    const conn = STATE.peer.connect(STATE.hostId, { reliable: true });
    STATE.hostConn = conn;
    conn.on('open', () => {
      status('client: connected');
      send(conn, { type: 'request-state' });
    });
    conn.on('data', (data) => handleIncoming(safeParse(data), conn));
    conn.on('close', () => { STATE.hostConn = null; status('client: disconnected'); });
  }

  window.DBSync = {
    init(workspaceId, getState, applyState){
      STATE.hostId = `db-${workspaceId}`;
      STATE.getState = getState;
      STATE.applyState = applyState;

      // Try host first (fixed id). If unavailable, become client with random id.
      const opts = { host: '0.peerjs.com', port: 443, secure: true, config: { iceServers: ICE }, debug: 2 };
      STATE.peer = new Peer(STATE.hostId, opts);
      STATE.peer.on('open', (id) => {
        if (id === STATE.hostId) {
          initAsHost();
          // host define ts atual
          const current = getState();
          STATE.lastTs = Number(current.ts || 0);
        }
      });
      STATE.peer.on('error', (err) => {
        // If the id is taken OR any error hosting, become client
        status(`host-error: ${err?.type || err}`);
        STATE.peer = new Peer(undefined, opts);
        STATE.peer.on('open', () => initAsClient());
        STATE.peer.on('error', (e2) => status(`client-error: ${e2?.type || e2}`));
      });
    },

    broadcastUpdate(motoboys){
      const ts = Date.now();
      STATE.lastTs = Math.max(STATE.lastTs, ts);
      const payload = { type: 'update', motoboys, ts: STATE.lastTs };
      broadcast(payload, null);
    },

    onStatus(cb){ STATE.statusCb = cb; }
  };
})();
