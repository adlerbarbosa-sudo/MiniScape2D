'use strict';
/* WebSocket mínimo (RFC 6455), sem dependências: só texto, o suficiente para o jogo.
   O cliente sempre pode cair de volta para HTTP; este canal só reduz latência e sobrecarga. */
const crypto = require('crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(op, payload) {
    const len = payload.length; let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    return Buffer.concat([head, payload]);
}

function makeConn(socket, maxPayload) {
    const handlers = { message: [], close: [] };
    let buf = Buffer.alloc(0), frags = [], fragLen = 0, closed = false, alive = true;
    const conn = {
        on(ev, fn) { handlers[ev].push(fn); return conn; },
        send(str) { if (closed) return false; try { socket.write(frame(0x1, Buffer.from(str, 'utf8'))); return true; } catch (e) { return false; } },
        close(code) { if (closed) return; try { const b = Buffer.alloc(2); b.writeUInt16BE(code || 1000); socket.write(frame(0x8, b)); } catch (e) { } finish(); },
        get open() { return !closed; }
    };
    function finish() { if (closed) return; closed = true; clearInterval(pinger); try { socket.end(); socket.destroy(); } catch (e) { } handlers.close.forEach((f) => { try { f(); } catch (e) { } }); }
    function fail() { conn.close(1002); }
    function parse() {
        for (; ;) {
            if (buf.length < 2) return;
            const b0 = buf[0], b1 = buf[1], fin = !!(b0 & 0x80), op = b0 & 0x0f, masked = !!(b1 & 0x80); let len = b1 & 0x7f, off = 2;
            if (b0 & 0x70) return fail();       // bits RSV não negociados
            if (!masked) return fail();         // cliente sempre mascara
            if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (buf.length < 10) return; const big = buf.readBigUInt64BE(2); if (big > BigInt(maxPayload)) return conn.close(1009); len = Number(big); off = 10; }
            if (len > maxPayload) return conn.close(1009);
            if (buf.length < off + 4 + len) return;
            const mask = buf.subarray(off, off + 4); const data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
            for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
            buf = buf.subarray(off + 4 + len);
            if (op >= 0x8) {   // controle
                if (!fin || len > 125) return fail();
                if (op === 0x8) { return conn.close(1000); }
                if (op === 0x9) { try { socket.write(frame(0xA, data)); } catch (e) { } } else if (op === 0xA) alive = true;
                continue;
            }
            if (op === 0x0 || op === 0x1) {
                if (op === 0x1 && frags.length) return fail(); if (op === 0x0 && !frags.length) return fail();
                fragLen += data.length; if (fragLen > maxPayload) return conn.close(1009); frags.push(data);
                if (fin) { const msg = Buffer.concat(frags).toString('utf8'); frags = []; fragLen = 0; handlers.message.forEach((f) => { try { f(msg); } catch (e) { console.error('[ws]', e); } }); }
            } else return fail();   // binário/desconhecido
        }
    }
    socket.on('data', (d) => { buf = buf.length ? Buffer.concat([buf, d]) : d; parse(); });
    socket.on('close', finish); socket.on('error', finish);
    const pinger = setInterval(() => { if (!alive) return finish(); alive = false; try { socket.write(frame(0x9, Buffer.alloc(0))); } catch (e) { } }, 25000); pinger.unref();
    conn._feed = (d) => { buf = Buffer.concat([buf, d]); parse(); };
    return conn;
}

function attach(server, opts) {
    const path = opts.path || '/ws', maxPayload = opts.maxPayload || 131072; let count = 0;
    server.on('upgrade', (req, socket) => {
        let pathname = ''; try { pathname = new URL(req.url, 'http://x').pathname; } catch (e) { }
        const key = req.headers['sec-websocket-key'];
        if (pathname !== path || String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') { socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return socket.destroy(); }
        const origin = req.headers.origin; if (origin) { try { if (new URL(origin).host !== req.headers.host) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return socket.destroy(); } } catch (e) { return socket.destroy(); } }
        if (count >= (opts.maxConns || 400)) { socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return socket.destroy(); }
        const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
        socket.setNoDelay(true); count++;
        const conn = makeConn(socket, maxPayload); conn.on('close', () => { count--; });
        opts.onConnect(conn, req);
    });
}
module.exports = { attach, frame };
