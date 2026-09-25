// index.js — discord.js v14
// Works with two prefixes: mention the bot (@Caffeine Assistant warn @user)
// or the "!" prefix (!warn @user).
// Env vars: TOKEN (required), DATA_DIR (optional, set to your Render disk mount e.g. /data)

const fs = require('fs');
const path = require('path');
const http = require('http');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField: P,
  ActivityType,
  EmbedBuilder,
} = require('discord.js');

const PREFIX = '!';
const EMOJI_ID = '1552499203811450891';
const EMBED_COLOR = 0x8a2be2;

// Tiny web server so Render detects an open port (needed for Web Services).
http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running');
  })
  .listen(process.env.PORT || 3000, () => console.log('Web server ready'));

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
function tick() {
  return '<a:11222:1552499203811450891>';
}

/* ---------------------------- Persistence -------------------------- */
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
let db = { warns: {}, tempbans: [], modlogs: {}, notes: {} };

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

function logAction(guildId, type, userId, moderatorId, reason) {
  if (!db.modlogs[guildId]) db.modlogs[guildId] = [];
  db.modlogs[guildId].push({ type, userId, moderatorId, reason, time: Date.now() });
  if (db.modlogs[guildId].length > 500) db.modlogs[guildId] = db.modlogs[guildId].slice(-500);
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

// Sends a plain message without pinging anyone.
function say(message, text) {
  return message.channel.send({ content: text, allowedMentions: { parse: [] } });
}
// Plain success message (used for utility commands that don't warrant an embed).
function done(message, text) {
  return say(message, `${text} ${tick()}`);
}
function fail(message, text) {
  return say(message, `❌ ${text}`);
}

// Styled embed used for the main moderation actions (ban, kick, timeout, warn, etc.)
function modEmbed({ action, target, by, moderator, reason, footer }) {
  let desc = `**${target} has been ${action}** ${tick()}\n\n**${by}**\n${moderator}`;
  if (reason !== undefined) desc += `\n\n**Reason**\n${reason}`;
  if (footer) desc += `\n\n### ${footer}`;
  return new EmbedBuilder().setColor(EMBED_COLOR).setDescription(desc);
}
function sendModEmbed(message, opts) {
  return message.channel.send({ embeds: [modEmbed(opts)], allowedMentions: { parse: [] } });
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
    logAction(message.guild.id, 'Auto-escalation', userId, client.user.id, `${count} warns → ${step.label}`);
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

/* ---- Bans / kicks / timeouts ---- */

cmd('ban', P.Flags.BanMembers, 'ban @user [reason]', 'Ban a member', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `ban @user [reason]`');
  const reason = reasonFrom(args);
  const target = await fetchMember(m.guild, id);
  const err = hierarchyError(m, target);
  if (err) return fail(m, err);
  await m.guild.members.ban(id, { reason: `${m.author.tag}: ${reason}` });
  removeTempban(m.guild.id, id);
  logAction(m.guild.id, 'Ban', id, m.author.id, reason);
  return sendModEmbed(m, { action: 'banned', target: `<@${id}>`, by: 'Banned by', moderator: `${m.author}`, reason });
});

cmd('softban', P.Flags.BanMembers, 'softban @user [reason]', 'Ban then unban to purge recent messages', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `softban @user [reason]`');
  const reason = reasonFrom(args);
  const target = await fetchMember(m.guild, id);
  const err = hierarchyError(m, target);
  if (err) return fail(m, err);
  await m.guild.members.ban(id, { reason: `${m.author.tag}: ${reason}`, deleteMessageSeconds: 7 * 24 * 3600 });
  await m.guild.members.unban(id, 'Softban cleanup').catch(() => {});
  logAction(m.guild.id, 'Softban', id, m.author.id, reason);
  return sendModEmbed(m, { action: 'softbanned', target: `<@${id}>`, by: 'Softbanned by', moderator: `${m.author}`, reason });
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
  logAction(m.guild.id, 'Tempban', id, m.author.id, `${reason} (${fmtDuration(ms)})`);
  return sendModEmbed(m, { action: 'temp banned', target: `<@${id}>`, by: 'Temp banned by', moderator: `${m.author}`, reason: `${reason}\n*Duration: ${fmtDuration(ms)}*` });
});

