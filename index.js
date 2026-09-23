const {
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require("discord.js");

const fs = require("fs");
const http = require("http");

// ===============================
// CLIENT
// ===============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ===============================
// CONFIG
// ===============================

const PREFIX = "@Bot";
const MOD_LOG_CHANNEL_ID = "1547632399620382811";

const PORT = process.env.PORT || 3000;

// ===============================
// FILE STORAGE
// ===============================

const WARN_FILE = "./warnings.json";
const RULE_FILE = "./rules.json";

if (!fs.existsSync(WARN_FILE)) {
  fs.writeFileSync(WARN_FILE, "{}");
}

if (!fs.existsSync(RULE_FILE)) {
  fs.writeFileSync(RULE_FILE, "{}");
}

let warnings = JSON.parse(fs.readFileSync(WARN_FILE, "utf8"));
let rules = JSON.parse(fs.readFileSync(RULE_FILE, "utf8"));

function saveWarnings() {
  fs.writeFileSync(WARN_FILE, JSON.stringify(warnings, null, 2));
}

function saveRules() {
  fs.writeFileSync(RULE_FILE, JSON.stringify(rules, null, 2));
}

// ===============================
// RENDER WEB SERVER
// ===============================

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("Bot is online!");
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ===============================
// READY
// ===============================

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: "dnd",
    activities: [
      {
        name: "@Bot help",
        type: 0
      }
    ]
  });
});

// ===============================
// MOD LOG
// ===============================

async function modLog(guild, title, description) {
  try {
    const channel = guild.channels.cache.get(MOD_LOG_CHANNEL_ID);

    if (!channel) return;

    await channel.send(
      `📋 **${title}**\n${description}`
    );
  } catch (error) {
    console.log("Mod-log error:", error.message);
  }
}

// ===============================
// HELPERS
// ===============================

function removeMentionArguments(args) {
  return args.filter(arg => !/^<@!?\d+>$/.test(arg));
}

function getReason(args) {
  const cleanArgs = removeMentionArguments(args);

  return cleanArgs.join(" ").trim() || "No reason provided";
}

function getTarget(message) {
  return message.mentions.members.first();
}

function getUserKey(guildId, userId) {
  return `${guildId}_${userId}`;
}

// ===============================
// AUTOMATIC WARNING PUNISHMENTS
// ===============================

async function applyWarningPunishment(message, member, count, reason) {
  try {

    // 3 WARNINGS = 10 MIN TIMEOUT
    if (count === 3) {
      await member.timeout(
        10 * 60 * 1000,
        "Reached 3 warnings"
      );

      await message.channel.send(
        `⏱️ ${member} has been **timed out for 10 minutes** for reaching **3 warnings**.`
      );

      await modLog(
        message.guild,
        "Automatic Punishment",
        `${member} was timed out for **10 minutes** after reaching **3 warnings**.\nReason: ${reason}`
      );
    }

    // 5 WARNINGS = 30 MIN TIMEOUT
    else if (count === 5) {
      await member.timeout(
        30 * 60 * 1000,
        "Reached 5 warnings"
      );

      await message.channel.send(
        `⏱️ ${member} has been **timed out for 30 minutes** for reaching **5 warnings**.`
      );

      await modLog(
        message.guild,
        "Automatic Punishment",
        `${member} was timed out for **30 minutes** after reaching **5 warnings**.\nReason: ${reason}`
      );
    }

    // 8 WARNINGS = 24 HOUR TIMEOUT
    else if (count === 8) {
      await member.timeout(
        24 * 60 * 60 * 1000,
        "Reached 8 warnings"
      );

      await message.channel.send(
        `⏱️ ${member} has been **timed out for 24 hours** for reaching **8 warnings**.`
      );

      await modLog(
        message.guild,
        "Automatic Punishment",
        `${member} was timed out for **24 hours** after reaching **8 warnings**.\nReason: ${reason}`
      );
    }

    // 10 WARNINGS = 1 WEEK BAN
    else if (count === 10) {
      await member.ban({
        deleteMessageSeconds: 0,
        reason: "Reached 10 warnings"
      });

      await message.channel.send(
        `🔨 ${member.user.tag} has been **banned for 1 week** for reaching **10 warnings**.`
      );

      await modLog(
        message.guild,
        "Automatic Punishment",
        `${member.user.tag} was banned for **1 week** after reaching **10 warnings**.\nReason: ${reason}`
      );

      // Schedule unban after 1 week
      setTimeout(async () => {
        try {
          await message.guild.members.unban(
            member.id,
            "1 week warning punishment completed"
          );

          await modLog(
            message.guild,
            "Automatic Unban",
            `${member.user.tag} was automatically unbanned after the **1 week** punishment.`
          );
        } catch (error) {
          console.log("Automatic unban error:", error.message);
        }
      }, 7 * 24 * 60 * 60 * 1000);
    }

    // 12 WARNINGS = 3 WEEK BAN
    else if (count === 12) {
      await member.ban({
        deleteMessageSeconds: 0,
        reason: "Reached 12 warnings"
      });

      await message.channel.send(
        `🔨 ${member.user.tag} has been **banned for 3 weeks** for reaching **12 warnings**.`
      );

      await modLog(
        message.guild,
        "Automatic Punishment",
        `${member.user.tag} was banned for **3 weeks** after reaching **12 warnings**.\nReason: ${reason}`
      );

      // Schedule unban after 3 weeks
      setTimeout(async () => {
        try {
          await message.guild.members.unban(
            member.id,
            "3 week warning punishment completed"
          );

          await modLog(
            message.guild,
            "Automatic Unban",
            `${member.user.tag} was automatically unbanned after the **3 week** punishment.`
          );
        } catch (error) {
          console.log("Automatic unban error:", error.message);
        }
      }, 21 * 24 * 60 * 60 * 1000);
    }

    // 15 WARNINGS = PERMANENT BAN
    else if (count === 15) {
      await member.ban({
        deleteMessageSeconds: 0,
        reason: "Reached 15 warnings - permanent ban"
      });

      await message.channel.send(
        `🔨 ${member.user.tag} has been **permanently banned** for reaching **15 warnings**.`
      );

      await modLog(
        message.guild,
        "Automatic Punishment",
        `${member.user.tag} was **permanently banned** after reaching **15 warnings**.\nReason: ${reason}`
      );
    }

  } catch (error) {
    console.log("Automatic punishment error:", error.message);

    await message.channel.send(
      `⚠️ I couldn't apply the automatic punishment. Check my permissions and role position.`
    );
  }
}

