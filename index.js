const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");

const http = require("http");
const fs = require("fs");

// =========================
// BOT SETUP
// =========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =========================
// RENDER WEB SERVER
// =========================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is online!");
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// =========================
// DATA STORAGE
// =========================

const warningsFile = "./warnings.json";
const rulesFile = "./rules.json";

if (!fs.existsSync(warningsFile)) {
  fs.writeFileSync(warningsFile, "{}");
}

if (!fs.existsSync(rulesFile)) {
  fs.writeFileSync(rulesFile, "{}");
}

let warnings = JSON.parse(fs.readFileSync(warningsFile, "utf8"));
let rules = JSON.parse(fs.readFileSync(rulesFile, "utf8"));

function saveWarnings() {
  fs.writeFileSync(warningsFile, JSON.stringify(warnings, null, 2));
}

function saveRules() {
  fs.writeFileSync(rulesFile, JSON.stringify(rules, null, 2));
}

// =========================
// READY
// =========================

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// =========================
// HELPER FUNCTIONS
// =========================

function getUserFromMessage(message) {
  return message.mentions.users.first();
}

function getReason(args) {
  return args.join(" ").trim() || "No reason provided";
}

function parseDuration(time) {
  if (!time) return null;

  const match = time.match(/^(\d+)(s|m|h|d|w)$/i);

  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

function durationText(ms) {
  const seconds = Math.floor(ms / 1000);

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);

  return `${days}d`;
}

function hasPermission(message, permission) {
  return message.member?.permissions.has(permission);
}

function moderationEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

