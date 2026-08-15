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
            chat: [{sender: 'Sistema', msg: 'Servidor online!', color: '#2ecc71'}],
            mapVersion: Date.now()
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2), 'utf8');
    } else {
        let db = readDB();
        if(!db.mapVersion) { db.mapVersion = Date.now(); writeDB(db); }
    }
}
initDB();

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8'); }

let activePlayers = {}; 
let mapHosts = {}; // Mestre de cálculo de AI por Mapa
let mapEntitiesRAM = {}; // Posição global dos monstros

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    let db = readDB();
    if (db.users[username]) return res.status(400).json({ error: 'Usuário já existe!' });
    
    let role = username.toLowerCase() === 'admin' ? 'admin' : 'player';
    db.users[username] = { password: password, role: role, playerData: null };
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
        
        // MUDANÇA GLOBAL: Alterações no mapa esmagam a versão velha. O mundo é um só.
        if (worldData) { db.worldData = worldData; db.mapVersion = Date.now(); }
        
        if (db.users[username].role === 'admin') { 
            if (itemDB) db.itemDB = itemDB;
            if (npcDB) db.npcDB = npcDB;
        }
        writeDB(db); res.json({ success: true, mapVersion: db.mapVersion });
    } else { res.status(401).json({ error: 'Sessão inválida.' }); }
});

// A MÁGICA DA SINCRONIZAÇÃO EM TEMPO REAL SEM LAG
app.post('/api/sync', (req, res) => {
    const { username, x, y, map, facing, actionAnim, equipment, entities } = req.body;
    let db = readDB();

    if (username) { 
        activePlayers[username] = { x, y, map, facing, actionAnim, equipment, lastSeen: Date.now() }; 
    }

    let now = Date.now();
    let visiblePlayers = {};
    
    for(let u in activePlayers) {
        if (now - activePlayers[u].lastSeen > 4000) { 
            if(mapHosts[activePlayers[u].map] === u) delete mapHosts[activePlayers[u].map];
            delete activePlayers[u]; 
        } 
        else if (u !== username && activePlayers[u].map === map) { 
            visiblePlayers[u] = activePlayers[u]; 
        }
    }

    // Eleição de Host: Quem está há mais tempo (ou o Admin) roda a IA para todos.
    let currentHost = mapHosts[map];
    if (!currentHost || !activePlayers[currentHost] || activePlayers[currentHost].map !== map) {
        mapHosts[map] = username;
    } else if (username.toLowerCase() === 'admin') {
        mapHosts[map] = username; // Admin é Host Soberano
    }

    let isHost = (mapHosts[map] === username);

    if (isHost && entities) {
        mapEntitiesRAM[map] = entities;
    }

    res.json({ 
        players: visiblePlayers, 
        chat: db.chat, 
        mapVersion: db.mapVersion,
        syncEntities: (!isHost && mapEntitiesRAM[map]) ? mapEntitiesRAM[map] : null,
        isHost: isHost
    });
});

app.get('/api/map', (req, res) => { res.json({ worldData: readDB().worldData }); });

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