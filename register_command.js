require('dotenv').config();

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const commandDefaults = {
  type: 3, // MESSAGE context menu command
  integration_types: [1], // USER_INSTALL
  contexts: [0, 1, 2], // guild, bot DM, private channel
};

const commands = [
  { name: 'To GIF', ...commandDefaults },
  { name: 'To GIF (priv)', ...commandDefaults },
];

fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
})
  .then(async (response) => console.log(response.status, await response.json()))
  .catch((error) => console.error(error));
