const { MongoClient } = require('mongodb');

// Tiny web server so Render sees an open port
require('http')
  .createServer((req, res) => res.end('Bot is running'))
  .listen(process.env.PORT || 3000);
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits: P,
  EmbedBuilder,
  ActivityType,
  Events,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

/* ---------------- storage ---------------- */
let db = { warns: {}, tempbans: [] };
let col;

async function initDB() {
  const mongo = new MongoClient(process.env.MONGO_URI);
  await mongo.connect();
  col = mongo.db('modbot').collection('data');
  const doc = await col.findOne({ _id: 'main' });
  if (doc) db = { warns: doc.warns || {}, tempbans: doc.tempbans || [] };
  console.log('Database connected');
}

const save = () =>
  col
    .replaceOne({ _id: 'main' }, { _id: 'main', ...db }, { upsert: true })
    .catch((e) => console.error('DB save failed:', e.message));

/* ---------------- constants ---------------- */
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;

// Warn escalation
const PUNISH = [
  { at: 3, type: 'timeout', ms: 10 * MIN, label: '10 minute timeout' },
  { at: 5, type: 'timeout', ms: 30 * MIN, label: '30 minute timeout' },
  { at: 8, type: 'timeout', ms: 24 * HOUR, label: '24 hour timeout' },
  { at: 12, type: 'ban', ms: 7 * DAY, label: '1 week ban' },
  { at: 14, type: 'ban', ms: 21 * DAY, label: '3 week ban' },
  { at: 16, type: 'ban', ms: null, label: 'permanent ban' },
];

/* ---------------- helpers ---------------- */
const fmt = (id, action, byId, reason, extra = '') =>
  `<@${id}> is ${action} by <@${byId}> | Reason: ${reason}${extra} --- ✅`;

const say = (ctx, content) =>
  ctx.message.channel.send({ content, allowedMentions: { parse: [] } });

const parseId = (s) => {
  const m = /^<@!?(\d{15,20})>$/.exec(s || '') || /^(\d{15,20})$/.exec(s || '');
  return m ? m[1] : null;
};

const parseDuration = (s) => {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(s || '');
  if (!m) return null;
  const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[m[2].toLowerCase()];
  return Number(m[1]) * unit;
};

const humanMs = (ms) => {
  if (ms >= DAY) return `${Math.round(ms / DAY)}d`;
  if (ms >= HOUR) return `${Math.round(ms / HOUR)}h`;
  return `${Math.round(ms / MIN)}m`;
};

const dm = (userId, text) =>
  client.users.fetch(userId).then((u) => u.send(text)).catch(() => {});

const warnList = (gid, uid) => ((db.warns[gid] ??= {})[uid] ??= []);

// resolves the first arg to a user (and member) and runs safety checks
async function getTarget(ctx, { needMember = true, check } = {}) {
  const id = parseId(ctx.args.shift());
  if (!id) throw new Error('Mention a user or give their ID.');
  const member = await ctx.guild.members.fetch(id).catch(() => null);
  if (needMember && !member) throw new Error('That user is not in this server.');
  if (id === ctx.author.id) throw new Error("You can't do that to yourself.");
  if (id === client.user.id) throw new Error("I can't do that to myself.");
  if (member) {
    if (id === ctx.guild.ownerId) throw new Error("You can't do that to the server owner.");
    if (
      ctx.author.id !== ctx.guild.ownerId &&
      ctx.author.roles.highest.position <= member.roles.highest.position
    ) {
      throw new Error('That user has an equal or higher role than you.');
    }
    if (check && !member[check]) {
      throw new Error('I cannot do that to this user (check my role position/permissions).');
    }
  }
  return { id, member };
}

const reasonFrom = (args) => args.join(' ').trim() || 'No reason provided';

async function tempbanRecord(gid, uid, ms) {
  db.tempbans = db.tempbans.filter((b) => !(b.guildId === gid && b.userId === uid));
  if (ms) db.tempbans.push({ guildId: gid, userId: uid, expires: Date.now() + ms });
  save();
}

