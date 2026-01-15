const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

// Global storage for bot instances
const bots = {}; 
const AI_AUTH_PASSWORD = "my-discord-bot";

/**
 * Splits a string into chunks of a specified length without breaking words if possible.
 * Discord has a strict 2000 character limit per message.
 */
function chunkMessage(text, size = 1900) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.substring(i, i + size));
    }
    return chunks;
}

app.post('/api/bots/connect', async (req, res) => {
    const { token, systemPrompt, settings } = req.body;

    if (!token) return res.status(400).json({ error: "No token provided." });

    try {
        const botId = uuidv4();
        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent, 
                GatewayIntentBits.DirectMessages,
            ],
            partials: [Partials.Channel, Partials.Message, Partials.User]
        });

        client.on('clientReady', () => {
            console.log(`[DEBUG] ${client.user.tag} is now online and ready.`);
        });

        client.on('messageCreate', async (message) => {
            // Safety: Ignore bots and check permissions
            if (message.author.bot) return;

            const isDM = !message.guild;
            const isMentioned = message.mentions.has(client.user);
            
            console.log(`[DEBUG] Message from ${message.author.tag}: "${message.content}" (DM: ${isDM})`);

            // Apply user settings
            if (isDM && !settings.respondDMs) return;
            if (!isDM && !settings.respondWithoutPings && !isMentioned) return;

            try {
                console.log("[DEBUG] Fetching AI response...");
                
                const promptWithSystem = `System Directive: ${systemPrompt}\nUser Message: ${message.content}`;
                const apiUrl = `https://vulcanizable-nonbibulously-kamden.ngrok-free.dev/gpt120/${encodeURIComponent(promptWithSystem)}`;
                
                const response = await axios.get(apiUrl, {
                    headers: { 
                        'X-Auth': AI_AUTH_PASSWORD,
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124'
                    },
                    timeout: 30000 
                });

                let replyText = "";
                if (response.data && response.data.reply) {
                    replyText = response.data.reply;
                } else if (typeof response.data === 'string') {
                    replyText = response.data;
                }

                if (replyText) {
                    // Split the message into chunks to bypass the 2000 char limit
                    const messageChunks = chunkMessage(replyText);
                    
                    for (const content of messageChunks) {
                        await message.reply(content);
                    }
                    console.log(`[DEBUG] Successfully sent reply in ${messageChunks.length} parts.`);
                } else {
                    console.log("[DEBUG] AI API returned no recognizable text.");
                }
            } catch (err) {
                console.error(`[ERROR] AI API or Discord Failure:`, err.message);
                if (err.response) {
                    console.error(`[DEBUG] API Status: ${err.response.status}`);
                }
            }
        });

        await client.login(token);

        // Enforce 48-hour hosting limit
        const expiryDate = Date.now() + (2 * 24 * 60 * 60 * 1000);
        const timeout = setTimeout(() => {
            if (bots[botId]) {
                console.log(`[DEBUG] 48h limit reached. Shutting down ${botId}`);
                bots[botId].client.destroy();
                delete bots[botId];
            }
        }, 2 * 24 * 60 * 60 * 1000);

        bots[botId] = { client, expiryDate, timeout };
        res.json({ success: true, botId, expiryDate });

    } catch (error) {
        console.error("[ERROR] Login Failed:", error.message);
        res.status(500).json({ error: "Login failed: " + error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend Active on Port ${PORT}`));
