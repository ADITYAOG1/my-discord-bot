// index.js — discord.js v14
// Prefix: mention the bot (@Bot command ...)
// Env vars: TOKEN (required), DATA_DIR (optional, set to your Render disk mount e.g. /data)

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField: P,
  ActivityType,
} = require('discord.js');

const EMOJI_ID = '1552499203811450891';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

/* ------------------------------ Emoji ------------------------------ */
// Uses the real emoji if the bot can see it (handles animated too),
// otherwise falls back to the static format.
function tick() {
  const e = client.emojis.cache.get(EMOJI_ID);
  return e ? e.toString() : `<:e:${EMOJI_ID}>`;
}

/* ---------------------------- Persistence -------------------------- */
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
let db = { warns: {}, tempbans: [] };

try {
  if (fs.existsSync(DATA_FILE)) {
    db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  }
} catch (err) {
  console.error('Failed to load data.json:', err);
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error('Failed to save data.json:', err);
  }
}

const getWarns = (g, u) => (db.warns[g] && db.warns[g][u]) || 0;
function setWarns(g, u, n) {
  if (!db.warns[g]) db.warns[g] = {};
  if (n <= 0) delete db.warns[g][u];
  else db.warns[g][u] = n;
  save();
}

/* ------------------------------ Helpers ---------------------------- */
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MAX_TIMEOUT = 28 * DAY;

function parseDuration(str) {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(str || '');
  if (!m) return null;
  const mult = { s: 1000, m: MIN, h: HOUR, d: DAY, w: 7 * DAY }[m[2].toLowerCase()];
  return parseInt(m[1], 10) * mult;
}

function fmtDuration(ms) {
  const units = [
    ['week', 7 * DAY],
    ['day', DAY],
    ['hour', HOUR],
    ['minute', MIN],
    ['second', 1000],
  ];
  for (const [name, val] of units) {
    if (ms >= val && ms % val === 0) {
      const n = ms / val;
      return `${n} ${name}${n === 1 ? '' : 's'}`;
    }
  }
  return `${Math.round(ms / 1000)} seconds`;
}

function parseUserId(arg) {
  if (!arg) return null;
  const m = /^<@!?(\d+)>$/.exec(arg) || /^(\d{17,20})$/.exec(arg);
  return m ? m[1] : null;
}

async function fetchMember(guild, id) {
  return guild.members.cache.get(id) || (await guild.members.fetch(id).catch(() => null));
}

function reasonFrom(args) {
  const r = args.join(' ').trim();
  return r || 'No reason provided';
}

// Sends a message without pinging anyone.
function say(message, text) {
  return message.channel.send({ content: text, allowedMentions: { parse: [] } });
}
// Success message: same format as before, with the custom emoji at the end.
function done(message, text) {
  return say(message, `${text} ${tick()}`);
}
function fail(message, text) {
  return say(message, `❌ ${text}`);
}

// Role hierarchy check for the command author and the bot.
function hierarchyError(message, target) {
  if (!target) return null;
  const { guild, member: author } = message;
  if (target.id === guild.ownerId) return 'I can\'t do that to the server owner.';
  if (target.id === message.author.id) return 'You can\'t do that to yourself.';
  if (target.id === client.user.id) return 'I can\'t do that to myself.';
  if (
    author.id !== guild.ownerId &&
    target.roles.highest.position >= author.roles.highest.position
  ) {
    return 'That member\'s role is equal to or higher than yours.';
  }
  if (target.roles.highest.position >= guild.members.me.roles.highest.position) {
    return 'That member\'s role is equal to or higher than mine.';
  }
  return null;
}

/* ------------------------------ Tempbans --------------------------- */
function addTempban(guildId, userId, expires) {
  db.tempbans = db.tempbans.filter((t) => !(t.guildId === guildId && t.userId === userId));
  db.tempbans.push({ guildId, userId, expires });
  save();
}
function removeTempban(guildId, userId) {
  const before = db.tempbans.length;
  db.tempbans = db.tempbans.filter((t) => !(t.guildId === guildId && t.userId === userId));
  if (db.tempbans.length !== before) save();
}

async function checkTempbans() {
  const now = Date.now();
  const due = db.tempbans.filter((t) => t.expires <= now);
  for (const t of due) {
    try {
      const guild = client.guilds.cache.get(t.guildId);
      if (guild) await guild.members.unban(t.userId, 'Temporary ban expired').catch(() => {});
    } finally {
      removeTempban(t.guildId, t.userId);
    }
  }
}

