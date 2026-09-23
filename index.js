const {
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require("discord.js");

const fs = require("fs");
const http = require("http");

// ==================================================
// CONFIG
// ==================================================

const MOD_LOG_CHANNEL_ID = "1547632399620382811";

// ==================================================
// BOT
// ==================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ==================================================
// RENDER WEB SERVER
// ==================================================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("Bot is online!");
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ==================================================
// DATA
// ==================================================

const WARN_FILE = "./warnings.json";
const RULE_FILE = "./rules.json";

if (!fs.existsSync(WARN_FILE)) {
  fs.writeFileSync(WARN_FILE, "{}");
}

if (!fs.existsSync(RULE_FILE)) {
  fs.writeFileSync(RULE_FILE, "{}");
}

let warnings = JSON.parse(
  fs.readFileSync(WARN_FILE, "utf8")
);

let rules = JSON.parse(
  fs.readFileSync(RULE_FILE, "utf8")
);

function saveWarnings() {
  fs.writeFileSync(
    WARN_FILE,
    JSON.stringify(warnings, null, 2)
  );
}

function saveRules() {
  fs.writeFileSync(
    RULE_FILE,
    JSON.stringify(rules, null, 2)
  );
}

// ==================================================
// HELPERS
// ==================================================

function getMember(message) {
  return message.mentions.members.first();
}

function removeMentionArguments(args) {
  return args.filter(
    arg => !/^<@!?\d+>$/.test(arg)
  );
}

function getReason(args) {
  const cleanArgs = removeMentionArguments(args);

  return cleanArgs.join(" ").trim() ||
    "No reason provided";
}

function hasPermission(message, permission) {
  return message.member.permissions.has(permission);
}

function canModerate(message, member) {
  if (!member) return false;

  if (member.id === message.guild.ownerId) {
    return false;
  }

  return (
    message.member.roles.highest.position >
    member.roles.highest.position
  );
}

function getDuration(text) {
  if (!text) return null;

  const match = text.match(
    /^(\d+)(s|m|h|d)$/i
  );

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

// ==================================================
// MOD LOG SYSTEM
// ==================================================

async function modLog(guild, title, description) {
  try {
    const channel = guild.channels.cache.get(
      MOD_LOG_CHANNEL_ID
    );

    if (!channel) {
      console.log(
        "Mod-log channel not found."
      );
      return;
    }

    await channel.send({
      content:
        `**${title}**\n${description}`
    });

  } catch (error) {
    console.error(
      "Mod-log error:",
      error.message
    );
  }
}

// ==================================================
// READY
// ==================================================

client.once("ready", () => {
  console.log(
    `Logged in as ${client.user.tag}`
  );

  client.user.setPresence({
    status: "dnd",
    activities: [
      {
        name: "@Bot help",
        type: 0
      }
    ]
  });

  console.log("Bot status set to DND.");
});

// ==================================================
// COMMANDS
// ==================================================

client.on("messageCreate", async message => {

  if (message.author.bot) return;

  const botMention =
    `<@${client.user.id}>`;

  const botMentionNick =
    `<@!${client.user.id}>`;

  if (
    !message.content.startsWith(botMention) &&
    !message.content.startsWith(botMentionNick)
  ) {
    return;
  }

  let content = message.content
    .replace(botMention, "")
    .replace(botMentionNick, "")
    .trim();

  if (!content) return;

  const args = content.split(/\s+/);

  const command =
    args.shift().toLowerCase();

  // ==================================================
  // PING
  // ==================================================

  if (command === "ping") {

    return message.reply(
      "Heyyyyy!!! :anime~1:"
    );
  }

  // ==================================================
  // HELP
  // ==================================================

  if (command === "help") {

    return message.reply(`
╭━━━〔 🤖 BOT COMMANDS :Verify: 〕━━━╮

🛡️ MODERATION

@Bot warn @user reason :Verify:
@Bot warns @user :Verify:
@Bot warns leaderboard :Verify:
@Bot deletewarn @user number :Verify:
@Bot clearwarns @user :Verify:
@Bot purge 10 :Verify:
@Bot kick @user reason :Verify:
@Bot ban @user reason :Verify:
@Bot unban userID :Verify:
@Bot timeout @user 10m reason :Verify:
@Bot untimeout @user :Verify:

🔒 CHANNEL

@Bot lock :Verify:
@Bot unlock :Verify:
@Bot slowmode 10 :Verify:

🎭 ROLES

@Bot addrole @user @role :Verify:
@Bot removerole @user @role :Verify:

👤 USER

@Bot nick @user NewName :Verify:
@Bot userinfo @user :Verify:

📊 SERVER

@Bot serverinfo :Verify:

📜 RULES

@Bot setrule 1 Rule text :Verify:
@Bot delrule 1 :Verify:
@Bot rules :Verify:

🤖 GENERAL

@Bot ping :Verify:
@Bot help :Verify:

╰━━━━━━━━━━━━━━━━━━━━━━╯
`);
  }

  // ==================================================
  // WARN LEADERBOARD
  // ==================================================

  if (
    command === "warns" &&
    args[0]?.toLowerCase() === "leaderboard"
  ) {

    const guildWarnings =
      warnings[message.guild.id] || {};

    const leaderboard =
      Object.entries(guildWarnings)
        .map(([id, list]) => ({
          id,
          count: list.length
        }))
        .sort((a, b) =>
          b.count - a.count
        )
        .slice(0, 10);

    if (!leaderboard.length) {
      return message.reply(
        "📊 No warnings recorded."
      );
    }

    let text =
      "🏆 **WARNING LEADERBOARD**\n\n";

    for (
      let i = 0;
      i < leaderboard.length;
      i++
    ) {

      const user =
        await client.users.fetch(
          leaderboard[i].id
        ).catch(() => null);

      if (user) {
        text +=
          `**${i + 1}.** ${user} — ${leaderboard[i].count}\n`;
      }
    }

    return message.reply(text);
  }

  // ==================================================
  // WARN
  // ==================================================

  if (command === "warn") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply(
        "❌ You don't have permission to warn members."
      );
    }

    const member =
      getMember(message);

    if (!member) {
      return message.reply(
        "❌ Mention a member."
      );
    }

    if (!canModerate(message, member)) {
      return message.reply(
        "❌ You cannot warn someone with an equal or higher role."
      );
    }

    const reason =
      getReason(args);

    if (!warnings[message.guild.id]) {
      warnings[message.guild.id] = {};
    }

    if (
      !warnings[message.guild.id][member.id]
    ) {
      warnings[message.guild.id][member.id] = [];
    }

    warnings[
      message.guild.id
    ][member.id].push({
      reason,
      moderator: message.author.id,
      time: new Date().toISOString()
    });

    saveWarnings();

    const count =
      warnings[
        message.guild.id
      ][member.id].length;

    await message.reply(
      `📣 ${member} **HAS BEEN WARNED BY** ${message.author}\n${reason} **[#${count}]**`
    );

    await modLog(
      message.guild,
      "⚠️ MEMBER WARNED",
      `👤 **User:** ${member}\n` +
      `👮 **Moderator:** ${message.author}\n` +
      `📝 **Reason:** ${reason}\n` +
      `🔢 **Warning:** #${count}`
    );

    return;
  }

  // ==================================================
  // WARNS
  // ==================================================

  if (command === "warns") {

    const member =
      getMember(message);

    if (!member) {
      return message.reply(
        "❌ Mention a member."
      );
    }

    const guildWarnings =
      warnings[message.guild.id] || {};

    const list =
      guildWarnings[member.id] || [];

    if (!list.length) {
      return message.reply(
        `✅ ${member} has no warnings.`
      );
    }

    let text =
      `⚠️ **Warnings for ${member}**\n\n`;

    list.forEach((warn, index) => {

      text +=
        `**#${index + 1}** — ${warn.reason}\n`;
    });

    return message.reply(text);
  }

  // ==================================================
  // DELETE WARNING
  // ==================================================

  if (command === "deletewarn") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    const member =
      getMember(message);

    const number =
      Number(
        args.find(
          x => /^\d+$/.test(x)
        )
      );

    if (!member || !number) {
      return message.reply(
        "❌ Usage: @Bot deletewarn @user 1"
      );
    }

    const guildWarnings =
      warnings[message.guild.id] || {};

    const list =
      guildWarnings[member.id] || [];

    if (!list[number - 1]) {
      return message.reply(
        "❌ That warning doesn't exist."
      );
    }

    list.splice(number - 1, 1);

    saveWarnings();

    await message.reply(
      `🗑️ Warning #${number} deleted from ${member}.`
    );

    await modLog(
      message.guild,
      "🗑️ WARNING DELETED",
      `👤 **User:** ${member}\n` +
      `👮 **Moderator:** ${message.author}\n` +
      `🔢 **Warning:** #${number}`
    );

    return;
  }

  // ==================================================
  // CLEAR WARNINGS
  // ==================================================

  if (command === "clearwarns") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    const member =
      getMember(message);

    if (!member) {
      return message.reply(
        "❌ Mention a member."
      );
    }

    if (warnings[message.guild.id]) {
      delete warnings[
        message.guild.id
      ][member.id];
    }

    saveWarnings();

    await message.reply(
      `🧹 Cleared all warnings for ${member}.`
    );

    await modLog(
      message.guild,
      "🧹 WARNINGS CLEARED",
      `👤 **User:** ${member}\n` +
      `👮 **Moderator:** ${message.author}`
    );

    return;
  }

  // ==================================================
  // PURGE
  // ==================================================

  if (
    command === "purge" ||
    command === "clear"
  ) {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.ManageMessages
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    const amount =
      Number(args[0]);

    if (
      !amount ||
      amount < 1 ||
      amount > 100
    ) {
      return message.reply(
        "❌ Choose a number between 1 and 100."
      );
    }

    const deleted =
      await message.channel.bulkDelete(
        amount + 1,
        true
      );

    const count =
      Math.max(
        deleted.size - 1,
        0
      );

    const log =
      await modLog(
        message.guild,
        "🧹 MESSAGES PURGED",
        `👮 **Moderator:** ${message.author}\n` +
        `📍 **Channel:** ${message.channel}\n` +
        `🗑️ **Messages:** ${count}`
      );

    return message.channel.send(
      `🧹 Deleted **${count}** messages.`
    );
  }

  // ==================================================
  // TIMEOUT
  // ==================================================

  if (command === "timeout") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    const member =
      getMember(message);

    if (!member) {
      return message.reply(
        "❌ Mention a member."
      );
    }

    if (!canModerate(message, member)) {
      return message.reply(
        "❌ You cannot timeout this member."
      );
    }

    const durationArg =
      args.find(
        x => /^\d+(s|m|h|d)$/i.test(x)
      );

    const duration =
      getDuration(durationArg);

    if (!duration) {
      return message.reply(
        "❌ Example: @Bot timeout @user 10m spam"
      );
    }

    const reason =
      getReason(args);

    await member.timeout(
      duration,
      reason
    );

    await message.reply(
      `⏱️ ${member} has been timed out by ${message.author}.\nReason: ${reason}`
    );

    await modLog(
      message.guild,
      "⏱️ MEMBER TIMED OUT",
      `👤 **User:** ${member}\n` +
      `👮 **Moderator:** ${message.author}\n` +
      `⏱️ **Duration:** ${durationArg}\n` +
      `📝 **Reason:** ${reason}`
    );

    return;
  }

  // ==================================================
  // UNTIMEOUT
  // ==================================================

  if (
    command === "untimeout" ||
    command === "unmute"
  ) {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    const member =
      getMember(message);

    if (!member) {
      return message.reply(
        "❌ Mention a member."
      );
    }

    await member.timeout(null);

    await message.reply(
      `🔊 ${member} is no longer timed out.`
    );

    await modLog(
      message.guild,
      "🔊 TIMEOUT REMOVED",
      `👤 **User:** ${member}\n` +
      `👮 **Moderator:** ${message.author}`
    );

    return;
  }

  // ==================================================
  // KICK
  // ==================================================

  if (command === "kick") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.KickMembers
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    const member =
      getMember(message);

    if (!member) {
      return message.reply(
        "❌ Mention a member."
      );
    }

    if (!canModerate(message, member)) {
      return message.reply(
        "❌ You cannot kick this member."
      );
    }

    const reason =
      getReason(args);

    await member.kick(reason);

    await message.reply(
      `👢 ${member.user.tag} was kicked by ${message.author}.\nReason: ${reason}`
    );

    await modLog(
      message.guild,
      "👢 MEMBER KICKED",
      `👤 **User:** ${member.user.tag}\n` +
      `👮 **Moderator:** ${message.author}\n` +
      `📝 **Reason:** ${reason}`
    );

    return;
  }

  // ==================================================
  // BAN
  // ==================================================

  if (command === "ban") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.BanMembers
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    const member =
      getMember(message);

    if (!member) {
      return message.reply(
        "❌ Mention a member."
      );
    }

    if (!canModerate(message, member)) {
      return message.reply(
        "❌ You cannot ban this member."
      );
    }

    const reason =
      getReason(args);

    await member.ban({
      reason
    });

    await message.reply(
      `🔨 ${member.user.tag} was banned by ${message.author}.\nReason: ${reason}`
    );

    await modLog(
      message.guild,
      "🔨 MEMBER BANNED",
      `👤 **User:** ${member.user.tag}\n` +
      `👮 **Moderator:** ${message.author}\n` +
      `📝 **Reason:** ${reason}`
    );

    return;
  }

  // ==================================================
  // UNBAN
  // ==================================================

  if (command === "unban") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.BanMembers
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    const userId =
      args.find(
        x => /^\d{17,20}$/.test(x)
      );

    if (!userId) {
      return message.reply(
        "❌ Give the user's ID."
      );
    }

    await message.guild.members.unban(
      userId
    );

    await message.reply(
      `✅ <@${userId}> has been unbanned.`
    );

    await modLog(
      message.guild,
      "🔓 MEMBER UNBANNED",
      `👤 **User:** <@${userId}>\n` +
      `👮 **Moderator:** ${message.author}`
    );

    return;
  }

  // ==================================================
  // LOCK
  // ==================================================

  if (command === "lock") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.ManageChannels
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    await message.channel
      .permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: false
        }
      );

    await message.reply(
      "🔒 This channel has been locked."
    );

    await modLog(
      message.guild,
      "🔒 CHANNEL LOCKED",
      `👮 **Moderator:** ${message.author}\n` +
      `📍 **Channel:** ${message.channel}`
    );

    return;
  }

  // ==================================================
  // UNLOCK
  // ==================================================

  if (command === "unlock") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.ManageChannels
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    await message.channel
      .permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: null
        }
      );

    await message.reply(
      "🔓 This channel has been unlocked."
    );

    await modLog(
      message.guild,
      "🔓 CHANNEL UNLOCKED",
      `👮 **Moderator:** ${message.author}\n` +
      `📍 **Channel:** ${message.channel}`
    );

    return;
  }

  // ==================================================
  // SLOWMODE
  // ==================================================

  if (command === "slowmode") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.ManageChannels
      )
    ) {
      return message.reply(
        "❌ You don't have permission."
      );
    }

    const seconds =
      Number(args[0]);

    if (
      isNaN(seconds) ||
      seconds < 0 ||
      seconds > 21600
    ) {
      return message.reply(
        "❌ Use 0–21600 seconds."
      );
    }

    await message.channel
      .setRateLimitPerUser(seconds);

    await message.reply(
      seconds === 0
        ? "🐌 Slowmode disabled."
        : `🐌 Slowmode set to **${seconds} seconds**.`
    );

    await modLog(
      message.guild,
      "🐌 SLOWMODE CHANGED",
      `👮 **Moderator:** ${message.author}\n` +
      `📍 **Channel:** ${message.channel}\n` +
      `⏱️ **Seconds:** ${seconds}`
    );

    return;
  }

  // ==================================================
  // ADD ROLE
  // ==================================================

  if (command === "addrole") {

    if (
      !hasPermission(
        message,
        PermissionsBitField.Flags.ManageRoles
      )
    ) {
      return m
