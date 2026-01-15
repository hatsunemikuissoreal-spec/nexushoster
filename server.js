const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage (tokens are kept here, never sent back to frontend)
const bots = new Map(); 
const botMetadata = new Map(); // Non-sensitive info for the UI

const AUTH_PASSWORD = "my-discord-bot";
const GPT_API_BASE = "https://vulcanizable-nonbibulously-kamden.ngrok-free.dev/gpt120/";
const MAX_RUNTIME_MS = 2 * 24 * 60 * 60 * 1000; // 2 Days limit

// Helper: AI Response Logic
async function getAIResponse(prompt, userMessage) {
    try {
        const encodedPrompt = encodeURIComponent(`${prompt}\nUser: ${userMessage}`);
        const response = await fetch(`${GPT_API_BASE}${encodedPrompt}`, {
            headers: { 'X-Auth': AUTH_PASSWORD }
        });
        return await response.text();
    } catch (err) {
        return "System Error: Unable to reach the AI core.";
    }
}

// Bot Instance Management
async function createBotInstance(id, config) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages
        ],
        partials: [Partials.Channel]
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const isDM = !message.guild;
        const isMentioned = message.mentions.has(client.user);
        
        let shouldRespond = false;
        if (isDM && config.settings.respondDMs) shouldRespond = true;
        if (!isDM && (config.settings.respondNoPing || isMentioned)) shouldRespond = true;

        if (shouldRespond) {
            message.channel.sendTyping();
            const reply = await getAIResponse(config.systemPrompt, message.content);
            message.reply(reply || "...");
        }
    });

    try {
        await client.login(config.token);
        
        // Auto-shutdown after 2 days
        const timeout = setTimeout(() => {
            stopBot(id);
        }, MAX_RUNTIME_MS);

        bots.set(id, { client, timeout, startTime: Date.now() });
        botMetadata.set(id, { ...config, token: "[HIDDEN]", status: "online", startTime: Date.now() });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function stopBot(id) {
    const bot = bots.get(id);
    if (bot) {
        bot.client.destroy();
        clearTimeout(bot.timeout);
        bots.delete(id);
        const meta = botMetadata.get(id);
        if (meta) meta.status = "offline";
        return true;
    }
    return false;
}

// Routes
app.post('/api/bots/connect', async (req, res) => {
    const { token, systemPrompt, name, settings } = req.body;
    if (!token || !systemPrompt) return res.status(400).json({ error: "Missing required fields" });

    const id = uuidv4();
    const result = await createBotInstance(id, { token, systemPrompt, name, settings });

    if (result.success) {
        res.json({ id, message: "Bot connected successfully" });
    } else {
        res.status(401).json({ error: result.error });
    }
});

app.get('/api/bots', (req, res) => {
    res.json(Array.from(botMetadata.entries()).map(([id, meta]) => ({ id, ...meta })));
});

app.post('/api/bots/:id/action', (req, res) => {
    const { action } = req.body;
    const { id } = req.params;

    if (action === 'stop') {
        stopBot(id);
        return res.json({ success: true });
    }
    
    res.status(400).json({ error: "Invalid action" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nexus Hoster running on port ${PORT}`));
