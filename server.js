const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

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
                console.log("[DEBUG] Fetching AI response...");
                
                // The URL requires the prompt in the path. 
                // We add the system prompt as a query parameter or inside the prompt itself.
                const promptWithSystem = `System: ${systemPrompt}\nUser: ${message.content}`;
                const apiUrl = `https://vulcanizable-nonbibulously-kamden.ngrok-free.dev/gpt120/${encodeURIComponent(promptWithSystem)}`;
                
                const response = await axios.get(apiUrl, {
                    headers: { 
                        'X-Auth': AI_AUTH_PASSWORD,
                        'Accept': 'application/json',
                        // Ngrok often blocks "headless" requests with a 403/404 unless a User-Agent is present
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    },
                    timeout: 20000 
                });

                // Check for response in multiple possible formats
                let replyText = "";
                if (response.data && response.data.reply) {
                    replyText = response.data.reply;
                } else if (typeof response.data === 'string') {
                    replyText = response.data;
                } else if (response.data && response.data.response) {
                    replyText = response.data.response;
                }

                if (replyText) {
                    await message.reply(replyText);
                    console.log("[DEBUG] Reply sent successfully.");
                } else {
                    console.log("[DEBUG] AI API returned no recognizable text content.");
                }
            } catch (err) {
                console.error(`[ERROR] AI API Failure (Status: ${err.response?.status}):`, err.message);
                if (err.response?.status === 403) {
                    console.log("[DEBUG] Still Getting 403. This means 'my-discord-bot' is being rejected by the ngrok host.");
                }
            }
        });

        await client.login(token);

        const expiryDate = Date.now() + (2 * 24 * 60 * 60 * 1000);
        const timeout = setTimeout(() => {
            if (bots[botId]) {
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

const PORT = process.env.PORT || 10000; // Render uses 10000
app.listen(PORT, () => console.log(`Backend Active on Port ${PORT}`));