/* ---------------- commands ---------------- */
const commands = {
  ban: {
    usage: 'ban @user [reason]',
    desc: 'Ban a member',
    perm: P.BanMembers,
    async run(ctx) {
      const { id, member } = await getTarget(ctx, { needMember: false, check: 'bannable' });
      const reason = reasonFrom(ctx.args);
      await dm(id, `You were banned from **${ctx.guild.name}**. Reason: ${reason}`);
      await ctx.guild.members.ban(id, { reason: `${ctx.message.author.tag}: ${reason}` });
      await tempbanRecord(ctx.guild.id, id, null);
      await say(ctx, fmt(id, 'banned', ctx.author.id, reason));
    },
  },

  tempban: {
    usage: 'tempban @user <10m|2h|3d|1w> [reason]',
    desc: 'Temporarily ban a member',
    perm: P.BanMembers,
    async run(ctx) {
      const { id } = await getTarget(ctx, { needMember: false, check: 'bannable' });
      const ms = parseDuration(ctx.args.shift());
      if (!ms) throw new Error('Give a duration like 30m, 2h, 3d, 1w.');
      const reason = reasonFrom(ctx.args);
      await dm(id, `You were banned from **${ctx.guild.name}** for ${humanMs(ms)}. Reason: ${reason}`);
      await ctx.guild.members.ban(id, { reason: `${ctx.message.author.tag}: ${reason}` });
      await tempbanRecord(ctx.guild.id, id, ms);
      await say(ctx, fmt(id, 'banned', ctx.author.id, reason, ` | Duration: ${humanMs(ms)}`));
    },
  },

  unban: {
    usage: 'unban <userID> [reason]',
    desc: 'Unban a user',
    perm: P.BanMembers,
    async run(ctx) {
      const id = parseId(ctx.args.shift());
      if (!id) throw new Error('Give the ID of the user to unban.');
      const reason = reasonFrom(ctx.args);
      await ctx.guild.bans.remove(id, `${ctx.message.author.tag}: ${reason}`);
      await tempbanRecord(ctx.guild.id, id, null);
      await say(ctx, fmt(id, 'unbanned', ctx.author.id, reason));
    },
  },

  kick: {
    usage: 'kick @user [reason]',
    desc: 'Kick a member',
    perm: P.KickMembers,
    async run(ctx) {
      const { id, member } = await getTarget(ctx, { check: 'kickable' });
      const reason = reasonFrom(ctx.args);
      await dm(id, `You were kicked from **${ctx.guild.name}**. Reason: ${reason}`);
      await member.kick(`${ctx.message.author.tag}: ${reason}`);
      await say(ctx, fmt(id, 'kicked', ctx.author.id, reason));
    },
  },

  warn: {
    usage: 'warn @user [reason]',
    desc: 'Warn a member (auto punishments at 3/5/8/12/14/16 warns)',
    perm: P.ModerateMembers,
    async run(ctx) {
      const { id, member } = await getTarget(ctx);
      const reason = reasonFrom(ctx.args);
      const list = warnList(ctx.guild.id, id);
      list.push({ reason, by: ctx.author.id, at: Date.now() });
      save();
      const count = list.length;
      await dm(id, `You were warned in **${ctx.guild.name}**. Reason: ${reason} (Warn #${count})`);
      await say(ctx, fmt(id, 'warned', ctx.author.id, reason, ` | Warns: #${count}`));

      const p = PUNISH.find((x) => x.at === count) || (count > 16 ? PUNISH[PUNISH.length - 1] : null);
      if (!p) return;
      const why = `Reached ${count} warns`;
      try {
        if (p.type === 'timeout') {
          await member.timeout(p.ms, why);
        } else {
          await dm(id, `You were banned from **${ctx.guild.name}** (${p.label}). ${why}.`);
          await ctx.guild.members.ban(id, { reason: why });
          await tempbanRecord(ctx.guild.id, id, p.ms);
        }
        await say(ctx, `⚠️ <@${id}> reached **${count} warns** → **${p.label}** --- ✅`);
      } catch (e) {
        await say(ctx, `❌ <@${id}> reached ${count} warns but I couldn't apply the ${p.label}: ${e.message}`);
      }
    },
  },

  warns: {
    usage: 'warns @user',
    desc: 'Show a member\'s warns',
    perm: P.ModerateMembers,
    async run(ctx) {
      const id = parseId(ctx.args.shift());
      if (!id) throw new Error('Mention a user or give their ID.');
      const list = warnList(ctx.guild.id, id);
      if (!list.length) return say(ctx, `<@${id}> has no warns. --- ✅`);
      const lines = list
        .slice(-10)
        .map((w, i) => `#${list.length - Math.min(10, list.length) + i + 1} — ${w.reason} (by <@${w.by}>)`);
      await say(ctx, `<@${id}> has **${list.length}** warn(s):\n${lines.join('\n')}`);
    },
  },

  unwarn: {
    usage: 'unwarn @user',
    desc: 'Remove a member\'s latest warn',
    perm: P.ModerateMembers,
    async run(ctx) {
      const id = parseId(ctx.args.shift());
      if (!id) throw new Error('Mention a user or give their ID.');
      const list = warnList(ctx.guild.id, id);
      if (!list.length) throw new Error('That user has no warns.');
      list.pop();
      save();
      await say(ctx, fmt(id, 'unwarned', ctx.author.id, reasonFrom(ctx.args), ` | Warns: #${list.length}`));
    },
  },

  clearwarns: {
    usage: 'clearwarns @user',
    desc: 'Clear all warns of a member',
    perm: P.ModerateMembers,
    async run(ctx) {
      const id = parseId(ctx.args.shift());
      if (!id) throw new Error('Mention a user or give their ID.');
      (db.warns[ctx.guild.id] ??= {})[id] = [];
      save();
      await say(ctx, fmt(id, 'cleared of all warns', ctx.author.id, reasonFrom(ctx.args), ' | Warns: #0'));
    },
  },

  timeout: {
    usage: 'timeout @user <10m|2h|1d> [reason]',
    desc: 'Timeout (mute) a member (max 28d)',
    perm: P.ModerateMembers,
    async run(ctx) {
      const { id, member } = await getTarget(ctx, { check: 'moderatable' });
      const ms = parseDuration(ctx.args.shift());
      if (!ms || ms > 28 * DAY) throw new Error('Give a duration like 10m, 2h, 1d (max 28d).');
      const reason = reasonFrom(ctx.args);
      await member.timeout(ms, `${ctx.message.author.tag}: ${reason}`);
      await say(ctx, fmt(id, 'muted', ctx.author.id, reason, ` | Duration: ${humanMs(ms)}`));
    },
  },

  untimeout: {
    usage: 'untimeout @user [reason]',
    desc: 'Remove a timeout (unmute)',
    perm: P.ModerateMembers,
    async run(ctx) {
      const { id, member } = await getTarget(ctx, { check: 'moderatable' });
      const reason = reasonFrom(ctx.args);
      await member.timeout(null, `${ctx.message.author.tag}: ${reason}`);
      await say(ctx, fmt(id, 'unmuted', ctx.author.id, reason));
    },
  },

  purge: {
    usage: 'purge <1-99>',
    desc: 'Bulk delete recent messages',
    perm: P.ManageMessages,
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      if (!n || n < 1 || n > 99) throw new Error('Give a number between 1 and 99.');
      const deleted = await ctx.message.channel.bulkDelete(n + 1, true);
      const m = await ctx.message.channel.send(
        `🧹 Deleted ${Math.max(deleted.size - 1, 0)} message(s) by ${ctx.message.author.tag} --- ✅`
      );
      setTimeout(() => m.delete().catch(() => {}), 4000);
    },
  },

  slowmode: {
    usage: 'slowmode <seconds|0>',
    desc: 'Set channel slowmode',
    perm: P.ManageChannels,
    async run(ctx) {
      const s = parseInt(ctx.args[0], 10);
      if (Number.isNaN(s) || s < 0 || s > 21600) throw new Error('Give seconds between 0 and 21600.');
      await ctx.message.channel.setRateLimitPerUser(s);
      await say(ctx, `⏱️ Slowmode set to **${s}s** by <@${ctx.author.id}> --- ✅`);
    },
  },

  lock: {
    usage: 'lock',
    desc: 'Lock the channel for @everyone',
    perm: P.ManageChannels,
    async run(ctx) {
      await ctx.message.channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: false });
      await say(ctx, `🔒 Channel locked by <@${ctx.author.id}> --- ✅`);
    },
  },

  unlock: {
    usage: 'unlock',
    desc: 'Unlock the channel',
    perm: P.ManageChannels,
    async run(ctx) {
      await ctx.message.channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: null });
      await say(ctx, `🔓 Channel unlocked by <@${ctx.author.id}> --- ✅`);
    },
  },

  nick: {
    usage: 'nick @user <new nickname|reset>',
    desc: 'Change or reset a nickname',
    perm: P.ManageNicknames,
    async run(ctx) {
      const { id, member } = await getTarget(ctx, { check: 'manageable' });
      const nick = ctx.args.join(' ').trim();
      if (!nick) throw new Error('Give a new nickname or "reset".');
      await member.setNickname(nick.toLowerCase() === 'reset' ? null : nick.slice(0, 32));
      await say(ctx, fmt(id, 'renamed', ctx.author.id, nick));
    },
  },

  addrole: {
    usage: 'addrole @user @role',
    desc: 'Give a role to a member',
    perm: P.ManageRoles,
    async run(ctx) {
      const { id, member } = await getTarget(ctx);
      const role = ctx.message.mentions.roles.first();
      if (!role) throw new Error('Mention the role to add.');
      await member.roles.add(role);
      await say(ctx, fmt(id, `given the role ${role.name}`, ctx.author.id, 'Role added'));
    },
  },

  removerole: {
    usage: 'removerole @user @role',
    desc: 'Remove a role from a member',
    perm: P.ManageRoles,
    async run(ctx) {
      const { id, member } = await getTarget(ctx);
      const role = ctx.message.mentions.roles.first();
      if (!role) throw new Error('Mention the role to remove.');
      await member.roles.remove(role);
      await say(ctx, fmt(id, `stripped of the role ${role.name}`, ctx.author.id, 'Role removed'));
    },
  },

  help: {
    usage: 'help',
    desc: 'List all commands',
    async run(ctx) {
      const p = `<@${client.user.id}>`;
      const embed = new EmbedBuilder()
        .setTitle('Moderation Commands')
        .setColor(0xed4245)
        .setDescription(
          Object.values(commands)
            .map((c) => `**${p} ${c.usage}** — ${c.desc}`)
            .join('\n')
        )
        .addFields({
          name: 'Warn punishments',
          value: PUNISH.map((x) => `${x.at} warns → ${x.label}`).join('\n'),
        });
      await ctx.message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    },
  },
};