// ===============================
// MESSAGE COMMANDS
// ===============================

client.on("messageCreate", async message => {

  if (message.author.bot) return;

  if (!message.guild) return;

  const content = message.content.trim();

  if (!content.toLowerCase().startsWith(PREFIX.toLowerCase())) {
    return;
  }

  const args = content.slice(PREFIX.length).trim().split(/\s+/);

  const command = args.shift()?.toLowerCase();

  if (!command) return;

  // ===============================
  // PING
  // ===============================

  if (command === "ping") {
    return message.reply("Heyyyyy!!! :cat~1:");
  }

  // ===============================
  // HELP
  // ===============================

  if (command === "help") {

    return message.reply(
`📚 **Caffeine Commands**

**General**
> @Bot ping :Verify:
> @Bot help :Verify:
> @Bot userinfo @user :Verify:
> @Bot serverinfo :Verify:

**Warnings**
> @Bot warn @user reason :Verify:
> @Bot warns @user :Verify:
> @Bot deletewarn @user number :Verify:
> @Bot clearwarns @user :Verify:
> @Bot warns leaderboard :Verify:

**Moderation**
> @Bot purge amount :Verify:
> @Bot timeout @user duration reason :Verify:
> @Bot untimeout @user :Verify:
> @Bot kick @user reason :Verify:
> @Bot ban @user reason :Verify:
> @Bot unban userID :Verify:

**Channels**
> @Bot lock :Verify:
> @Bot unlock :Verify:
> @Bot slowmode seconds :Verify:

**Roles**
> @Bot addrole @user role :Verify:
> @Bot removerole @user role :Verify:

**Nickname**
> @Bot nick @user nickname :Verify:

**Rules**
> @Bot setrule number text :Verify:
> @Bot delrule number :Verify:
> @Bot rules :Verify:`
    );
  }

  // ===============================
  // WARN
  // ===============================

  if (command === "warn") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ModerateMembers
    )) {
      return message.reply("❌ You don't have permission to warn members.");
    }

    const member = getTarget(message);

    if (!member) {
      return message.reply("❌ Mention a member.");
    }

    if (member.user.bot) {
      return message.reply("❌ You cannot warn bots.");
    }

    const reason = getReason(args);

    const key = getUserKey(
      message.guild.id,
      member.id
    );

    if (!warnings[key]) {
      warnings[key] = [];
    }

    warnings[key].push({
      reason,
      moderator: message.author.id,
      timestamp: Date.now()
    });

    saveWarnings();

    const count = warnings[key].length;

    await message.reply(
      `📣 ${member} **HAS BEEN WARNED BY** ${message.author}\n${reason} **[#${count}]**`
    );

    await modLog(
      message.guild,
      "Member Warned",
      `${member} was warned by ${message.author}\nReason: ${reason}\nWarnings: **#${count}**`
    );

    await applyWarningPunishment(
      message,
      member,
      count,
      reason
    );

    return;
  }

  // ===============================
  // WARNS LEADERBOARD
  // ===============================

  if (
    command === "warns" &&
    args[0]?.toLowerCase() === "leaderboard"
  ) {

    const guildPrefix = `${message.guild.id}_`;

    const leaderboard = Object.entries(warnings)
      .filter(([key]) => key.startsWith(guildPrefix))
      .map(([key, list]) => ({
        userId: key.replace(guildPrefix, ""),
        count: list.length
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    if (leaderboard.length === 0) {
      return message.reply("📊 No warnings recorded yet.");
    }

    let text = "🏆 **Warning Leaderboard**\n\n";

    for (let i = 0; i < leaderboard.length; i++) {

      const item = leaderboard[i];

      text += `${i + 1}. <@${item.userId}> — **${item.count} warnings**\n`;
    }

    return message.reply(text);
  }

  // ===============================
  // WARNS
  // ===============================

  if (command === "warns") {

    const member = getTarget(message);

    if (!member) {
      return message.reply("❌ Mention a member.");
    }

    const key = getUserKey(
      message.guild.id,
      member.id
    );

    const list = warnings[key] || [];

    if (list.length === 0) {
      return message.reply(
        `✅ ${member} has no warnings.`
      );
    }

    let text = `⚠️ **Warnings for ${member.user.tag}**\n\n`;

    list.forEach((warn, index) => {

      const date = new Date(warn.timestamp)
        .toLocaleDateString();

      text += `**#${index + 1}** — ${warn.reason}\n`;
      text += `Moderator: <@${warn.moderator}>\n`;
      text += `Date: ${date}\n\n`;
    });

    return message.reply(text);
  }

  // ===============================
  // DELETE WARNING
  // ===============================

  if (command === "deletewarn") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ModerateMembers
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const member = getTarget(message);

    const number = parseInt(
      args.find(arg => /^\d+$/.test(arg))
    );

    if (!member || !number) {
      return message.reply(
        "❌ Usage: `@Bot deletewarn @user number`"
      );
    }

    const key = getUserKey(
      message.guild.id,
      member.id
    );

    if (!warnings[key] || !warnings[key][number - 1]) {
      return message.reply("❌ That warning doesn't exist.");
    }

    const removed = warnings[key].splice(
      number - 1,
      1
    )[0];

    saveWarnings();

    await message.reply(
      `🗑️ Deleted warning **#${number}** from ${member}.`
    );

    await modLog(
      message.guild,
      "Warning Deleted",
      `Warning **#${number}** for ${member} was deleted by ${message.author}.\nReason: ${removed.reason}`
    );

    return;
  }

  // ===============================
  // CLEAR WARNINGS
  // ===============================

  if (command === "clearwarns") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ModerateMembers
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const member = getTarget(message);

    if (!member) {
      return message.reply("❌ Mention a member.");
    }

    const key = getUserKey(
      message.guild.id,
      member.id
    );

    const oldCount = warnings[key]?.length || 0;

    delete warnings[key];

    saveWarnings();

    await message.reply(
      `🧹 Cleared **${oldCount} warnings** from ${member}.`
    );

    await modLog(
      message.guild,
      "Warnings Cleared",
      `${oldCount} warnings were cleared from ${member} by ${message.author}.`
    );

    return;
  }

  // ===============================
  // PURGE / CLEAR
  // ===============================

  if (
    command === "purge" ||
    command === "clear"
  ) {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ManageMessages
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const amount = parseInt(args[0]);

    if (!amount || amount < 1 || amount > 100) {
      return message.reply(
        "❌ Enter a number between 1 and 100."
      );
    }

    const deleted = await message.channel.bulkDelete(
      amount + 1,
      true
    );

    await message.channel.send(
      `🧹 Deleted **${deleted.size - 1} messages**.`
    );

    await modLog(
      message.guild,
      "Messages Purged",
      `${message.author} deleted **${deleted.size - 1} messages** in ${message.channel}.`
    );

    return;
  }

  // ===============================
  // TIMEOUT
  // ===============================

  if (command === "timeout") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ModerateMembers
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const member = getTarget(message);

    if (!member) {
      return message.reply("❌ Mention a member.");
    }

    const durationArg = args.find(
      arg => /^\d+(s|m|h|d)$/i.test(arg)
    );

    if (!durationArg) {
      return message.reply(
        "❌ Example: `@Bot timeout @user 10m reason`"
      );
    }

    const match = durationArg.match(
      /^(\d+)(s|m|h|d)$/i
    );

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    let ms;

    if (unit === "s") ms = value * 1000;
    if (unit === "m") ms = value * 60 * 1000;
    if (unit === "h") ms = value * 60 * 60 * 1000;
    if (unit === "d") ms = value * 24 * 60 * 60 * 1000;

    const reason = getReason(args);

    await member.timeout(ms, reason);

    await message.reply(
      `⏱️ ${member} has been timed out for **${durationArg}**.`
    );

    await modLog(
      message.guild,
      "Member Timed Out",
      `${member} was timed out by ${message.author}.\nDuration: **${durationArg}**\nReason: ${reason}`
    );

    return;
  }

  // ===============================
  // UNTIMEOUT
  // ===============================

  if (
    command === "untimeout" ||
    command === "unmute"
  ) {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ModerateMembers
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const member = getTarget(message);

    if (!member) {
      return message.reply("❌ Mention a member.");
    }

    await member.timeout(null);

    await message.reply(
      `🔊 ${member} has been **untimed out**.`
    );

    await modLog(
      message.guild,
      "Timeout Removed",
      `${member} was untimed out by ${message.author}.`
    );

    return;
  }

  // ===============================
  // KICK
  // ===============================

  if (command === "kick") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.KickMembers
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const member = getTarget(message);

    if (!member) {
      return message.reply("❌ Mention a member.");
    }

    const reason = getReason(args);

    const username = member.user.tag;

    await member.kick(reason);

    await message.reply(
      `👢 **${username}** has been kicked.\nReason: ${reason}`
    );

    await modLog(
      message.guild,
      "Member Kicked",
      `${username} was kicked by ${message.author}.\nReason: ${reason}`
    );

    return;
  }

  // ===============================
  // BAN
  // ===============================

  if (command === "ban") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.BanMembers
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const member = getTarget(message);

    if (!member) {
      return message.reply("❌ Mention a member.");
    }

    const reason = getReason(args);

    const username = member.user.tag;

    await member.ban({
      deleteMessageSeconds: 0,
      reason
    });

    await message.reply(
      `🔨 **${username}** has been banned.\nReason: ${reason}`
    );

    await modLog(
      message.guild,
      "Member Banned",
      `${username} was banned by ${message.author}.\nReason: ${reason}`
    );

    return;
  }

  // ===============================
  // UNBAN
  // ===============================

  if (command === "unban") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.BanMembers
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const userId = args[0];

    if (!userId) {
      return message.reply(
        "❌ Usage: `@Bot unban userID`"
      );
    }

    try {

      const user = await client.users.fetch(userId);

      await message.guild.members.unban(
        userId,
        `Unbanned by ${message.author.tag}`
      );

      await message.reply(
        `🔓 **${user.tag}** has been unbanned.`
      );

      await modLog(
        message.guild,
        "Member Unbanned",
        `${user.tag} was unbanned by ${message.author}.`
      );

    } catch {
      return message.reply(
        "❌ Could not unban that user."
      );
    }

    return;
  }

  // ===============================
  // LOCK
  // ===============================

  if (command === "lock") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )) {
      return message.reply("❌ You don't have permission.");
    }

    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    await message.reply(
      "🔒 This channel has been **locked**."
    );

    await modLog(
      message.guild,
      "Channel Locked",
      `${message.channel} was locked by ${message.author}.`
    );

    return;
  }

  // ===============================
  // UNLOCK
  // ===============================

  if (command === "unlock") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )) {
      return message.reply("❌ You don't have permission.");
    }

    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    await message.reply(
      "🔓 This channel has been **unlocked**."
    );

    await modLog(
      message.guild,
      "Channel Unlocked",
      `${message.channel} was unlocked by ${message.author}.`
    );

    return;
  }

  // ===============================
  // SLOWMODE
  // ===============================

  if (command === "slowmode") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const seconds = parseInt(args[0]);

    if (
      isNaN(seconds) ||
      seconds < 0 ||
      seconds > 21600
    ) {
      return message.reply(
        "❌ Enter seconds between 0 and 21600."
      );
    }

    await message.channel.setRateLimitPerUser(
      seconds
    );

    await message.reply(
      `🐌 Slowmode set to **${seconds} seconds**.`
    );

    await modLog(
      message.guild,
      "Slowmode Changed",
      `${message.author} set slowmode in ${message.channel} to **${seconds} seconds**.`
    );

    return;
  }

  // ===============================
  // ADD ROLE
  // ===============================

  if (command === "addrole") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ManageRoles
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const member = getTarget(message);

    if (!member) {
      return message.reply("❌ Mention a member.");
    }

    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply("❌ Mention a role.");
    }

    await member.roles.add(role);

    await message.reply(
      `✅ Added ${role} to ${member}.`
    );

    await modLog(
      message.guild,
      "Role Added",
      `${message.author} added ${role} to ${member}.`
    );

    return;
  }

  // ===============================
  // REMOVE ROLE
  // ===============================

  if (
    command === "removerole" ||
    command === "delrole"
  ) {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ManageRoles
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const member = getTarget(message);

    if (!member) {
      return message.reply("❌ Mention a member.");
    }

    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply("❌ Mention a role.");
    }

    await member.roles.remove(role);

    await message.reply(
      `✅ Removed ${role} from ${member}.`
    );

    await modLog(
      message.guild,
      "Role Removed",
      `${message.author} removed ${role} from ${member}.`
    );

    return;
  }

  // ===============================
  // NICKNAME
  // ===============================

  if (command === "nick") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ManageNicknames
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const member = getTarget(message);

    if (!member) {
      return message.reply("❌ Mention a member.");
    }

    const cleanArgs = removeMentionArguments(args);

    const nickname = cleanArgs.join(" ").trim();

    if (!nickname) {
      return message.reply(
        "❌ Enter a nickname."
      );
    }

    await member.setNickname(nickname);

    await message.reply(
      `✏️ Changed ${member}'s nickname to **${nickname}**.`
    );

    await modLog(
      message.guild,
      "Nickname Changed",
      `${message.author} changed ${member}'s nickname to **${nickname}**.`
    );

    return;
  }

  // ===============================
  // USER INFO
  // ===============================

  if (command === "userinfo") {

    const member =
      getTarget(message) || message.member;

    return message.reply(
`👤 **User Information**

**Username:** ${member.user.tag}
**ID:** ${member.id}
**Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>
**Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`
    );
  }

  // ===============================
  // SERVER INFO
  // ===============================

  if (command === "serverinfo") {

    return message.reply(
`🏠 **Server Information**

**Server:** ${message.guild.name}
**Members:** ${message.guild.memberCount}
**Channels:** ${message.guild.channels.cache.size}
**Roles:** ${message.guild.roles.cache.size}`
    );
  }

  // ===============================
  // SET RULE
  // ===============================

  if (command === "setrule") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ManageGuild
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const number = parseInt(args.shift());

    const ruleText = args.join(" ").trim();

    if (!number || !ruleText) {
      return message.reply(
        "❌ Usage: `@Bot setrule number rule text`"
      );
    }

    if (!rules[message.guild.id]) {
      rules[message.guild.id] = {};
    }

    rules[message.guild.id][number] = ruleText;

    saveRules();

    return message.reply(
      `📜 Rule **${number}** has been set.`
    );
  }

  // ===============================
  // DELETE RULE
  // ===============================

  if (command === "delrule") {

    if (!message.member.permissions.has(
      PermissionsBitField.Flags.ManageGuild
    )) {
      return message.reply("❌ You don't have permission.");
    }

    const number = parseInt(args[0]);

    if (!number) {
      return message.reply(
        "❌ Enter a rule number."
      );
    }

    if (!rules[message.guild.id]?.[number]) {
      return message.reply(
        "❌ That rule doesn't exist."
      );
    }

    delete rules[message.guild.id][number];

    saveRules();

    return message.reply(
      `🗑️ Rule **${number}** deleted.`
    );
  }

  // ===============================
  // RULES
  // ===============================

  if (command === "rules") {

    const serverRules =
      rules[message.guild.id] || {};

    const entries = Object.entries(serverRules)
      .sort((a, b) => Number(a[0]) - Number(b[0]));

    if (entries.length === 0) {
      return message.reply(
        "📜 No rules have been added yet."
      );
    }

    let text = "📜 **Server Rules**\n\n";

    for (const [number, rule] of entries) {
      text += `**${number}.** ${rule}\n`;
    }

    return message.reply(text);
  }

  // ===============================
  // UNKNOWN COMMAND
  // ===============================

  return message.reply(
    `❌ Unknown command. Use **@Bot help** :cat~1:`
  );
});

// ===============================
// LOGIN
// ===============================

client.login(process.env.DISCORD_TOKEN);
