require('dotenv').config();

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const commandDefaults = {
  integration_types: [1], // USER_INSTALL
  contexts: [0, 1, 2], // guild, bot DM, private channel
};

const commands = [
  {
    name: 'gif',
    description: 'Convert an image or video to a GIF',
    type: 1, // CHAT_INPUT slash command
    options: [
      {
        name: 'file',
        description: 'The image or video to convert',
        type: 11, // ATTACHMENT
        required: true,
      },
    ],
    ...commandDefaults,
  },
  { name: 'To GIF', type: 3, ...commandDefaults }, // MESSAGE context menu command
  { name: 'To GIF (priv)', type: 3, ...commandDefaults },
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
