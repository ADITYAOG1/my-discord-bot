const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField
} = require("discord.js");

// ===============================
// CONFIG
// ===============================

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN environment variable is missing!");
  process.exit(1);
}

// ===============================
// CLIENT
// ===============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ===============================
// WARN DATABASE
// ===============================

const warnings = new Map();

// Get warnings for a user
function getWarnings(guildId, userId) {
  const key = `${guildId}-${userId}`;

  if (!warnings.has(key)) {
    warnings.set(key, 0);
  }

  return warnings.get(key);
}

// Set warnings
function setWarnings(guildId, userId, amount) {
  const key = `${guildId}-${userId}`;
  warnings.set(key, amount);
}

// ===============================
// READY
// ===============================

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log("🤖 Caffeine moderation bot is online!");
});

// ===============================
// MESSAGE HANDLER
// ===============================

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Prefix = bot mention
    const mentionPrefix = `<@${client.user.id}>`;
    const mentionPrefixNick = `<@!${client.user.id}>`;

    let prefix = null;

    if (message.content.startsWith(mentionPrefix)) {
      prefix = mentionPrefix;
    } else if (message.content.startsWith(mentionPrefixNick)) {
      prefix = mentionPrefixNick;
    }

    if (!prefix) return;

    // Remove prefix
    const content = message.content.slice(prefix.length).trim();

    if (!content) {
      return message.reply(
        `👋 Hi! Use \`${prefix} help\` to see my commands.`
      );
    }

    const args = content.split(/\s+/);
    const command = args.shift().toLowerCase();

    // ===============================
    // HELP
    // ===============================

    if (command === "help") {
      return message.reply({
        embeds: [
          {
            title: "☕ Caffeine Moderation",
            description:
              `**Moderation Commands**\n\n` +
              `\`${prefix} warn @user [reason]\`\n` +
              `\`${prefix} warnings @user\`\n` +
              `\`${prefix} clearwarns @user\`\n` +
              `\`${prefix} kick @user [reason]\`\n` +
              `\`${prefix} ban @user [reason]\`\n` +
              `\`${prefix} timeout @user <minutes> [reason]\`\n\n` +
              `**Automatic punishment**\n` +
              `3 warns → 10 minute timeout\n` +
              `5 warns → 30 minute timeout\n` +
              `8 warns → 24 hour timeout\n` +
              `10 warns → 1 week ban\n` +
              `12 warns → 3 week ban\n` +
              `15 warns → permanent ban`,
            color: 0x5865f2
          }
        ]
      });
    }

    // ===============================
    // CHECK MODERATOR PERMISSION
    // ===============================

    const isModerator = message.member.permissions.has(
      PermissionsBitField.Flags.ModerateMembers
    );

    const isAdmin = message.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    );

    // ===============================
    // WARN
    // ===============================

    if (command === "warn") {
      if (!isModerator && !isAdmin) {
        return message.reply("❌ You need **Moderate Members** permission.");
      }

      const member =
        message.mentions.members.first() ||
        message.guild.members.cache.get(args[0]);

      if (!member) {
        return message.reply(
          `❌ Usage: \`${prefix} warn @user [reason]\``
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

      let warnCount = getWarnings(message.guild.id, member.id);

      warnCount++;
      setWarnings(message.guild.id, member.id, warnCount);

      await message.reply(
        `⚠️ **${member.user.tag}** has been warned.\n` +
        `**Reason:** ${reason}\n` +
        `**Warnings:** ${warnCount}/15`
      );

      // ===============================
      // AUTOMATIC PUNISHMENTS
      // ===============================

      if (warnCount === 3) {
        await member.timeout(
          10 * 60 * 1000,
          "Automatic punishment: 3 warnings"
        );

        await message.channel.send(
          `🔇 **${member.user.tag}** has been timed out for **10 minutes** because they reached **3 warnings**.`
        );
      }

      else if (warnCount === 5) {
        await member.timeout(
          30 * 60 * 1000,
          "Automatic punishment: 5 warnings"
        );

        await message.channel.send(
          `🔇 **${member.user.tag}** has been timed out for **30 minutes** because they reached **5 warnings**.`
        );
      }

      else if (warnCount === 8) {
        await member.timeout(
          24 * 60 * 60 * 1000,
          "Automatic punishment: 8 warnings"
        );

        await message.channel.send(
          `🔇 **${member.user.tag}** has been timed out for **24 hours** because they reached **8 warnings**.`
        );
      }

      else if (warnCount === 10) {
        await member.ban({
          reason: "Automatic punishment: 10 warnings",
          deleteMessageSeconds: 0
        });

        await message.channel.send(
          `🔨 **${member.user.tag}** has been banned for **1 week** because they reached **10 warnings**.`
        );

        // Schedule unban after 1 week
        setTimeout(async () => {
          try {
            await message.guild.members.unban(
              member.id,
              "1 week automatic ban completed"
            );

            console.log(
              `✅ Automatically unbanned ${member.user.tag} after 1 week.`
            );
          } catch (error) {
            console.log(
              `⚠️ Could not automatically unban ${member.user.tag}.`
            );
          }
        }, 7 * 24 * 60 * 60 * 1000);
      }

      else if (warnCount === 12) {
        await member.ban({
          reason: "Automatic punishment: 12 warnings",
          deleteMessageSeconds: 0
        });

        await message.channel.send(
          `🔨 **${member.user.tag}** has been banned for **3 weeks** because they reached **12 warnings**.`
        );

        // Schedule unban after 3 weeks
        setTimeout(async () => {
          try {
            await message.guild.members.unban(
              member.id,
              "3 week automatic ban completed"
            );

            console.log(
              `✅ Automatically unbanned ${member.user.tag} after 3 weeks.`
            );
          } catch (error) {
            console.log(
              `⚠️ Could not automatically unban ${member.user.tag}.`
            );
          }
        }, 21 * 24 * 60 * 60 * 1000);
      }

      else if (warnCount >= 15) {
        await member.ban({
          reason: "Automatic punishment: 15 warnings",
          deleteMessageSeconds: 0
        });

        await message.channel.send(
          `🔨 **${member.user.tag}** has been permanently banned because they reached **15 warnings**.`
        );
      }

      return;
    }

    // ===============================
    // WARNINGS
    // ===============================

    if (command === "warnings" || command === "warns") {
      if (!isModerator && !isAdmin) {
        return message.reply("❌ You need **Moderate Members** permission.");
      }

      const member =
        message.mentions.members.first() ||
        message.guild.members.cache.get(args[0]);

      if (!member) {
        return message.reply(
          `❌ Usage: \`${prefix} warnings @user\``
        );
      }

      const count = getWarnings(message.guild.id, member.id);

      return message.reply(
        `⚠️ **${member.user.tag}** has **${count} warning(s)**.`
      );
    }

    // ===============================
    // CLEAR WARNINGS
    // ===============================

    if (command === "clearwarns" || command === "clearwarnings") {
      if (!isModerator && !isAdmin) {
        return message.reply("❌ You need **Moderate Members** permission.");
      }

      const member =
        message.mentions.members.first() ||
        message.guild.members.cache.get(args[0]);

      if (!member) {
        return message.reply(
          `❌ Usage: \`${prefix} clearwarns @user\``
        );
      }

      setWarnings(message.guild.id, member.id, 0);

      return message.reply(
        `✅ Cleared all warnings for **${member.user.tag}**.`
      );
    }

    // ===============================
    // KICK
    // ===============================

    if (command === "kick") {
      if (!isAdmin) {
        return message.reply("❌ You need **Administrator** permission.");
      }

      const member =
        message.mentions.members.first() ||
        message.guild.members.cache.get(args[0]);

      if (!member) {
        return message.reply(
          `❌ Usage: \`${prefix} kick @user [reason]\``
        );
      }

      const reason =
        args.slice(1).join(" ") || "No reason provided";

      await member.kick(reason);

      return message.reply(
        `👢 **${member.user.tag}** has been kicked.\n**Reason:** ${reason}`
      );
    }

    // ===============================
    // BAN
    // ===============================

    if (command === "ban") {
      if (!isAdmin) {
        return message.reply("❌ You need **Administrator** permission.");
      }

      const member =
        message.mentions.members.first() ||
        message.guild.members.cache.get(args[0]);

      if (!member) {
        return message.reply(
          `❌ Usage: \`${prefix} ban @user [reason]\``
        );
      }

      const reason =
        args.slice(1).join(" ") || "No reason provided";

      await member.ban({
        reason: reason,
        deleteMessageSeconds: 0
      });

      return message.reply(
        `🔨 **${member.user.tag}** has been banned.\n**Reason:** ${reason}`
      );
    }

    // ===============================
    // TIMEOUT
    // ===============================

    if (command === "timeout" || command === "mute") {
      if (!isModerator && !isAdmin) {
        return message.reply("❌ You need **Moderate Members** permission.");
      }

      const member =
        message.mentions.members.first() ||
        message.guild.members.cache.get(args[0]);

      if (!member) {
        return message.reply(
          `❌ Usage: \`${prefix} timeout @user <minutes> [reason]\``
        );
      }

      const minutesIndex = message.mentions.members.first() ? 0 : 1;
      const minutes = Number(args[minutesIndex]);

      if (!Number.isFinite(minutes) || minutes <= 0) {
        return message.reply("❌ Enter a valid number of minutes.");
      }

      const reason =
        args.slice(minutesIndex + 1).join(" ") ||
        "No reason provided";

      const duration = Math.min(
        minutes * 60 * 1000,
        28 * 24 * 60 * 60 * 1000
      );

      await member.timeout(duration, reason);

      return message.reply(
        `🔇 **${member.user.tag}** has been timed out for **${minutes} minute(s)**.\n` +
        `**Reason:** ${reason}`
      );
    }

  } catch (error) {
    console.error("❌ Command error:", error);

    if (!message.replied && !message.deferred) {
      await message.reply(
        "❌ Something went wrong while executing that command."
      );
    }
  }
});

// ===============================
// LOGIN
// ===============================

client.login(TOKEN);
