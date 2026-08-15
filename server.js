const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // Hospeda a pasta public

const DB_FILE = './database.json';

// Inicia o banco de dados se não existir
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, worldData: null }));
}

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE)); }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

// Rota de Registro
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    let db = readDB();
    if (db.users[username]) return res.status(400).json({ error: 'Usuário já existe!' });
    
    // O primeiro usuário a criar conta vira Admin automaticamente
    const isFirstUser = Object.keys(db.users).length === 0;
    
    db.users[username] = {
        password: password, // Em um jogo real, usaríamos bcrypt para criptografar
        role: isFirstUser ? 'admin' : 'player',
        playerData: null // Inicia com personagem zerado
    };
    writeDB(db);
    res.json({ success: true, message: 'Conta criada com sucesso!' });
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
        worldData: db.worldData 
    });
});

// Rota para Salvar Jogo
app.post('/api/save', (req, res) => {
    const { username, playerData, worldData } = req.body;
    let db = readDB();
    
    if (db.users[username]) {
        db.users[username].playerData = playerData; // Salva o personagem
        if (db.users[username].role === 'admin' && worldData) {
            db.worldData = worldData; // Apenas Admins salvam as alterações do mundo
        }
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Não autorizado.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));