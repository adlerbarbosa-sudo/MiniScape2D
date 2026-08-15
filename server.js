const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Hospeda os arquivos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = './database.json';

// Cria o banco de dados inicial se não existir
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, worldData: null, itemDB: null, npcDB: null }));
}

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE)); }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

// Rota de Registro
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    let db = readDB();
    
    if (db.users[username]) return res.status(400).json({ error: 'Usuário já existe!' });
    
    // O PRIMEIRO usuário a criar conta vira Admin. Os próximos viram 'player'.
    const isFirstUser = Object.keys(db.users).length === 0;
    
    db.users[username] = {
        password: password, 
        role: isFirstUser ? 'admin' : 'player',
        playerData: null // Inicia sem personagem
    };
    writeDB(db);
    res.json({ success: true, message: 'Conta criada! Faça login.' });
});

// Rota de Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    let db = readDB();
    const user = db.users[username];
    
    if (!user || user.password !== password) return res.status(401).json({ error: 'Usuário ou senha incorretos!' });
    
    res.json({ 
        success: true, 
        role: user.role, 
        playerData: user.playerData,
        worldData: db.worldData,
        itemDB: db.itemDB,
        npcDB: db.npcDB
    });
});

// Rota para Salvar Jogo (Segurança Ativa)
app.post('/api/save', (req, res) => {
    const { username, playerData, worldData, itemDB, npcDB } = req.body;
    let db = readDB();
    
    if (db.users[username]) {
        // Salva o personagem do usuário logado
        db.users[username].playerData = playerData; 
        
        // APENAS ADMINS podem salvar alterações no mundo e no banco de itens
        if (db.users[username].role === 'admin') {
            if (worldData) db.worldData = worldData;
            if (itemDB) db.itemDB = itemDB;
            if (npcDB) db.npcDB = npcDB;
        }
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Sessão inválida.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor RPG rodando na porta ${PORT}`));