const aliases = { mute: 'timeout', unmute: 'untimeout', clear: 'purge', commands: 'help' };

/* ---------------- events ---------------- */
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({
    status: 'dnd',
    activities: [{ name: `@${client.user.username} help`, type: ActivityType.Playing }],
  });
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = new RegExp(`^<@!?${client.user.id}>\\s*`);
  const match = prefix.exec(message.content);
  if (!match) return;

  const args = message.content.slice(match[0].length).trim().split(/\s+/).filter(Boolean);
  let name = (args.shift() || 'help').toLowerCase();
  name = aliases[name] || name;
  const cmd = commands[name];
  if (!cmd) return;

  const author = message.member || (await message.guild.members.fetch(message.author.id));
  if (cmd.perm && !author.permissions.has(cmd.perm)) {
    return message.reply({
      content: "❌ You don't have permission to use that command.",
      allowedMentions: { repliedUser: false },
    });
  }

  try {
    await cmd.run({ message, args, guild: message.guild, author });
  } catch (err) {
    message.reply({
      content: `❌ ${err.message || 'Something went wrong.'}`,
      allowedMentions: { repliedUser: false },
    });
  }
});

// Unban expired temp bans
setInterval(async () => {
  const now = Date.now();
  const due = db.tempbans.filter((b) => b.expires <= now);
  if (!due.length) return;
  db.tempbans = db.tempbans.filter((b) => b.expires > now);
  save();
  for (const b of due) {
    try {
      const g = await client.guilds.fetch(b.guildId);
      await g.bans.remove(b.userId, 'Temporary ban expired');
    } catch {}
  }
}, 30 * 1000);

initDB()
  .then(() => client.login(process.env.TOKEN))
  .catch((e) => {
    console.error('Startup failed:', e.message);
    process.exit(1);
  });
      
