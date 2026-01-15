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
                GatewayIntentBits.MessageContent, // REQUIRED: Enable in Dev Portal!
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.DirectMessageTyping
            ],
            // Partials are REQUIRED for bots to receive DMs
            partials: [Partials.Channel, Partials.Message, Partials.User]
        });

        client.on('ready', () => {
            console.log(`[DEBUG] ${client.user.tag} is now online.`);
        });

        client.on('messageCreate', async (message) => {
            // 1. Ignore own messages
            if (message.author.bot) return;

            const isDM = !message.guild;
            const isMentioned = message.mentions.has(client.user);
            
            console.log(`[DEBUG] New Message from ${message.author.tag}: "${message.content}" (DM: ${isDM})`);

            // Check Settings
            if (isDM && !settings.respondDMs) {
                console.log("[DEBUG] Ignoring DM: Setting 'Respond to DMs' is OFF.");
                return;
            }
            
            if (!isDM && !settings.respondWithoutPings && !isMentioned) {
                console.log("[DEBUG] Ignoring Server Message: Bot was not mentioned.");
                return;
            }

            try {
                console.log("[DEBUG] Fetching AI response...");
                const apiUrl = `https://vulcanizable-nonbibulously-kamden.ngrok-free.dev/gpt120/${encodeURIComponent(message.content)}`;
                
                const response = await axios.get(apiUrl, {
                    headers: { 'X-Auth': AI_AUTH_PASSWORD },
                    params: { system: systemPrompt },
                    timeout: 10000 // 10 second timeout
                });

                if (response.data && response.data.reply) {
                    await message.reply(response.data.reply);
                    console.log("[DEBUG] Reply sent successfully.");
                } else {
                    console.log("[DEBUG] AI API returned no reply data.");
                }
            } catch (err) {
                console.error("[ERROR] AI API Failure:", err.message);
                // Optionally notify user in Discord
                // message.reply("⚠️ AI is currently unavailable.");
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Active on Port ${PORT}`));
