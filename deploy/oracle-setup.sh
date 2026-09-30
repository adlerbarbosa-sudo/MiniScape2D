#!/usr/bin/env bash
# Instala o MiniScape 2D numa VM Ubuntu 22.04/24.04 (Oracle Cloud Always Free ou qualquer VPS).
# Uso:  curl -fsSL https://raw.githubusercontent.com/adlerbarbosa-sudo/miniscape2d/main/deploy/oracle-setup.sh -o setup.sh && bash setup.sh
# Opcional: DOMAIN=meujogo.duckdns.org bash setup.sh   (liga HTTPS automático com Caddy)
# Rodar de novo atualiza o jogo (git pull) sem mexer nas contas (ficam em /var/lib/miniscape).
set -euo pipefail

REPO="https://github.com/adlerbarbosa-sudo/miniscape2d.git"
APP=/opt/miniscape
DATA=/var/lib/miniscape
ENVF=/etc/miniscape.env
USER_RUN="${SUDO_USER:-$(whoami)}"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

# ---------- 1. swap (a VM grátis tem só 1 GB de RAM) ----------
if ! swapon --show | grep -q .; then
  say "Criando 2 GB de swap"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# ---------- 2. pacotes ----------
say "Instalando Node 22, git e Caddy"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent
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

# ---------- 4. dados persistentes (FORA da pasta do jogo, sobrevivem a qualquer atualização) ----------
sudo mkdir -p "$DATA" && sudo chown "$USER_RUN":"$USER_RUN" "$DATA"

# ---------- 5. senha do admin ----------
if [ ! -f "$ENVF" ]; then
  echo
  read -r -p "Nome do usuário admin do jogo [Admin]: " AU </dev/tty; AU="${AU:-Admin}"
  while true; do read -r -s -p "Senha do admin (mín. 8 caracteres): " AP </dev/tty; echo; [ "${#AP}" -ge 8 ] && break; echo "Muito curta."; done
  sudo tee "$ENVF" >/dev/null <<ENV
PORT=3000
DATA_DIR=$DATA
ADMIN_USER=$AU
ADMIN_PASSWORD=$AP
ENV
  sudo chmod 600 "$ENVF"
fi

# ---------- 6. serviço (sobe sozinho no boot e se cair) ----------
say "Configurando o serviço"
sudo tee /etc/systemd/system/miniscape.service >/dev/null <<UNIT
[Unit]
Description=MiniScape 2D
After=network.target
[Service]
User=$USER_RUN
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now miniscape && sudo systemctl restart miniscape

# ---------- 7. Caddy (porta 80, ou HTTPS se DOMAIN for informado) ----------
# o domínio fica guardado em /etc/miniscape.domain: rodar de novo sem DOMAIN= mantém o HTTPS
if [ -n "${DOMAIN:-}" ]; then echo "$DOMAIN" | sudo tee /etc/miniscape.domain >/dev/null; fi
[ -z "${DOMAIN:-}" ] && [ -f /etc/miniscape.domain ] && DOMAIN="$(cat /etc/miniscape.domain)"
if [ -n "${DOMAIN:-}" ]; then SITE="$DOMAIN"; else SITE=":80"; fi
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$SITE {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
CADDY
sudo systemctl enable --now caddy && sudo systemctl reload caddy || sudo systemctl restart caddy

# ---------- 8. firewall da VM (as imagens da Oracle bloqueiam 80/443 por padrão) ----------
for p in 80 443; do sudo iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport $p -j ACCEPT; done
sudo netfilter-persistent save >/dev/null 2>&1 || true

# ---------- 9. backup diário (7 dias) ----------
sudo mkdir -p /var/backups/miniscape
sudo tee /etc/cron.d/miniscape-backup >/dev/null <<CRON
30 4 * * * root tar czf /var/backups/miniscape/miniscape-\$(date +\%F).tar.gz -C $DATA . && find /var/backups/miniscape -name 'miniscape-*.tar.gz' -mtime +7 -delete
CRON

IP="$(curl -fsS https://ifconfig.me 2>/dev/null || echo SEU_IP)"
say "Pronto!"
echo "Jogo:    ${DOMAIN:+https://$DOMAIN}${DOMAIN:-http://$IP}"
echo "Status:  sudo systemctl status miniscape     Logs: journalctl -u miniscape -f"
echo "Contas:  $DATA   (backup diário em /var/backups/miniscape)"
echo "Atualizar o jogo no futuro: bash setup.sh   (não apaga contas)"