/* --------------------------- Warn escalation ----------------------- */
const LADDER = {
  3: { type: 'timeout', ms: 10 * MIN, label: '10 minute timeout' },
  5: { type: 'timeout', ms: 30 * MIN, label: '30 minute timeout' },
  8: { type: 'timeout', ms: DAY, label: '24 hour timeout' },
  12: { type: 'ban', ms: 7 * DAY, label: '1 week ban' },
  14: { type: 'ban', ms: 21 * DAY, label: '3 week ban' },
  16: { type: 'ban', ms: null, label: 'permanent ban' },
};

async function escalate(message, userId, count) {
  const step = LADDER[count];
  if (!step) return;
  const reason = `Reached ${count} warns`;
  try {
    if (step.type === 'timeout') {
      const member = await fetchMember(message.guild, userId);
      if (!member || !member.moderatable) return;
      await member.timeout(step.ms, reason);
    } else {
      await message.guild.members.ban(userId, { reason });
      if (step.ms) addTempban(message.guild.id, userId, Date.now() + step.ms);
    }
    await say(message, `⚠️ <@${userId}> reached ${count} warns → ${step.label} ${tick()}`);
  } catch (err) {
    console.error('Escalation failed:', err);
  }
}

/* ------------------------------ Commands --------------------------- */
const commands = {};
function cmd(names, perm, usage, desc, run) {
  const list = Array.isArray(names) ? names : [names];
  const c = { name: list[0], perm, usage, desc, run };
  for (const n of list) commands[n] = c;
}

cmd('ban', P.Flags.BanMembers, 'ban @user [reason]', 'Ban a member', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `ban @user [reason]`');
  const reason = reasonFrom(args);
  const target = await fetchMember(m.guild, id);
  const err = hierarchyError(m, target);
  if (err) return fail(m, err);
  await m.guild.members.ban(id, { reason: `${m.author.tag}: ${reason}` });
  removeTempban(m.guild.id, id);
  return done(m, `<@${id}> is banned by ${m.author} | Reason: ${reason}`);
});

cmd('tempban', P.Flags.BanMembers, 'tempban @user <10m|2h|3d|1w> [reason]', 'Temporarily ban a member', async (m, args) => {
  const id = parseUserId(args.shift());
  const ms = parseDuration(args.shift());
  if (!id || !ms) return fail(m, 'Usage: `tempban @user <10m|2h|3d|1w> [reason]`');
  const reason = reasonFrom(args);
  const target = await fetchMember(m.guild, id);
  const err = hierarchyError(m, target);
  if (err) return fail(m, err);
  await m.guild.members.ban(id, { reason: `${m.author.tag}: ${reason}` });
  addTempban(m.guild.id, id, Date.now() + ms);
  return done(m, `<@${id}> is temp banned by ${m.author} | Duration: ${fmtDuration(ms)} | Reason: ${reason}`);
});

cmd('unban', P.Flags.BanMembers, 'unban <userID> [reason]', 'Unban a user', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `unban <userID> [reason]`');
  const reason = reasonFrom(args);
  await m.guild.members.unban(id, `${m.author.tag}: ${reason}`).catch(() => {
    throw new Error('That user is not banned.');
  });
  removeTempban(m.guild.id, id);
  return done(m, `<@${id}> is unbanned by ${m.author} | Reason: ${reason}`);
});

cmd('kick', P.Flags.KickMembers, 'kick @user [reason]', 'Kick a member', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `kick @user [reason]`');
  const reason = reasonFrom(args);
  const target = await fetchMember(m.guild, id);
  if (!target) return fail(m, 'That member is not in the server.');
  const err = hierarchyError(m, target);
  if (err) return fail(m, err);
  await target.kick(`${m.author.tag}: ${reason}`);
  return done(m, `<@${id}> is kicked by ${m.author} | Reason: ${reason}`);
});

