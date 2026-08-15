const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialDB = {
            users: {
                "Admin": { password: "Adleradm", role: "admin", playerData: null }
            },
            worldData: null, itemDB: null, npcDB: null,
            chat: [{sender: 'Sistema', msg: 'Bem-vindo ao MiniScape!', color: '#f1c40f'}]
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2), 'utf8');
    }
}
initDB();

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8'); }

// Registro
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    let db = readDB();
    if (db.users[username]) return res.status(400).json({ error: 'Usuário já existe!' });
    
    db.users[username] = { password: password, role: 'player', playerData: null };
    writeDB(db);
    res.json({ success: true });
});

// Login / Auto-Login
app.post('/api/login', (req, res) => {
    const { username, password, isSession } = req.body;
    let db = readDB();
    const user = db.users[username];
    
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    if (!isSession && user.password !== password) return res.status(401).json({ error: 'Senha incorreta!' });
    
    res.json({ 
        success: true, role: user.role, playerData: user.playerData,
        worldData: db.worldData, itemDB: db.itemDB, npcDB: db.npcDB, chat: db.chat
    });
});

// Salvar Jogo
app.post('/api/save', (req, res) => {
    const { username, playerData, worldData, itemDB, npcDB } = req.body;
    let db = readDB();
    if (db.users[username]) {
        db.users[username].playerData = playerData; 
        if (db.users[username].role === 'admin') {
            if (worldData) db.worldData = worldData;
            if (itemDB) db.itemDB = itemDB;
            if (npcDB) db.npcDB = npcDB;
        }
        writeDB(db); res.json({ success: true });
    } else { res.status(401).json({ error: 'Sessão inválida.' }); }
});

// Chat Global
app.post('/api/chat', (req, res) => {
    const { sender, msg, color } = req.body;
    let db = readDB();
    if (!db.chat) db.chat = [];
    if(msg) {
        db.chat.push({sender, msg, color});
        if(db.chat.length > 50) db.chat.shift(); // Mantém apenas as últimas 50
        writeDB(db);
    }
    res.json({ chat: db.chat });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor RPG rodando na porta ${PORT}`));