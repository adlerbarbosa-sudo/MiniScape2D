// Webhook de deploy: o GitHub avisa a cada push na main, e a VM se atualiza sozinha.
// Segurança: só aceita POST /_deploy com assinatura HMAC válida (segredo em /etc/miniscape.hook), só para a branch main.
// Se o jogo não subir depois da atualização, volta sozinho para a versão anterior.
const http = require('http'), crypto = require('crypto'), fs = require('fs'), { execFile } = require('child_process');
const APP = process.env.APP_DIR || '/opt/miniscape';
const SECRET = fs.readFileSync(process.env.HOOK_SECRET_FILE || '/etc/miniscape.hook', 'utf8').trim();
const PORT = +process.env.HOOK_PORT || 9000;
const HEALTH = process.env.HEALTH_URL || 'http://127.0.0.1:3000/healthz';
const RESTART = process.env.RESTART_CMD ? process.env.RESTART_CMD.split(' ') : ['sudo', '-n', 'systemctl', 'restart', 'miniscape'];
const log = (m) => console.log(new Date().toISOString() + ' ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { cwd: APP, timeout: 240000, env: process.env }, (e, so, se) => e ? rej(new Error(String(se || e.message).slice(-400))) : res(String(so).trim())));
const restart = () => run(RESTART[0], RESTART.slice(1));
async function healthy() { for (let i = 0; i < 20; i++) { await sleep(1000); try { const r = await fetch(HEALTH); if (r.ok) return true; } catch (e) {} } return false; }

let busy = false, again = false;
async function deploy() {
    if (busy) { again = true; return; }
    busy = true;
    try {
        const prev = await run('git', ['rev-parse', 'HEAD']);
        await run('git', ['fetch', 'origin', 'main']);
        const next = await run('git', ['rev-parse', 'origin/main']);
        if (next === prev) { log('já está na versão mais recente (' + prev.slice(0, 7) + ')'); return; }
        log('atualizando ' + prev.slice(0, 7) + ' -> ' + next.slice(0, 7));
        await run('git', ['reset', '--hard', 'origin/main']);
        await run('npm', ['install', '--omit=dev']);
        await restart();
        if (await healthy()) { log('OK: versão ' + next.slice(0, 7) + ' no ar'); return; }
        log('FALHOU: o jogo não subiu. Voltando para ' + prev.slice(0, 7));
        await run('git', ['reset', '--hard', prev]); await run('npm', ['install', '--omit=dev']); await restart();
        log((await healthy()) ? 'versão anterior restaurada' : 'ATENÇÃO: a versão anterior também não subiu, veja: journalctl -u miniscape');
    } catch (e) { log('erro: ' + e.message); }
    finally { busy = false; if (again) { again = false; deploy(); } }
}

http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/_deploy') { res.writeHead(404); return res.end(); }
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 2e6) { req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
        const body = Buffer.concat(chunks);
        const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
        const got = String(req.headers['x-hub-signature-256'] || '');
        if (got.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(sig))) { log('assinatura inválida, ignorado'); res.writeHead(401); return res.end('assinatura inválida'); }
        const ev = req.headers['x-github-event'];
        if (ev === 'ping') { res.writeHead(200); return res.end('pong'); }
        let ref = ''; try { ref = JSON.parse(body.toString()).ref; } catch (e) {}
        if (ev !== 'push' || ref !== 'refs/heads/main') { res.writeHead(200); return res.end('ignorado'); }
        res.writeHead(202); res.end('deploy iniciado'); deploy();
    });
}).listen(PORT, '127.0.0.1', () => log('webhook escutando em 127.0.0.1:' + PORT));