cmd(['timeout', 'mute'], P.Flags.ModerateMembers, 'timeout @user <10m|2h|1d> [reason]', 'Timeout a member', async (m, args) => {
  const id = parseUserId(args.shift());
  const ms = parseDuration(args.shift());
  if (!id || !ms) return fail(m, 'Usage: `timeout @user <10m|2h|1d> [reason]`');
  if (ms > MAX_TIMEOUT) return fail(m, 'Timeouts can\'t be longer than 28 days.');
  const reason = reasonFrom(args);
  const target = await fetchMember(m.guild, id);
  if (!target) return fail(m, 'That member is not in the server.');
  const err = hierarchyError(m, target);
  if (err) return fail(m, err);
  await target.timeout(ms, `${m.author.tag}: ${reason}`);
  return done(m, `<@${id}> is muted by ${m.author} | Duration: ${fmtDuration(ms)} | Reason: ${reason}`);
});

cmd(['untimeout', 'unmute'], P.Flags.ModerateMembers, 'untimeout @user [reason]', 'Remove a timeout', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `untimeout @user [reason]`');
  const reason = reasonFrom(args);
  const target = await fetchMember(m.guild, id);
  if (!target) return fail(m, 'That member is not in the server.');
  await target.timeout(null, `${m.author.tag}: ${reason}`);
  return done(m, `<@${id}> is unmuted by ${m.author} | Reason: ${reason}`);
});

cmd('warn', P.Flags.ModerateMembers, 'warn @user [reason]', 'Warn a member', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `warn @user [reason]`');
  const reason = reasonFrom(args);
  const target = await fetchMember(m.guild, id);
  if (!target) return fail(m, 'That member is not in the server.');
  const err = hierarchyError(m, target);
  if (err) return fail(m, err);
  const count = getWarns(m.guild.id, id) + 1;
  setWarns(m.guild.id, id, count);
  await done(m, `<@${id}> is warned by ${m.author} | Reason: ${reason} | Warns: #${count}`);
  await escalate(m, id, count);
});

cmd('warns', P.Flags.ModerateMembers, 'warns @user', 'Show a member\'s warns', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `warns @user`');
  return say(m, `<@${id}> has ${getWarns(m.guild.id, id)} warn(s).`);
});

cmd(['unwarn', 'removewarn'], P.Flags.ModerateMembers, 'unwarn @user [reason]', 'Remove one warn', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `unwarn @user [reason]`');
  const reason = reasonFrom(args);
  const current = getWarns(m.guild.id, id);
  if (!current) return fail(m, 'That member has no warns.');
  setWarns(m.guild.id, id, current - 1);
  return done(m, `<@${id}> is unwarned by ${m.author} | Reason: ${reason} | Warns: #${current - 1}`);
});

cmd(['clearwarns', 'resetwarns'], P.Flags.ModerateMembers, 'clearwarns @user [reason]', 'Clear all warns', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `clearwarns @user [reason]`');
  const reason = reasonFrom(args);
  setWarns(m.guild.id, id, 0);
  return done(m, `<@${id}> warns cleared by ${m.author} | Reason: ${reason}`);
});

cmd(['purge', 'clear'], P.Flags.ManageMessages, 'purge <1-100>', 'Delete recent messages', async (m, args) => {
  const n = parseInt(args[0], 10);
  if (!n || n < 1 || n > 100) return fail(m, 'Usage: `purge <1-100>`');
  await m.delete().catch(() => {});
  const deleted = await m.channel.bulkDelete(n, true);
  const sent = await done(m, `${deleted.size} messages purged by ${m.author}`);
  setTimeout(() => sent.delete().catch(() => {}), 5000);
});

cmd('lock', P.Flags.ManageChannels, 'lock [reason]', 'Lock this channel', async (m, args) => {
  const reason = reasonFrom(args);
  await m.channel.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: false }, { reason: `${m.author.tag}: ${reason}` });
  return done(m, `${m.channel} is locked by ${m.author} | Reason: ${reason}`);
});

cmd('unlock', P.Flags.ManageChannels, 'unlock [reason]', 'Unlock this channel', async (m, args) => {
  const reason = reasonFrom(args);
  await m.channel.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: null }, { reason: `${m.author.tag}: ${reason}` });
  return done(m, `${m.channel} is unlocked by ${m.author} | Reason: ${reason}`);
});

cmd('slowmode', P.Flags.ManageChannels, 'slowmode <seconds|off>', 'Set channel slowmode', async (m, args) => {
  const raw = (args[0] || '').toLowerCase();
  const secs = raw === 'off' ? 0 : parseInt(raw, 10);
  if (Number.isNaN(secs) || secs < 0 || secs > 21600) return fail(m, 'Usage: `slowmode <0-21600|off>`');
  await m.channel.setRateLimitPerUser(secs, `${m.author.tag}`);
  return done(m, `Slowmode set to ${secs}s by ${m.author}`);
});

