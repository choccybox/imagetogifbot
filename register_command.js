require('dotenv').config();

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const payload = {
  name: 'To GIF',
  type: 3, // MESSAGE context menu command
  integration_types: [1], // 1 = USER_INSTALL
  contexts: [0, 1, 2], // guild, bot DM, private channel
};

fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
  method: 'POST',
  headers: {
    Authorization: `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
})
  .then(async (r) => console.log(r.status, await r.json()))
  .catch((err) => console.error(err));
