#!/usr/bin/env bash
# Instala o MiniScape 2D numa VM Ubuntu 22.04/24.04 (Oracle Cloud Always Free ou qualquer VPS).
# Uso:  curl -fsSL https://raw.githubusercontent.com/adlerbarbosa-sudo/miniscape2d/main/deploy/oracle-setup.sh -o setup.sh && bash setup.sh
# Opcional: DOMAIN=meujogo.duckdns.org bash setup.sh   (liga HTTPS automático com Caddy)
# Sem terminal (automação): ADMIN_USER=Admin ADMIN_PASSWORD='senha-forte' bash setup.sh
# Rodar de novo atualiza o jogo (git pull) e reaplica a configuração SEM apagar nada: contas, backups e logs ficam em /var/lib/miniscape.
set -euo pipefail

REPO="https://github.com/adlerbarbosa-sudo/miniscape2d.git"
APP=/opt/miniscape
DATA=/var/lib/miniscape
ENVF=/etc/miniscape.env
USER_RUN="${SUDO_USER:-$(whoami)}"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

# ---------- 0. usuário que roda o jogo: nunca root ----------
if [ "$USER_RUN" = "root" ]; then
  id miniscape >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /home/miniscape --shell /usr/sbin/nologin miniscape
  USER_RUN=miniscape
fi

# ---------- 1. swap (a VM grátis tem só 1 GB de RAM) ----------
if ! swapon --show | grep -q .; then
  say "Criando 2 GB de swap"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# ---------- 2. pacotes ----------
say "Instalando Node 22, git, logrotate e Caddy"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent logrotate
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y && sudo apt-get install -y caddy
fi

# ---------- 3. código ----------
say "Baixando o jogo"
if [ -d "$APP/.git" ]; then sudo -u "$USER_RUN" git -C "$APP" pull --ff-only; else
  sudo mkdir -p "$APP" && sudo chown "$USER_RUN":"$USER_RUN" "$APP" && sudo -u "$USER_RUN" git clone "$REPO" "$APP"; fi
( cd "$APP" && sudo -u "$USER_RUN" npm install --omit=dev )

# ---------- 4. dados persistentes (FORA da pasta do jogo, sobrevivem a qualquer atualização; só o dono lê: têm hashes de senha) ----------
sudo mkdir -p "$DATA" && sudo chown "$USER_RUN":"$USER_RUN" "$DATA" && sudo chmod 750 "$DATA"
sudo chmod -R u+rwX,g-w,o-rwx "$DATA" 2>/dev/null || true

# ---------- 5. senha do admin e variáveis do jogo ----------
# valores entre aspas para o systemd (aspas e barras invertidas escapadas): senhas com $ # " \ ou espaços funcionam
envq() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
if [ ! -f "$ENVF" ]; then
  AU="${ADMIN_USER:-}"; AP="${ADMIN_PASSWORD:-}"
  if [ -z "$AP" ]; then
    echo
    read -r -p "Nome do usuário admin do jogo [Admin]: " AU </dev/tty; AU="${AU:-Admin}"
    while true; do read -r -s -p "Senha do admin (mín. 8 caracteres): " AP </dev/tty; echo; [ "${#AP}" -ge 8 ] && break; echo "Muito curta."; done
  fi
  AU="${AU:-Admin}"
  [ "${#AP}" -ge 8 ] || { echo "ADMIN_PASSWORD precisa ter ao menos 8 caracteres."; exit 1; }
  # umask 077: o arquivo já nasce só-do-dono (sem janela com permissão aberta)
  sudo bash -c "umask 077; cat > '$ENVF'" <<ENV
PORT=3000
HOST=127.0.0.1
DATA_DIR=$DATA
ADMIN_USER="$(envq "$AU")"
ADMIN_PASSWORD="$(envq "$AP")"
ENV
  sudo chmod 600 "$ENVF"
fi
# reexecução: garante as variáveis novas sem tocar nas existentes (idempotente)
grep -q '^HOST=' "$ENVF" || echo 'HOST=127.0.0.1' | sudo tee -a "$ENVF" >/dev/null
grep -q '^DATA_DIR=' "$ENVF" || echo "DATA_DIR=$DATA" | sudo tee -a "$ENVF" >/dev/null
grep -q '^PORT=' "$ENVF" || echo 'PORT=3000' | sudo tee -a "$ENVF" >/dev/null
sudo chmod 600 "$ENVF"

# ---------- 6. serviço (sobe sozinho no boot e se cair; SIGTERM salva o banco antes de sair) ----------
say "Configurando o serviço"
sudo tee /etc/systemd/system/miniscape.service >/dev/null <<UNIT
[Unit]
Description=MiniScape 2D
After=network.target
StartLimitIntervalSec=0
[Service]
User=$USER_RUN
WorkingDirectory=$APP
EnvironmentFile=$ENVF
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=512
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=45
LimitNOFILE=8192
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now miniscape && sudo systemctl restart miniscape

