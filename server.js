const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // Para evitar erros de bloqueio de conexão

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

// FUNÇÃO DE INICIALIZAÇÃO DO BANCO DE DADOS
function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        // Se for a primeira vez que o servidor liga, cria o Admin automaticamente!
        const initialDB = {
            users: {
                "Admin": {
                    password: "Adleradm",
                    role: "admin",
                    playerData: null
                }
            },
            worldData: null,
            itemDB: null,
            npcDB: null
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2), 'utf8');
        console.log("Banco de dados criado com Conta Admin injetada.");
    }
}

initDB(); // Roda ao ligar o servidor

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error("Erro na leitura do BD:", e);
        return { users: {}, worldData: null, itemDB: null, npcDB: null };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Erro na escrita do BD:", e);
    }
}

// ROTA DE CRIAR CONTA (Jogadores Normais)
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    let db = readDB();
    
    if (db.users[username]) {
        return res.status(400).json({ error: 'Este usuário já existe!' });
    }
    
    db.users[username] = {
        password: password,
        role: 'player', // Todos que criarem conta via botão serão players comuns
        playerData: null
    };
    writeDB(db);
    res.json({ success: true, message: 'Conta criada com sucesso!' });
});

// ROTA DE LOGIN
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    let db = readDB();
    const user = db.users[username];
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Usuário ou senha incorretos!' });
    }
    
    res.json({ 
        success: true, 
        role: user.role, 
        playerData: user.playerData,
        worldData: db.worldData,
        itemDB: db.itemDB,
        npcDB: db.npcDB
    });
});

// ROTA DE SALVAR PROGRESSO
app.post('/api/save', (req, res) => {
    const { username, playerData, worldData, itemDB, npcDB } = req.body;
    let db = readDB();
    
    if (db.users[username]) {
        db.users[username].playerData = playerData; 
        
        // Apenas ADMIN salva as coisas do mundo
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
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));