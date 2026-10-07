require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { buildCommands } = require('./commands');

async function main() {
  if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
    throw new Error('TOKEN, CLIENT_ID and GUILD_ID are required in .env');
  }
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const body = buildCommands();
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body });
  console.log(`Registered ${body.length} top-level commands / 222 features (+ help).`);
}
main().catch(err => { console.error(err); process.exit(1); });
