const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

// In-memory storage for bot instances
const bots = {}; 
const AI_AUTH_PASSWORD = "my-discord-bot";

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

        // Updated to clientReady to fix the DeprecationWarning
        client.on('clientReady', () => {
            console.log(`[DEBUG] ${client.user.tag} is now online and ready.`);
        });

        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            const isDM = !message.guild;
            const isMentioned = message.mentions.has(client.user);
            
            console.log(`[DEBUG] Message from ${message.author.tag}: "${message.content}" (DM: ${isDM})`);

            if (isDM && !settings.respondDMs) return;
            if (!isDM && !settings.respondWithoutPings && !isMentioned) return;

            try {
                console.log("[DEBUG] Fetching AI response with X-Auth...");
                
                // Constructing the URL with the prompt and system prompt as a query parameter
                const apiUrl = `https://vulcanizable-nonbibulously-kamden.ngrok-free.dev/gpt120/${encodeURIComponent(message.content)}`;
                
                const response = await axios.get(apiUrl, {
                    headers: { 
                        'X-Auth': AI_AUTH_PASSWORD,
                        'Content-Type': 'application/json'
                    },
                    params: { 
                        prompt: systemPrompt // Passing the system prompt context
                    },
                    timeout: 15000 
                });

                if (response.data && response.data.reply) {
                    await message.reply(response.data.reply);
                    console.log("[DEBUG] Reply sent successfully.");
                } else if (typeof response.data === 'string') {
                    // Fallback if the API returns a raw string instead of a JSON object
                    await message.reply(response.data);
                    console.log("[DEBUG] Raw string reply sent.");
                } else {
                    console.log("[DEBUG] AI API returned empty response.");
                }
            } catch (err) {
                console.error(`[ERROR] AI API Failure (Status: ${err.response?.status}):`, err.message);
                if (err.response?.status === 403) {
                    console.log("[DEBUG] 403 Forbidden: Check if the ngrok URL is active or if the X-Auth password 'my-discord-bot' is correct on the receiver side.");
                }
            }
        });

        await client.login(token);

        // 48-hour limit logic
        const expiryDate = Date.now() + (2 * 24 * 60 * 60 * 1000);
        const timeout = setTimeout(() => {
            if (bots[botId]) {
                console.log(`[DEBUG] Auto-stopping bot ${botId} (48h limit reached)`);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Active on Port ${PORT}`));