# ---------- 6b. webhook de deploy automático (GitHub avisa a cada push na main) ----------
say "Configurando o deploy automático (webhook)"
HOOKF=/etc/miniscape.hook
[ -f "$HOOKF" ] || { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' | sudo bash -c "umask 077; cat > '$HOOKF'"; }
sudo chown "$USER_RUN":"$USER_RUN" "$HOOKF" && sudo chmod 600 "$HOOKF"
echo "$USER_RUN ALL=(root) NOPASSWD: /usr/bin/systemctl restart miniscape, /bin/systemctl restart miniscape" | sudo tee /etc/sudoers.d/miniscape-hook >/dev/null
sudo chmod 440 /etc/sudoers.d/miniscape-hook && sudo visudo -cf /etc/sudoers.d/miniscape-hook >/dev/null
sudo tee /etc/systemd/system/miniscape-hook.service >/dev/null <<UNIT
[Unit]
Description=MiniScape deploy webhook
After=network.target
StartLimitIntervalSec=0
[Service]
User=$USER_RUN
Environment=APP_DIR=$APP
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=$(command -v node) $APP/deploy/hook.js
Restart=always
RestartSec=3
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now miniscape-hook && sudo systemctl restart miniscape-hook

# ---------- 7. Caddy (porta 80, ou HTTPS se DOMAIN for informado) ----------
# o domínio fica guardado em /etc/miniscape.domain: rodar de novo sem DOMAIN= mantém o HTTPS
if [ -n "${DOMAIN:-}" ]; then echo "$DOMAIN" | sudo tee /etc/miniscape.domain >/dev/null; fi
[ -z "${DOMAIN:-}" ] && [ -f /etc/miniscape.domain ] && DOMAIN="$(cat /etc/miniscape.domain)"
if [ -n "${DOMAIN:-}" ]; then SITE="$DOMAIN"; else SITE=":80"; fi
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$SITE {
    encode gzip
    request_body {
        max_size 32MB
    }
    handle /_deploy {
        request_body {
            max_size 1MB
        }
        reverse_proxy 127.0.0.1:9000
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
CADDY
sudo systemctl enable --now caddy && sudo systemctl reload caddy || sudo systemctl restart caddy

# ---------- 8. firewall da VM (as imagens da Oracle bloqueiam 80/443 por padrão; a porta 3000 NÃO é aberta) ----------
for p in 80 443; do sudo iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport $p -j ACCEPT; done
sudo netfilter-persistent save >/dev/null 2>&1 || true

# ---------- 9. backup diário (14 dias) + rotação dos logs ----------
sudo mkdir -p /var/backups/miniscape && sudo chmod 700 /var/backups/miniscape
sudo tee /etc/cron.d/miniscape-backup >/dev/null <<CRON
SHELL=/bin/bash
30 4 * * * root umask 077; nice -n 10 tar czf /var/backups/miniscape/miniscape-\$(date +\%F).tar.gz --warning=no-file-changed --exclude='*.tmp' -C $DATA . ; find /var/backups/miniscape -name 'miniscape-*.tar.gz' -mtime +14 -delete
CRON
sudo chmod 644 /etc/cron.d/miniscape-backup
# o jogo já limita o tamanho dos logs (security.log: 8 arquivos de 1 MB; admin-gifts.log: 20 de 2 MB); o logrotate arquiva e comprime por data
sudo tee /etc/logrotate.d/miniscape >/dev/null <<LOGR
$DATA/security.log {
    weekly
    rotate 12
    dateext
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su $USER_RUN $USER_RUN
}
$DATA/admin-gifts.log {
    monthly
    rotate 24
    dateext
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su $USER_RUN $USER_RUN
}
LOGR
sudo logrotate -d /etc/logrotate.d/miniscape >/dev/null 2>&1 || echo "(aviso) logrotate -d reclamou da configuração; confira /etc/logrotate.d/miniscape"

# ---------- 10. conferência ----------
sleep 3
if curl -fsS --max-time 5 http://127.0.0.1:3000/healthz >/dev/null 2>&1; then say "Jogo respondendo em /healthz"; else echo "ATENÇÃO: o jogo ainda não respondeu em /healthz. Veja: journalctl -u miniscape -n 50"; fi

IP="$(curl -fsS https://ifconfig.me 2>/dev/null || echo SEU_IP)"
say "Pronto!"
echo "Jogo:    ${DOMAIN:+https://$DOMAIN}${DOMAIN:-http://$IP}"
echo "Status:  sudo systemctl status miniscape     Logs: journalctl -u miniscape -f"
echo "Contas:  $DATA   (backup diário em /var/backups/miniscape, 14 dias)"
BASEURL="${DOMAIN:+https://$DOMAIN}${DOMAIN:-http://$IP}"
echo
echo "Deploy automático (configure UMA vez no GitHub: repositório > Settings > Webhooks > Add webhook):"
echo "  Payload URL:  $BASEURL/_deploy"
echo "  Content type: application/json"
echo "  Secret:       $(cat $HOOKF)"
echo "  Evento:       Just the push event"
echo "  Logs do deploy: journalctl -u miniscape-hook -f"
echo
echo "Atualizar o jogo à mão no futuro: bash setup.sh   (não apaga contas)"