cmd('unban', P.Flags.BanMembers, 'unban <userID> [reason]', 'Unban a user', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `unban <userID> [reason]`');
  const reason = reasonFrom(args);
  await m.guild.members.unban(id, `${m.author.tag}: ${reason}`).catch(() => {
    throw new Error('That user is not banned.');
  });
  removeTempban(m.guild.id, id);
  logAction(m.guild.id, 'Unban', id, m.author.id, reason);
  return sendModEmbed(m, { action: 'unbanned', target: `<@${id}>`, by: 'Unbanned by', moderator: `${m.author}`, reason });
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
  logAction(m.guild.id, 'Kick', id, m.author.id, reason);
  return sendModEmbed(m, { action: 'kicked', target: `<@${id}>`, by: 'Kicked by', moderator: `${m.author}`, reason });
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
  logAction(m.guild.id, 'Timeout', id, m.author.id, `${reason} (${fmtDuration(ms)})`);
  return sendModEmbed(m, { action: 'timed out', target: `<@${id}>`, by: 'Timed out by', moderator: `${m.author}`, reason: `${reason}\n*Duration: ${fmtDuration(ms)}*` });
});

cmd(['untimeout', 'unmute'], P.Flags.ModerateMembers, 'untimeout @user [reason]', 'Remove a timeout', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `untimeout @user [reason]`');
  const reason = reasonFrom(args);
  const target = await fetchMember(m.guild, id);
  if (!target) return fail(m, 'That member is not in the server.');
  await target.timeout(null, `${m.author.tag}: ${reason}`);
  logAction(m.guild.id, 'Untimeout', id, m.author.id, reason);
  return sendModEmbed(m, { action: 'un-timed out', target: `<@${id}>`, by: 'Timeout removed by', moderator: `${m.author}`, reason });
});

/* ---- Warnings ---- */

cmd('warn', P.Flags.ModerateMembers, 'warn @user <reason>', 'Warn a member', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `warn @user [reason]`');
  const reason = reasonFrom(args);
  const target = await fetchMember(m.guild, id);
  if (!target) return fail(m, 'That member is not in the server.');
  const err = hierarchyError(m, target);
  if (err) return fail(m, err);
  const count = getWarns(m.guild.id, id) + 1;
  setWarns(m.guild.id, id, count);
  logAction(m.guild.id, 'Warn', id, m.author.id, `${reason} (Warn #${count})`);
  await sendModEmbed(m, {
    action: 'warned',
    target: `<@${id}>`,
    by: 'Warned by',
    moderator: `${m.author}`,
    reason: `${reason}\n*(Warn #${count})*`,
    footer: "Next time behave yourself sir/ma'am",
  });
  await escalate(m, id, count);
});

cmd('warns', P.Flags.ModerateMembers, 'warns @user | warns leaderboard', 'Show warns, or the top 5 most-warned members', async (m, args) => {
  if ((args[0] || '').toLowerCase() === 'leaderboard') {
    const guildWarns = db.warns[m.guild.id] || {};
    const sorted = Object.entries(guildWarns).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!sorted.length) return say(m, 'No warns recorded yet.');
    const lines = sorted.map(([uid, n], i) => `**#${i + 1}** <@${uid}> — ${n} warn(s)`);
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('⚠️ Most Warned Members').setDescription(lines.join('\n'));
    return m.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  }
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `warns @user` or `warns leaderboard`');
  return say(m, `<@${id}> has ${getWarns(m.guild.id, id)} warn(s).`);
});

cmd(['unwarn', 'removewarn', 'deletewarn'], P.Flags.ModerateMembers, 'unwarn @user [reason]', 'Remove one warn', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `unwarn @user [reason]`');
  const reason = reasonFrom(args);
  const current = getWarns(m.guild.id, id);
  if (!current) return fail(m, 'That member has no warns.');
  setWarns(m.guild.id, id, current - 1);
  logAction(m.guild.id, 'Unwarn', id, m.author.id, `${reason} (Warns now: ${current - 1})`);
  return sendModEmbed(m, { action: 'unwarned', target: `<@${id}>`, by: 'Warning removed by', moderator: `${m.author}`, reason: `${reason}\n*(Warns: #${current - 1})*` });
});

