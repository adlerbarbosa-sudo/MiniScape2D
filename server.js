const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

// Inicialização segura
function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialDB = {
            users: { "Admin": { password: "Adleradm", role: "admin", playerData: null } },
            worldData: null, itemDB: null, npcDB: null,
            chat: [{sender: 'Sistema', msg: 'Servidor iniciado!', color: '#2ecc71'}],
            mapVersion: Date.now() // Controle de Atualização de Mundo
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2), 'utf8');
    } else {
        // Garante que DBs antigas ganhem a tag mapVersion
        let db = readDB();
        if(!db.mapVersion) { db.mapVersion = Date.now(); writeDB(db); }
    }
}
initDB();

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8'); }

let activePlayers = {}; // Multiplayer em Tempo Real na RAM (Super Leve)

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    let db = readDB();
    if (db.users[username]) return res.status(400).json({ error: 'Usuário já existe!' });
    
    db.users[username] = { password: password, role: 'player', playerData: null };
    writeDB(db);
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    let db = readDB();
    const user = db.users[username];
    if (!user || user.password !== password) return res.status(401).json({ error: 'Senha incorreta!' });
    
    res.json({ 
        success: true, role: user.role, playerData: user.playerData,
        worldData: db.worldData, itemDB: db.itemDB, npcDB: db.npcDB, chat: db.chat,
        mapVersion: db.mapVersion
    });
});

app.post('/api/save', (req, res) => {
    const { username, playerData, worldData, itemDB, npcDB } = req.body;
    let db = readDB();
    if (db.users[username]) {
        db.users[username].playerData = playerData; 
        if (db.users[username].role === 'admin') { 
            // Admin modifica o mundo e atualiza a versão para os players baixarem
            if (worldData) { db.worldData = worldData; db.mapVersion = Date.now(); }
            if (itemDB) db.itemDB = itemDB;
            if (npcDB) db.npcDB = npcDB;
        }
        writeDB(db); res.json({ success: true, mapVersion: db.mapVersion });
    } else { res.status(401).json({ error: 'Sessão inválida.' }); }
});

// ROTA SUPER LEVE PARA O MOTOR DE JOGO (Sem trafegar o mapa pesado)
app.post('/api/sync', (req, res) => {
    const { username, x, y, map } = req.body;
    let db = readDB();

    if (username) { activePlayers[username] = { x, y, map, lastSeen: Date.now() }; }

    let now = Date.now();
    let visiblePlayers = {};
    
    for(let u in activePlayers) {
        if (now - activePlayers[u].lastSeen > 4000) { delete activePlayers[u]; } 
        else if (u !== username && activePlayers[u].map === map) { visiblePlayers[u] = activePlayers[u]; }
    }

    res.json({ players: visiblePlayers, chat: db.chat, mapVersion: db.mapVersion });
});

// ROTA EXCLUSIVA PARA BAIXAR O MAPA SOMENTE QUANDO HÁ MUDANÇAS
app.get('/api/map', (req, res) => {
    res.json({ worldData: readDB().worldData });
});

app.post('/api/chat', (req, res) => {
    const { sender, msg, color } = req.body;
    let db = readDB();
    if (!db.chat) db.chat = [];
    if(msg) {
        db.chat.push({sender, msg, color});
        if(db.chat.length > 50) db.chat.shift();
        writeDB(db);
    }
    res.json({ chat: db.chat });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));