cmd(['nick', 'nickname'], P.Flags.ManageNicknames, 'nick @user <new name|reset>', 'Change a nickname', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `nick @user <new name|reset>`');
  const name = args.join(' ').trim();
  const target = await fetchMember(m.guild, id);
  if (!target) return fail(m, 'That member is not in the server.');
  const err = hierarchyError(m, target);
  if (err) return fail(m, err);
  await target.setNickname(name.toLowerCase() === 'reset' || !name ? null : name, m.author.tag);
  return done(m, `<@${id}> nickname changed by ${m.author}`);
});

function findRole(m, args) {
  const mention = m.mentions.roles.first();
  if (mention) return mention;
  const q = args.join(' ').toLowerCase();
  return m.guild.roles.cache.get(q) || m.guild.roles.cache.find((r) => r.name.toLowerCase() === q);
}

cmd('addrole', P.Flags.ManageRoles, 'addrole @user <role>', 'Give a role', async (m, args) => {
  const id = parseUserId(args.shift());
  const role = findRole(m, args);
  if (!id || !role) return fail(m, 'Usage: `addrole @user <role>`');
  if (m.author.id !== m.guild.ownerId && role.position >= m.member.roles.highest.position)
    return fail(m, 'That role is equal to or higher than your highest role.');
  const target = await fetchMember(m.guild, id);
  if (!target) return fail(m, 'That member is not in the server.');
  await target.roles.add(role, m.author.tag);
  return done(m, `${role.name} role added to <@${id}> by ${m.author}`);
});

cmd('removerole', P.Flags.ManageRoles, 'removerole @user <role>', 'Remove a role', async (m, args) => {
  const id = parseUserId(args.shift());
  const role = findRole(m, args);
  if (!id || !role) return fail(m, 'Usage: `removerole @user <role>`');
  if (m.author.id !== m.guild.ownerId && role.position >= m.member.roles.highest.position)
    return fail(m, 'That role is equal to or higher than your highest role.');
  const target = await fetchMember(m.guild, id);
  if (!target) return fail(m, 'That member is not in the server.');
  await target.roles.remove(role, m.author.tag);
  return done(m, `${role.name} role removed from <@${id}> by ${m.author}`);
});

cmd('help', null, 'help', 'Show all commands', async (m) => {
  const seen = new Set();
  const lines = [];
  for (const c of Object.values(commands)) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    lines.push(`**${c.usage}** — ${c.desc}`);
  }
  return m.channel.send({
    content: `**Commands** (mention me first, e.g. \`@${client.user.username} warn @user\`)\n${lines.join('\n')}\n\nDurations: \`10m\`, \`2h\`, \`3d\`, \`1w\`\nWarn punishments: 3 → 10m timeout, 5 → 30m, 8 → 24h, 12 → 1 week ban, 14 → 3 week ban, 16 → permanent ban`,
    allowedMentions: { parse: [] },
  });
});

/* ------------------------------ Events ----------------------------- */
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({
    status: 'dnd',
    activities: [{ name: 'over the server', type: ActivityType.Watching }],
  });
  checkTempbans();
  setInterval(checkTempbans, 30 * 1000);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const mentionRe = new RegExp(`^<@!?${client.user.id}>\\s*`);
  if (!mentionRe.test(message.content)) return;

  const args = message.content.replace(mentionRe, '').trim().split(/\s+/).filter(Boolean);
  const name = (args.shift() || '').replace(/^[@!]/, '').toLowerCase();
  const command = commands[name];
  if (!command) return;

  if (command.perm && !message.member.permissions.has(command.perm)) {
    return fail(message, 'You don\'t have permission to use that command.');
  }
  if (command.perm && !message.guild.members.me.permissions.has(command.perm)) {
    return fail(message, 'I\'m missing the permission to do that.');
  }

  try {
    await command.run(message, args);
  } catch (err) {
    console.error(`Error in ${name}:`, err);
    fail(message, err.message && err.message.length < 150 ? err.message : 'Something went wrong running that command.').catch(() => {});
  }
});

process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

client.login(process.env.TOKEN);
  