cmd(['clearwarns', 'resetwarns'], P.Flags.ModerateMembers, 'clearwarns @user [reason]', 'Clear all warns', async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `clearwarns @user [reason]`');
  const reason = reasonFrom(args);
  setWarns(m.guild.id, id, 0);
  logAction(m.guild.id, 'Clearwarns', id, m.author.id, reason);
  return sendModEmbed(m, { action: 'had all warns cleared', target: `<@${id}>`, by: 'Cleared by', moderator: `${m.author}`, reason });
});

/* ---- Notes & logs ---- */

cmd('note', P.Flags.ModerateMembers, 'note @user <text>', 'Add a private mod note on a member', async (m, args) => {
  const id = parseUserId(args.shift());
  const text = args.join(' ').trim();
  if (!id || !text) return fail(m, 'Usage: `note @user <text>`');
  if (!db.notes[m.guild.id]) db.notes[m.guild.id] = {};
  if (!db.notes[m.guild.id][id]) db.notes[m.guild.id][id] = [];
  db.notes[m.guild.id][id].push({ text, moderatorId: m.author.id, time: Date.now() });
  save();
  return done(m, `Note added for <@${id}>`);
});

cmd('modlogs', P.Flags.ModerateMembers, 'modlogs @user', "Show a member's mod history", async (m, args) => {
  const id = parseUserId(args.shift());
  if (!id) return fail(m, 'Usage: `modlogs @user`');
  const logs = (db.modlogs[m.guild.id] || []).filter((l) => l.userId === id).slice(-10);
  const notes = (db.notes[m.guild.id] && db.notes[m.guild.id][id]) || [];
  if (!logs.length && !notes.length) return say(m, `<@${id}> has no mod history.`);
  const lines = logs.map((l) => `**${l.type}** by <@${l.moderatorId}> — ${l.reason} (<t:${Math.floor(l.time / 1000)}:R>)`);
  if (notes.length) {
    lines.push('', '**Notes**');
    notes.slice(-5).forEach((n) => lines.push(`• ${n.text} — <@${n.moderatorId}> (<t:${Math.floor(n.time / 1000)}:R>)`));
  }
  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle(`Mod history`).setDescription(lines.join('\n'));
  return m.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
});

/* ---- Channel & server utility ---- */

