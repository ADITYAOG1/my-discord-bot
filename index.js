const {
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require("discord.js");

const fs = require("fs");

// =========================
// CONFIG
// =========================

const TOKEN = process.env.TOKEN;

// Warning database
const WARN_FILE = "./warnings.json";

if (!fs.existsSync(WARN_FILE)) {
  fs.writeFileSync(WARN_FILE, "{}");
}

let warnings = JSON.parse(fs.readFileSync(WARN_FILE, "utf8"));

function saveWarnings() {
  fs.writeFileSync(WARN_FILE, JSON.stringify(warnings, null, 2));
}

// =========================
// CLIENT
// =========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =========================
// READY
// =========================

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Moderation system is online.");
});

// =========================
// MESSAGE HANDLER
// =========================

client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    const botMention = `<@${client.user.id}>`;
    const botMentionNick = `<@!${client.user.id}>`;

    // Must start with @Bot
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

    const args = content.split(/\s+/);
    const command = args.shift()?.toLowerCase();

    // =========================
    // HELP
    // =========================

    if (command === "help") {
      return message.reply(
        `**Moderation Commands**

\`${botMention} warn @user reason\`
\`${botMention} warnings @user\`
\`${botMention} clearwarns @user\`
\`${botMention} kick @user reason\`
\`${botMention} ban @user reason\`
\`${botMention} unban userID\`
\`${botMention} timeout @user duration reason\`
\`${botMention} clear number\`

**Automatic punishment**
3 warns → 10m timeout
5 warns → 30m timeout
8 warns → 24h timeout
10 warns → 1 week ban
12 warns → 3 week ban
15 warns → permanent ban`
      );
    }

    // =========================
    // WARN
    // =========================

    if (command === "warn") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("❌ You need **Moderate Members** permission.");
      }

      const member =
        message.mentions.members.first();

      if (!member) {
        return message.reply(
          `❌ Usage: \`${botMention} warn @user reason\``
        );
      }

      if (member.id === message.author.id) {
        return message.reply("❌ You cannot warn yourself.");
      }

      if (member.user.bot) {
        return message.reply("❌ You cannot warn a bot.");
      }

      const reason =
        args.slice(1).join(" ") || "No reason provided";

      if (!warnings[message.guild.id]) {
        warnings[message.guild.id] = {};
      }

      if (!warnings[message.guild.id][member.id]) {
        warnings[message.guild.id][member.id] = [];
      }

      warnings[message.guild.id][member.id].push({
        moderator: message.author.id,
        reason: reason,
        timestamp: Date.now()
      });

      saveWarnings();

      const warnCount =
        warnings[message.guild.id][member.id].length;

      await message.reply(
        `⚠️ **${member.user.tag}** has been warned.\n` +
        `**Warnings:** ${warnCount}\n` +
        `**Reason:** ${reason}`
      );

      // =========================
      // AUTO PUNISHMENT
      // =========================

      if (warnCount === 3) {
        if (member.moderatable) {
          await member.timeout(
            10 * 60 * 1000,
            "Automatic punishment: 3 warnings"
          );

          await message.channel.send(
            `🔇 ${member} has been **timed out for 10 minutes** after reaching **3 warnings**.`
          );
        }
      }

      else if (warnCount === 5) {
        if (member.moderatable) {
          await member.timeout(
            30 * 60 * 1000,
            "Automatic punishment: 5 warnings"
          );

          await message.channel.send(
            `🔇 ${member} has been **timed out for 30 minutes** after reaching **5 warnings**.`
          );
        }
      }

      else if (warnCount === 8) {
        if (member.moderatable) {
          await member.timeout(
            24 * 60 * 60 * 1000,
            "Automatic punishment: 8 warnings"
          );

          await message.channel.send(
            `🔇 ${member} has been **timed out for 24 hours** after reaching **8 warnings**.`
          );
        }
      }

      else if (warnCount === 10) {
        if (member.bannable) {
          await member.ban({
            reason: "Automatic punishment: 10 warnings"
          });

          await message.channel.send(
            `🔨 ${member.user.tag} has been **banned for 1 week** after reaching **10 warnings**.`
          );

          // Schedule unban after 1 week
          setTimeout(async () => {
            try {
              await message.guild.members.unban(
                member.id,
                "Automatic 1-week ban expired"
              );

              message.channel.send(
                `✅ **${member.user.tag}** has been automatically unbanned after the 1-week ban.`
              );
            } catch (err) {
              console.log("Automatic unban failed:", err.message);
            }
          }, 7 * 24 * 60 * 60 * 1000);
        }
      }

      else if (warnCount === 12) {
        if (member.bannable) {
          await member.ban({
            reason: "Automatic punishment: 12 warnings"
          });

          await message.channel.send(
            `🔨 ${member.user.tag} has been **banned for 3 weeks** after reaching **12 warnings**.`
          );

          // Schedule unban after 3 weeks
          setTimeout(async () => {
            try {
              await message.guild.members.unban(
                member.id,
                "Automatic 3-week ban expired"
              );

              message.channel.send(
                `✅ **${member.user.tag}** has been automatically unbanned after the 3-week ban.`
              );
            } catch (err) {
              console.log("Automatic unban failed:", err.message);
            }
          }, 21 * 24 * 60 * 60 * 1000);
        }
      }

      else if (warnCount === 15) {
        if (member.bannable) {
          await member.ban({
            reason: "Automatic punishment: 15 warnings - permanent ban"
          });

          await message.channel.send(
            `🔨 ${member.user.tag} has been **permanently banned** after reaching **15 warnings**.`
          );
        }
      }

      return;
    }

    // =========================
    // CHECK WARNINGS
    // =========================

    if (command === "warnings" || command === "warns") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("❌ You need **Moderate Members** permission.");
      }

      const member =
        message.mentions.members.first() || message.member;

      const guildWarnings =
        warnings[message.guild.id]?.[member.id] || [];

      if (guildWarnings.length === 0) {
        return message.reply(
          `✅ **${member.user.tag}** has no warnings.`
        );
      }

      let text = guildWarnings
        .map(
          (w, i) =>
            `**${i + 1}.** ${w.reason}`
        )
        .join("\n");

      return message.reply(
        `⚠️ **${member.user.tag}** has **${guildWarnings.length} warnings**.\n\n${text}`
      );
    }

    // =========================
    // CLEAR WARNINGS
    // =========================

    if (command === "clearwarns" || command === "resetwarns") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("❌ You need **Moderate Members** permission.");
      }

      const member =
        message.mentions.members.first();

      if (!member) {
        return message.reply(
          `❌ Usage: \`${botMention} clearwarns @user\``
        );
      }

      if (!warnings[message.guild.id]) {
        warnings[message.guild.id] = {};
      }

      warnings[message.guild.id][member.id] = [];

      saveWarnings();

      return message.reply(
        `✅ Cleared all warnings for **${member.user.tag}**.`
      );
    }

    // =========================
    // KICK
    // =========================

    if (command === "kick") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return message.reply("❌ You need **Kick Members** permission.");
      }

      const member =
        message.mentions.members.first();

      if (!member) {
        return message.reply(
          `❌ Usage: \`${botMention} kick @user reason\``
        );
      }

      const reason =
        args.slice(1).join(" ") || "No reason provided";

      if (!member.kickable) {
        return message.reply(
          "❌ I cannot kick this member. Check my role position and permissions."
        );
      }

      await member.kick(reason);

      return message.reply(
        `👢 **${member.user.tag}** was kicked.\n**Reason:** ${reason}`
      );
    }

    // =========================
    // BAN
    // =========================

    if (command === "ban") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return message.reply("❌ You need **Ban Members** permission.");
      }

      const member =
        message.mentions.members.first();

      if (!member) {
        return message.reply(
          `❌ Usage: \`${botMention} ban @user reason\``
        );
      }

      const reason =
        args.slice(1).join(" ") || "No reason provided";

      if (!member.bannable) {
        return message.reply(
          "❌ I cannot ban this member. Check my role position and permissions."
        );
      }

      await member.ban({ reason });

      return message.reply(
        `🔨 **${member.user.tag}** was banned.\n**Reason:** ${reason}`
      );
    }

    // =========================
    // UNBAN
    // =========================

    if (command === "unban") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return message.reply("❌ You need **Ban Members** permission.");
      }

      const userId = args[0];

      if (!userId) {
        return message.reply(
          `❌ Usage: \`${botMention} unban userID\``
        );
      }

      try {
        await message.guild.members.unban(
          userId,
          "Manual unban"
        );

        return message.reply(
          `✅ User **${userId}** has been unbanned.`
        );
      } catch {
        return message.reply(
          "❌ Could not unban that user. Check the ID."
        );
      }
    }

    // =========================
    // TIMEOUT
    // =========================

    if (command === "timeout") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("❌ You need **Moderate Members** permission.");
      }

      const member =
        message.mentions.members.first();

      if (!member) {
        return message.reply(
          `❌ Usage: \`${botMention} timeout @user duration reason\``
        );
      }

      const duration = args[1];

      if (!duration) {
        return message.reply(
          "❌ Example: `10m`, `30m`, `2h`, `1d`"
        );
      }

      const match = duration.match(/^(\d+)(s|m|h|d)$/i);

      if (!match) {
        return message.reply(
          "❌ Invalid duration. Use `s`, `m`, `h`, or `d`."
        );
      }

      const amount = Number(match[1]);
      const unit = match[2].toLowerCase();

      const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
      };

      const ms = amount * multipliers[unit];

      if (ms > 28 * 24 * 60 * 60 * 1000) {
        return message.reply(
          "❌ Discord's timeout limit is 28 days."
        );
      }

      if (!member.moderatable) {
        return message.reply(
          "❌ I cannot timeout this member."
        );
      }

      const reason =
        args.slice(2).join(" ") || "No reason provided";

      await member.timeout(ms, reason);

      return message.reply(
        `🔇 **${member.user.tag}** was timed out for **${duration}**.\n**Reason:** ${reason}`
      );
    }

    // =========================
    // CLEAR MESSAGES
    // =========================

    if (command === "clear" || command === "purge") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply("❌ You need **Manage Messages** permission.");
      }

      const amount = Number(args[0]);

      if (!amount || amount < 1 || amount > 100) {
        return message.reply(
          `❌ Usage: \`${botMention} clear 1-100\``
        );
      }

      await message.channel.bulkDelete(amount, true);

      const msg = await message.channel.send(
        `🧹 Deleted **${amount} messages**.`
      );

      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 3000);

      return;
    }

  } catch (error) {
    console.error("COMMAND ERROR:", error);

    try {
      await message.reply(
        "❌ Something went wrong while running that command."
      );
    } catch {}
  }
});

// =========================
// LOGIN
// =========================

if (!TOKEN) {
  console.error("❌ TOKEN environment variable is missing!");
  process.exit(1);
}

client.login(TOKEN);