// =========================
// MESSAGE COMMAND SYSTEM
// =========================

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    const mention1 = `<@${client.user.id}>`;
    const mention2 = `<@!${client.user.id}>`;

    if (
      !message.content.startsWith(mention1) &&
      !message.content.startsWith(mention2)
    ) {
      return;
    }

    let commandText = message.content
      .replace(mention1, "")
      .replace(mention2, "")
      .trim();

    if (!commandText) {
      return message.reply("👋 Use `@Bot help` to see my commands.");
    }

    const args = commandText.split(/\s+/);
    const command = args.shift().toLowerCase();

    // =========================
    // HELP
    // =========================

    if (command === "help") {
      const embed = new EmbedBuilder()
        .setTitle("📖 Bot Commands")
        .setDescription(
          "**🛡️ Moderation**\n" +
          "`@Bot warn @user reason`\n" +
          "`@Bot warns @user`\n" +
          "`@Bot deletewarn @user number`\n" +
          "`@Bot clearwarns @user`\n" +
          "`@Bot warns leaderboard`\n" +
          "`@Bot purge 50`\n" +
          "`@Bot timeout @user 10m reason`\n" +
          "`@Bot untimeout @user`\n" +
          "`@Bot kick @user reason`\n" +
          "`@Bot ban @user reason`\n" +
          "`@Bot unban userID`\n\n" +

          "**📜 Rules**\n" +
          "`@Bot setrule number text`\n" +
          "`@Bot delrule number`\n" +
          "`@Bot rules`\n\n" +

          "**🔧 Utility**\n" +
          "`@Bot ping`\n" +
          "`@Bot help`"
        )
        .setFooter({ text: "Moderation system" })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // =========================
    // PING
    // =========================

    if (command === "ping") {
      return message.reply(`🏓 Pong! **${client.ws.ping}ms**`);
    }

    // =========================
    // WARN
    // =========================

    if (command === "warn") {
      if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("❌ You don't have permission to warn members.");
      }

      const user = getUserFromMessage(message);

      if (!user) {
        return message.reply("❌ Mention a user.\nExample: `@Bot warn @user spam`");
      }

      if (user.id === message.author.id) {
        return message.reply("❌ You can't warn yourself.");
      }

      const reason = getReason(args);

      if (!warnings[message.guild.id]) {
        warnings[message.guild.id] = {};
      }

      if (!warnings[message.guild.id][user.id]) {
        warnings[message.guild.id][user.id] = [];
      }

      warnings[message.guild.id][user.id].push({
        reason: reason,
        moderator: message.author.id,
        date: new Date().toISOString()
      });

      saveWarnings();

      const count = warnings[message.guild.id][user.id].length;

      return message.reply({
        embeds: [
          moderationEmbed(
            "⚠️ Member Warned",
            `**User:** ${user}\n**Reason:** ${reason}\n**Warnings:** ${count}\n**Moderator:** ${message.author}`
          )
        ]
      });
    }

    // =========================
    // WARNS
    // =========================

    if (command === "warns") {
      // Leaderboard
      if (args[0]?.toLowerCase() === "leaderboard") {
        const guildWarnings = warnings[message.guild.id] || {};

        const leaderboard = Object.entries(guildWarnings)
          .map(([userId, list]) => ({
            userId,
            count: list.length
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        if (leaderboard.length === 0) {
          return message.reply("📊 There are no warnings yet.");
        }

        let text = "";

        for (let i = 0; i < leaderboard.length; i++) {
          text += `**${i + 1}.** <@${leaderboard[i].userId}> — **${leaderboard[i].count}** warnings\n`;
        }

        return message.reply({
          embeds: [
            moderationEmbed("🏆 Warning Leaderboard", text)
          ]
        });
      }

      if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("❌ You don't have permission to view warnings.");
      }

      const user = getUserFromMessage(message);

      if (!user) {
        return message.reply("❌ Mention a user.");
      }

      const list =
        warnings[message.guild.id]?.[user.id] || [];

      if (list.length === 0) {
        return message.reply(`✅ ${user} has no warnings.`);
      }

      let text = "";

      list.forEach((warning, index) => {
        const date = new Date(warning.date).toLocaleDateString();

        text +=
          `**${index + 1}.** ${warning.reason}\n` +
          `Moderator: <@${warning.moderator}> • ${date}\n\n`;
      });

      return message.reply({
        embeds: [
          moderationEmbed(
            `⚠️ Warnings — ${user.username}`,
            text
          )
        ]
      });
    }

    // =========================
    // DELETE WARN
    // =========================

    if (command === "deletewarn") {
      if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("❌ You don't have permission.");
      }

      const user = getUserFromMessage(message);
      const number = parseInt(args.find(arg => /^\d+$/.test(arg)));

      if (!user || !number) {
        return message.reply(
          "❌ Usage: `@Bot deletewarn @user number`"
        );
      }

      const list = warnings[message.guild.id]?.[user.id];

      if (!list || list.length === 0) {
        return message.reply("❌ This user has no warnings.");
      }

      if (number < 1 || number > list.length) {
        return message.reply("❌ Invalid warning number.");
      }

      list.splice(number - 1, 1);

      saveWarnings();

      return message.reply(`✅ Warning **#${number}** deleted from ${user}.`);
    }

    // =========================
    // CLEAR WARNS
    // =========================

    if (command === "clearwarns") {
      if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("❌ You don't have permission.");
      }

      const user = getUserFromMessage(message);

      if (!user) {
        return message.reply("❌ Mention a user.");
      }

      if (warnings[message.guild.id]) {
        delete warnings[message.guild.id][user.id];
      }

      saveWarnings();

      return message.reply(`✅ All warnings for ${user} have been cleared.`);
    }

    // =========================
    // PURGE
    // =========================

    if (command === "purge") {
      if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages)) {
        return message.reply("❌ You don't have permission to purge messages.");
      }

      const amount = parseInt(args[0]);

      if (!amount || amount < 1 || amount > 100) {
        return message.reply("❌ Choose a number between **1 and 100**.");
      }

      const deleted = await message.channel.bulkDelete(amount, true);

      const response = await message.channel.send(
        `🧹 Deleted **${deleted.size}** messages.`
      );

      setTimeout(() => {
        response.delete().catch(() => {});
      }, 3000);

      return;
    }

    // =========================
    // TIMEOUT
    // =========================

    if (command === "timeout") {
      if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("❌ You don't have permission to timeout members.");
      }

      const user = getUserFromMessage(message);

      if (!user) {
        return message.reply("❌ Mention a user.");
      }

      const durationArg = args.find(arg =>
        /^\d+(s|m|h|d|w)$/i.test(arg)
      );

      const duration = parseDuration(durationArg);

      if (!durationArg || !duration) {
        return message.reply(
          "❌ Give a valid duration.\nExample: `10m`, `2h`, `1d`"
        );
      }

      const member = await message.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        return message.reply("❌ I couldn't find that member.");
      }

      const reasonArgs = args.filter(arg => arg !== durationArg);
      const reason = getReason(reasonArgs);

      await member.timeout(duration, reason);

      return message.reply({
        embeds: [
          moderationEmbed(
            "⏳ Member Timed Out",
            `**User:** ${user}\n**Duration:** ${durationText(duration)}\n**Reason:** ${reason}\n**Moderator:** ${message.author}`
          )
        ]
      });
    }

    // =========================
    // UNTIMEOUT
    // =========================

    if (command === "untimeout") {
      if (!hasPermission(message, PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("❌ You don't have permission.");
      }

      const user = getUserFromMessage(message);

      if (!user) {
        return message.reply("❌ Mention a user.");
      }

      const member = await message.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        return message.reply("❌ Member not found.");
      }

      await member.timeout(null, "Timeout removed");

      return message.reply(`✅ Timeout removed from ${user}.`);
    }

    // =========================
    // KICK
    // =========================

    if (command === "kick") {
      if (!hasPermission(message, PermissionsBitField.Flags.KickMembers)) {
        return message.reply("❌ You don't have permission to kick members.");
      }

      const user = getUserFromMessage(message);

      if (!user) {
        return message.reply("❌ Mention a user.");
      }

      const member = await message.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        return message.reply("❌ Member not found.");
      }

      if (!member.kickable) {
        return message.reply("❌ I can't kick this member.");
      }

      const reason = getReason(args);

      await member.kick(reason);

      return message.reply({
        embeds: [
          moderationEmbed(
            "👢 Member Kicked",
            `**User:** ${user}\n**Reason:** ${reason}\n**Moderator:** ${message.author}`
          )
        ]
      });
    }

    // =========================
    // BAN
    // =========================

    if (command === "ban") {
      if (!hasPermission(message, PermissionsBitField.Flags.BanMembers)) {
        return message.reply("❌ You don't have permission to ban members.");
      }

      const user = getUserFromMessage(message);

      if (!user) {
        return message.reply("❌ Mention a user.");
      }

      const member = await message.guild.members.fetch(user.id).catch(() => null);

      if (member && !member.bannable) {
        return message.reply("❌ I can't ban this member.");
      }

      const reason = getReason(args);

      await message.guild.members.ban(user.id, {
        reason: reason
      });

      return message.reply({
        embeds: [
          moderationEmbed(
            "🔨 Member Banned",
            `**User:** ${user}\n**Reason:** ${reason}\n**Moderator:** ${message.author}`
          )
        ]
      });
    }

    // =========================
    // UNBAN
    // =========================

    if (command === "unban") {
      if (!hasPermission(message, PermissionsBitField.Flags.BanMembers)) {
        return message.reply("❌ You don't have permission to unban members.");
      }

      const userId = args[0];

      if (!userId) {
        return message.reply(
          "❌ Usage: `@Bot unban userID`"
        );
      }

      const reason = getReason(args.slice(1));

      await message.guild.members.unban(userId, reason);

      return message.reply(`✅ User **${userId}** has been unbanned.`);
    }

    // =========================
    // SET RULE
    // =========================

    if (command === "setrule") {
      if (!hasPermission(message, PermissionsBitField.Flags.ManageGuild)) {
        return message.reply("❌ You need Manage Server permission.");
      }

      const number = parseInt(args.shift());

      if (!number || number < 1) {
        return message.reply("❌ Give a valid rule number.");
      }

      const text = args.join(" ");

      if (!text) {
        return message.reply(
          "❌ Example: `@Bot setrule 1 Be respectful`"
        );
      }

      if (!rules[message.guild.id]) {
        rules[message.guild.id] = {};
      }

      rules[message.guild.id][number] = text;

      saveRules();

      return message.reply(`✅ Rule **${number}** has been set.`);
    }

    // =========================
    // DELETE RULE
    // =========================

    if (command === "delrule") {
      if (!hasPermission(message, PermissionsBitField.Flags.ManageGuild)) {
        return message.reply("❌ You need Manage Server permission.");
      }

      const number = parseInt(args[0]);

      if (!number) {
        return message.reply("❌ Give a rule number.");
      }

      if (!rules[message.guild.id]?.[number]) {
        return message.reply("❌ That rule doesn't exist.");
      }

      delete rules[message.guild.id][number];

      saveRules();

      return message.reply(`✅ Rule **${number}** deleted.`);
    }

    // =========================
    // RULES
    // =========================

    if (command === "rules") {
      const guildRules = rules[message.guild.id] || {};

      const numbers = Object.keys(guildRules)
        .sort((a, b) => Number(a) - Number(b));

      if (numbers.length === 0) {
        return message.reply("📜 No rules have been configured yet.");
      }

      let text = "";

      for (const number of numbers) {
        text += `**${number}.** ${guildRules[number]}\n`;
      }

      return message.reply({
        embeds: [
          moderationEmbed("📜 Server Rules", text)
        ]
      });
    }

  } catch (error) {
    console.error(error);

    if (!message.replied && !message.deferred) {
      message.reply("❌ Something went wrong while running that command.")
        .catch(() => {});
    }
  }
});

// =========================
// LOGIN
// =========================

client.login(process.env.DISCORD_TOKEN);
