// Webhook de deploy: o GitHub avisa a cada push na main, e a VM se atualiza sozinha.
// Segurança: só escuta em 127.0.0.1 (o Caddy encaminha /_deploy), só aceita POST /_deploy com assinatura HMAC-SHA256 válida
// (segredo em /etc/miniscape.hook), corpo de no máximo 1 MB, só para a branch main (e, se HOOK_REPO estiver definido, só desse repositório).
// Se o jogo não subir depois da atualização, volta sozinho para a versão anterior. O banco de dados fica FORA da pasta do código e nunca é tocado.
const http = require('http'), crypto = require('crypto'), fs = require('fs'), { execFile } = require('child_process');
const APP = process.env.APP_DIR || '/opt/miniscape';
const SECRET = fs.readFileSync(process.env.HOOK_SECRET_FILE || '/etc/miniscape.hook', 'utf8').trim();
if (SECRET.length < 16) { console.error('segredo do webhook curto demais (mínimo 16 caracteres)'); process.exit(1); }
const PORT = +process.env.HOOK_PORT || 9000;
const HEALTH = process.env.HEALTH_URL || 'http://127.0.0.1:3000/healthz';
const REPO = (process.env.HOOK_REPO || '').toLowerCase();   // ex.: adlerbarbosa-sudo/miniscape2d (opcional)
const MAX_BODY = 1024 * 1024;
const RESTART = process.env.RESTART_CMD ? process.env.RESTART_CMD.split(' ') : ['sudo', '-n', 'systemctl', 'restart', 'miniscape'];
const log = (m) => console.log(new Date().toISOString() + ' ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { cwd: APP, timeout: 240000, env: process.env, maxBuffer: 8 * 1024 * 1024 }, (e, so, se) => e ? rej(new Error(String(se || e.message).slice(-400))) : res(String(so).trim())));
const restart = () => run(RESTART[0], RESTART.slice(1));
// o jogo leva alguns segundos para ler o banco e abrir a porta: espera até ~45 s antes de considerar que falhou
async function healthy() { for (let i = 0; i < 45; i++) { await sleep(1000); try { const r = await fetch(HEALTH, { signal: AbortSignal.timeout(3000) }); if (r.ok) return true; } catch (e) { } } return false; }
process.on('uncaughtException', (e) => log('erro não tratado: ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => log('promessa rejeitada: ' + (e && e.stack || e)));

let busy = false, again = false;
async function deploy() {
    if (busy) { again = true; return; }
    busy = true;
    let prev = '', moved = false;
    try {
        prev = await run('git', ['rev-parse', 'HEAD']);
        await run('git', ['fetch', 'origin', 'main']);
        const next = await run('git', ['rev-parse', 'origin/main']);
        if (next === prev) { log('já está na versão mais recente (' + prev.slice(0, 7) + ')'); return; }
        log('atualizando ' + prev.slice(0, 7) + ' -> ' + next.slice(0, 7));
        await run('git', ['reset', '--hard', 'origin/main']); moved = true;
        await run('npm', ['install', '--omit=dev']);
        await run('node', ['--check', 'server.js']);   // erro de sintaxe: nem reinicia o jogo
        await restart();
        if (await healthy()) { log('OK: versão ' + next.slice(0, 7) + ' no ar'); return; }
        throw new Error('o jogo não subiu depois da atualização');
    } catch (e) {
        log('erro: ' + e.message);
        if (moved && prev) {   // qualquer falha depois de trocar o código: volta para a versão anterior
            try {
                log('voltando para ' + prev.slice(0, 7));
                await run('git', ['reset', '--hard', prev]); await run('npm', ['install', '--omit=dev']); await restart();
                log((await healthy()) ? 'versão anterior restaurada' : 'ATENÇÃO: a versão anterior também não subiu, veja: journalctl -u miniscape');
            } catch (e2) { log('falha ao voltar: ' + e2.message); }
        }
    } finally { busy = false; if (again) { again = false; deploy(); } }
}

const server = http.createServer((req, res) => {
    try {
        if (req.method !== 'POST' || req.url !== '/_deploy') { res.writeHead(404); return res.end(); }
        const clen = +req.headers['content-length'];
        if (Number.isFinite(clen) && clen > MAX_BODY) { res.writeHead(413); return res.end(); }
        const chunks = []; let size = 0, dead = false;
        req.on('data', (c) => { if (dead) return; size += c.length; if (size > MAX_BODY) { dead = true; res.writeHead(413, { Connection: 'close' }); res.end(); req.destroy(); } else chunks.push(c); });
        req.on('error', () => { dead = true; });
        req.on('end', () => {
            if (dead) return;
            const body = Buffer.concat(chunks);
            const want = crypto.createHmac('sha256', SECRET).update(body).digest();   // 32 bytes
            const m = /^sha256=([0-9a-f]{64})$/i.exec(String(req.headers['x-hub-signature-256'] || ''));
            const got = m ? Buffer.from(m[1], 'hex') : null;
            if (!got || got.length !== want.length || !crypto.timingSafeEqual(got, want)) { log('assinatura inválida, ignorado'); res.writeHead(401); return res.end('assinatura inválida'); }
            const ev = req.headers['x-github-event'];
            if (ev === 'ping') { res.writeHead(200); return res.end('pong'); }
            let j = {}; try { j = JSON.parse(body.toString()) || {}; } catch (e) { }
            if (REPO && String((j.repository && j.repository.full_name) || '').toLowerCase() !== REPO) { log('repositório diferente de ' + REPO + ', ignorado'); res.writeHead(200); return res.end('ignorado'); }
            if (ev !== 'push' || j.ref !== 'refs/heads/main') { res.writeHead(200); return res.end('ignorado'); }
            res.writeHead(202); res.end('deploy iniciado'); deploy();
        });
    } catch (e) { log('erro no pedido: ' + e.message); try { res.writeHead(500); res.end(); } catch (_) { } }
});
server.headersTimeout = 10000; server.requestTimeout = 15000; server.maxHeadersCount = 50;
server.on('clientError', (e, sock) => { try { sock.destroy(); } catch (_) { } });
server.listen(PORT, '127.0.0.1', () => log('webhook escutando em 127.0.0.1:' + PORT));