cmd(['purge', 'clear'], P.Flags.ManageMessages, 'purge <1-100> [@user]', 'Delete recent messages, optionally only from one member', async (m, args) => {
  const n = parseInt(args[0], 10);
  if (!n || n < 1 || n > 100) return fail(m, 'Usage: `purge <1-100> [@user]`');
  const filterId = parseUserId(args[1]);
  await m.delete().catch(() => {});
  let deletedCount;
  if (filterId) {
    const recent = await m.channel.messages.fetch({ limit: 100 });
    const matching = recent.filter((msg) => msg.author.id === filterId).first(n);
    await m.channel.bulkDelete(matching, true);
    deletedCount = matching.length;
  } else {
    const deleted = await m.channel.bulkDelete(n, true);
    deletedCount = deleted.size;
  }
  const sent = await done(m, `${deletedCount} messages purged by ${m.author}`);
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

/* ---- Help ---- */

cmd('help', null, 'help', 'Show all commands', async (m) => {
  const t = tick();
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('📖 Caffeine Assistant — Commands')
    .setDescription(
      `Mention me or use \`${PREFIX}\` as a prefix, e.g.\n` +
      `\`@${client.user.username} warn @user reason\` or \`${PREFIX}warn @user reason\``
    )
    .addFields(
      {
        name: '📢 Warnings',
        value:
          `\`warn @user <reason>\` — Warn a member ${t}\n` +
          `\`unwarn @user [reason]\` — Remove one warn ${t}\n` +
          `\`clearwarns @user [reason]\` — Clear all warns ${t}\n` +
          `\`warns @user\` — View warning history ${t}\n` +
          `\`warns leaderboard\` — Top 5 most warned ${t}`,
      },
      {
        name: '⚔️ Punishments',
        value:
          `\`ban @user [reason]\` — Ban a member ${t}\n` +
          `\`softban @user [reason]\` — Ban then unban, purges messages ${t}\n` +
          `\`tempban @user <10m|2h|3d|1w> [reason]\` — Temp ban ${t}\n` +
          `\`unban <userID> [reason]\` — Unban a user ${t}\n` +
          `\`kick @user [reason]\` — Kick a member ${t}\n` +
          `\`timeout @user <10m|2h|1d> [reason]\` — Timeout a member ${t}\n` +
          `\`untimeout @user [reason]\` — Remove a timeout ${t}`,
      },
      {
        name: '🛠️ Channel & Server',
        value:
          `\`purge <1-100> [@user]\` — Delete recent messages ${t}\n` +
          `\`lock [reason]\` — Lock this channel ${t}\n` +
          `\`unlock [reason]\` — Unlock this channel ${t}\n` +
          `\`slowmode <seconds|off>\` — Set channel slowmode ${t}\n` +
          `\`nick @user <name|reset>\` — Change a nickname ${t}`,
      },
      {
        name: '🎭 Roles',
        value:
          `\`addrole @user <role>\` — Give a role ${t}\n` +
          `\`removerole @user <role>\` — Remove a role ${t}`,
      },
      {
        name: '📝 Notes & Logs',
        value:
          `\`note @user <text>\` — Add a private mod note ${t}\n` +
          `\`modlogs @user\` — View a member's mod history ${t}`,
      }
    )
    .setFooter({
      text: 'Durations: 10m, 2h, 3d, 1w  •  Warns: 3→10m timeout, 5→30m, 8→24h, 12→1w ban, 14→3w ban, 16→perma ban',
    });
  return m.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
});

/* ------------------------------ Events ----------------------------- */
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({
    status: 'dnd',
    activities: [{ name: 'over the server', type: ActivityType.Watching }],
  });
  checkTempbans();
  setInterval(checkTempbans, 30 * 1000);
});

client.on('error', (err) => console.error('Client error:', err));
client.on('shardError', (err) => console.error('Shard error:', err));
client.on('warn', (msg) => console.warn('Client warning:', msg));

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const mentionRe = new RegExp(`^<@!?${client.user.id}>\\s*`);
  let content = message.content;

  if (mentionRe.test(content)) {
    content = content.replace(mentionRe, '');
  } else if (content.startsWith(PREFIX)) {
    content = content.slice(PREFIX.length);
  } else {
    return;
  }

  const args = content.trim().split(/\s+/).filter(Boolean);
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
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

console.log('Node version:', process.version);

// Quick outbound-network sanity check against Discord's public API.
function testDiscordReachability() {
  return new Promise((resolve) => {
    const req = require('https').get(
      'https://discord.com/api/v10/gateway',
      { timeout: 8000 },
      (res) => {
        console.log('Reachability check: got HTTP', res.statusCode, 'from discord.com');
        res.resume();
        resolve();
      }
    );
    req.on('timeout', () => {
      console.error('Reachability check: TIMED OUT reaching discord.com — outbound network is likely blocked.');
      req.destroy();
      resolve();
    });
    req.on('error', (err) => {
      console.error('Reachability check: FAILED —', err.message);
      resolve();
    });
  });
}

if (!process.env.TOKEN) {
  console.error('FATAL: the TOKEN environment variable is not set. Add it in Render → Environment.');
} else {
  console.log('TOKEN is set, length:', process.env.TOKEN.trim().length, '(a real bot token is usually 59-72 characters)');
  testDiscordReachability().then(() => {
    console.log('Attempting Discord login...');
    client
      .login(process.env.TOKEN.trim())
      .then(() => console.log('login() resolved — waiting for the ready event...'))
      .catch((err) => {
        console.error('FATAL: login failed —', err.message);
      });
  });
}
