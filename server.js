const express = require('express');
const axios = require('axios');
const fs = require('fs');
const session = require('express-session');
const app = express();

const PORT = 3000;
const API = 'https://discord.com/api/v9';

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'blood-oath', resave: false, saveUninitialized: true }));

// DB Helpers
const dbFile = './users.json';
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ users: [] }));
const getDB = () => JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const saveDB = (data) => fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));

const protect = (req, res, next) => {
    if (!req.session.authenticated) return res.redirect('/login');
    next();
};

// --- AUTH ROUTES ---
app.get('/register', (req, res) => res.render('register', { error: null }));

app.post('/register', (req, res) => {
    const { username, password, token } = req.body;
    const db = getDB();
    if (db.users.find(u => u.username === username)) return res.render('register', { error: 'Username Taken' });
    db.users.push({ username, password, token });
    saveDB(db);
    res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) {
        req.session.authenticated = true;
        req.session.token = user.token; // Binding Discord token to session
        req.session.username = user.username;
        return res.redirect('/');
    }
    res.render('login', { error: 'Access Denied' });
});

// --- APP ROUTES ---
app.get('/', protect, async (req, res) => {
    try {
        const discord = axios.create({ baseURL: API, headers: { 'Authorization': req.session.token } });
        const friends = await discord.get('/users/@me/relationships');
        const user = await discord.get('/users/@me');
        res.render('index', { friends: friends.data.filter(f => f.type === 1), me: user.data });
    } catch (err) { res.redirect('/login'); }
});

app.get('/chat', protect, async (req, res) => {
    const userId = req.query.userId;
    const discord = axios.create({ baseURL: API, headers: { 'Authorization': req.session.token } });
    try {
        const channel = await discord.post('/users/@me/channels', { recipient_id: userId });
        const msgs = await discord.get(`/channels/${channel.data.id}/messages?limit=25`);
        const user = await discord.get('/users/@me');
        res.render('chat', { messages: msgs.data, channelId: channel.data.id, me: user.data, username: channel.data.recipients[0].username });
    } catch (err) { res.status(500).send("Chat Failed"); }
});

app.post('/send/:channelId', protect, async (req, res) => {
    const discord = axios.create({ baseURL: API, headers: { 'Authorization': req.session.token } });
    try {
        await discord.post(`/channels/${req.params.channelId}/messages`, { content: req.body.content });
        res.redirect(req.get('Referrer') || '/');
    } catch (err) { res.status(500).send("Send Failed"); }
});

app.listen(PORT, () => console.log(`FROST active on port ${PORT}`));