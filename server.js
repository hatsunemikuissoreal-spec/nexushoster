const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

// In-memory storage for bot instances and configurations
const bots = {}; 
const AI_AUTH_PASSWORD = "my-discord-bot"; // X-Auth header value

app.post('/api/bots/connect', async (req, res) => {
    const { token, systemPrompt, settings } = req.body;

    if (!token || !systemPrompt) {
        return res.status(400).json({ error: "Missing token or system prompt." });
    }

    try {
        const botId = uuidv4();
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
            
            // Setting: Respond to DMs
            if (isDM && !settings.respondDMs) return;
            
            // Setting: Respond without pings (In servers)
            if (!isDM && !settings.respondWithoutPings && !isMentioned) return;

            try {
                // Call the AI API
                const response = await axios.get(`https://vulcanizable-nonbibulously-kamden.ngrok-free.dev/gpt120/${encodeURIComponent(message.content)}`, {
                    headers: { 'X-Auth': AI_AUTH_PASSWORD },
                    params: { system: systemPrompt }
                });

                if (response.data && response.data.reply) {
                    message.reply(response.data.reply);
                }
            } catch (err) {
                console.error("AI Error:", err.message);
            }
        });

        await client.login(token);

        // Auto-shutdown after 48 hours (Discord Rules compliance & resource management)
        const expiryDate = Date.now() + (2 * 24 * 60 * 60 * 1000);
        const timeout = setTimeout(() => {
            stopBot(botId);
        }, 2 * 24 * 60 * 60 * 1000);

        bots[botId] = {
            client,
            token,
            systemPrompt,
            settings,
            status: 'online',
            expiryDate,
            timeout
        };

        res.json({ success: true, botId, expiryDate });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function stopBot(botId) {
    if (bots[botId]) {
        bots[botId].client.destroy();
        clearTimeout(bots[botId].timeout);
        bots[botId].status = 'offline';
        return true;
    }
    return false;
}

app.post('/api/bots/action', (req, res) => {
    const { botId, action } = req.body;
    if (action === 'stop') {
        stopBot(botId);
        return res.json({ success: true });
    }
    res.status(400).json({ error: "Invalid action" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nexus Hoster running on port ${PORT}`));
