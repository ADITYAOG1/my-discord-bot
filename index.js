const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActivityType
} = require("discord.js");

const fs = require("fs");
const http = require("http");

// ===============================
// BOT SETUP
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
// RENDER WEB SERVER
// ===============================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is online!");
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ===============================
// DATA FILES
// ===============================

const WARN_FILE = "./warnings.json";
const RULE_FILE = "./rules.json";

if (!fs.existsSync(WARN_FILE)) {
  fs.writeFileSync(WARN_FILE, "{}");
}

if (!fs.existsSync(RULE_FILE)) {
  fs.writeFileSync(RULE_FILE, "{}");
}

function getWarnings() {
  try {
    return JSON.parse(fs.readFileSync(WARN_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveWarnings(data) {
  fs.writeFileSync(WARN_FILE, JSON.stringify(data, null, 2));
}

function getRules() {
  try {
    return JSON.parse(fs.readFileSync(RULE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveRules(data) {
  fs.writeFileSync(RULE_FILE, JSON.stringify(data, null, 2));
}

// ===============================
// READY
// ===============================

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Do Not Disturb
  client.user.setPresence({
    status: "dnd",
    activities: [
      {
        name: "my server 👀",
        type: ActivityType.Watching
      }
    ]
  });
});

// ===============================
// MESSAGE COMMANDS
// ===============================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // =========================================
  // PREFIX
  // =========================================

  const prefix = `<@${client.user.id}>`;

  if (!message.content.startsWith(prefix)) return;

  let content = message.content.slice(prefix.length).trim();

  if (!content) {
    return message.reply("Heyyyyy!!!");
  }

  const args = content.split(/\s+/);
  const command = args.shift().toLowerCase();

  // =========================================
  // HELP
  // =========================================

  if (command === "help") {
    return message.reply(
      `📚 **MYBOY COMMANDS**

🛡️ **MODERATION**
\`ban @user reason\`
\`unban userID\`
\`kick @user reason\`
\`timeout @user 10m reason\`
\`untimeout @user\`
\`warn @user reason\`
\`warns @user\`
\`deletewarn @user number\`
\`clearwarns @user\`
\`purge 10\`
\`lock\`
\`unlock\`
\`slowmode 10\`
\`nick @user nickname\`
\`roleadd @user @role\`
\`roleremove @user @role\`

📜 **RULES**
\`rules\`
\`setrule number text\`
\`delrule number\`

🔧 **GENERAL**
\`ping\`
\`serverinfo\`
\`userinfo @user\`
\`introduce\`

✅ **VERIFY :Verify:**

💬 Mention me with no command:
\`@myboy\`

I'll say:
**Heyyyyy!!!**`
    );
  }

  // =========================================
  // PING
  // =========================================

  if (command === "ping") {
    return message.reply(`🏓 Pong! **${client.ws.ping}ms**`);
  }

  // =========================================
  // INTRODUCE
  // =========================================

  if (command === "introduce") {
    return message.reply(
      `👋 Hey! I'm **${client.user.username}**!\n\n` +
      `🛡️ Moderation\n` +
      `📜 Rules\n` +
      `⚙️ Server management\n` +
      `💬 Fun commands\n\n` +
      `Mention me anytime for a surprise 😗`
    );
  }

  // =========================================
  // SERVER INFO
  // =========================================

  if (command === "serverinfo") {
    return message.reply(
      `🏠 **SERVER INFO**\n\n` +
      `Name: **${message.guild.name}**\n` +
      `Members: **${message.guild.memberCount}**\n` +
      `Owner: <@${message.guild.ownerId}>\n` +
      `Channels: **${message.guild.channels.cache.size}**`
    );
  }

  // =========================================
  // USER INFO
  // =========================================

  if (command === "userinfo") {
    const user = message.mentions.users.first() || message.author;

    return message.reply(
      `👤 **USER INFO**\n\n` +
      `User: ${user}\n` +
      `Username: **${user.tag}**\n` +
      `ID: \`${user.id}\`\n` +
      `Created: <t:${Math.floor(user.createdTimestamp / 1000)}:R>`
    );
  }

  // =========================================
  // WARN
  // =========================================

  if (command === "warn") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply("❌ You don't have permission to warn members.");
    }

    const user = message.mentions.members.first();

    if (!user) {
      return message.reply("❌ Usage: `@myboy warn @user reason`");
    }

    if (user.id === message.author.id) {
      return message.reply("❌ You can't warn yourself.");
    }

    const reason = args
      .filter((arg) => !/^<@!?\d+>$/.test(arg))
      .join(" ")
      .trim() || "No reason provided";

    const warnings = getWarnings();

    if (!warnings[message.guild.id]) {
      warnings[message.guild.id] = {};
    }

    if (!warnings[message.guild.id][user.id]) {
      warnings[message.guild.id][user.id] = [];
    }

    warnings[message.guild.id][user.id].push({
      reason,
      moderator: message.author.id,
      date: Date.now()
    });

    const count = warnings[message.guild.id][user.id].length;

    saveWarnings(warnings);

    return message.reply(
      `📣 ${user} **HAS BEEN WARNED BY** ${message.author}\n` +
      `${reason} **[#${count}]**`
    );
  }

  // =========================================
  // WARNS
  // =========================================

  if (command === "warns") {
    const user = message.mentions.users.first();

    if (!user) {
      return message.reply("❌ Usage: `@myboy warns @user`");
    }

    const warnings = getWarnings();
    const list =
      warnings[message.guild.id]?.[user.id] || [];

    if (!list.length) {
      return message.reply(`✅ ${user} has no warnings.`);
    }

    let text = `⚠️ **WARNINGS FOR ${user}**\n\n`;

    list.forEach((w, i) => {
      text += `**#${i + 1}** — ${w.reason}\n`;
      text += `Moderator: <@${w.moderator}>\n\n`;
    });

    return message.reply(text.slice(0, 1900));
  }

  // =========================================
  // DELETE WARN
  // =========================================

  if (command === "deletewarn") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const user = message.mentions.users.first();
    const number = parseInt(args.find((x) => /^\d+$/.test(x)));

    if (!user || !number) {
      return message.reply(
        "❌ Usage: `@myboy deletewarn @user 1`"
      );
    }

    const warnings = getWarnings();
    const list =
      warnings[message.guild.id]?.[user.id] || [];

    if (!list[number - 1]) {
      return message.reply("❌ That warning doesn't exist.");
    }

    list.splice(number - 1, 1);
    saveWarnings(warnings);

    return message.reply(
      `✅ Deleted warning **#${number}** from ${user}.`
    );
  }

  // =========================================
  // CLEAR WARNS
  // =========================================

  if (command === "clearwarns") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const user = message.mentions.users.first();

    if (!user) {
      return message.reply(
        "❌ Usage: `@myboy clearwarns @user`"
      );
    }

    const warnings = getWarnings();

    if (warnings[message.guild.id]) {
      warnings[message.guild.id][user.id] = [];
    }

    saveWarnings(warnings);

    return message.reply(
      `✅ Cleared all warnings for ${user}.`
    );
  }

  // =========================================
  // PURGE
  // =========================================

  if (command === "purge" || command === "clear") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageMessages
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const amount = parseInt(args[0]);

    if (!amount || amount < 1 || amount > 100) {
      return message.reply(
        "❌ Usage: `@myboy purge 1-100`"
      );
    }

    try {
      const deleted = await message.channel.bulkDelete(
        amount,
        true
      );

      const msg = await message.channel.send(
        `🧹 Deleted **${deleted.size}** messages.`
      );

      setTimeout(() => msg.delete().catch(() => {}), 3000);
    } catch {
      return message.reply(
        "❌ I couldn't delete those messages."
      );
    }

    return;
  }

  // =========================================
  // TIMEOUT
  // =========================================

  if (command === "timeout") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply(
        "❌ Usage: `@myboy timeout @user 10m reason`"
      );
    }

    const durationArg = args.find((x) =>
      /^\d+(s|m|h|d)$/.test(x.toLowerCase())
    );

    if (!durationArg) {
      return message.reply(
        "❌ Give a duration like `10m`, `2h`, or `1d`."
      );
    }

    const match = durationArg.toLowerCase().match(
      /^(\d+)(s|m|h|d)$/
    );

    const amount = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    const duration = amount * multipliers[unit];

    if (duration > 28 * 24 * 60 * 60 * 1000) {
      return message.reply(
        "❌ Discord's maximum timeout is 28 days."
      );
    }

    const reason =
      args
        .filter(
          (x) =>
            x !== durationArg &&
            !/^<@!?\d+>$/.test(x)
        )
        .join(" ")
        .trim() || "No reason provided";

    try {
      await member.timeout(duration, reason);

      return message.reply(
        `⏱️ ${member} has been timed out by ${message.author}\n` +
        `Duration: **${durationArg}**\n` +
        `Reason: **${reason}**`
      );
    } catch {
      return message.reply(
        "❌ I couldn't timeout that member. Check my role position and permissions."
      );
    }
  }

  // =========================================
  // UNTIMEOUT
  // =========================================

  if (command === "untimeout" || command === "unmute") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply(
        "❌ Usage: `@myboy untimeout @user`"
      );
    }

    try {
      await member.timeout(null);

      return message.reply(
        `✅ ${member} is no longer timed out.`
      );
    } catch {
      return message.reply(
        "❌ I couldn't remove the timeout."
      );
    }
  }

  // =========================================
  // KICK
  // =========================================

  if (command === "kick") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.KickMembers
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply(
        "❌ Usage: `@myboy kick @user reason`"
      );
    }

    const reason =
      args
        .filter((x) => !/^<@!?\d+>$/.test(x))
        .join(" ")
        .trim() || "No reason provided";

    try {
      await member.kick(reason);

      return message.reply(
        `👢 **${member.user.tag}** was kicked.\nReason: **${reason}**`
      );
    } catch {
      return message.reply(
        "❌ I couldn't kick that member."
      );
    }
  }

  // =========================================
  // BAN
  // =========================================

  if (command === "ban") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.BanMembers
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply(
        "❌ Usage: `@myboy ban @user reason`"
      );
    }

    const reason =
      args
        .filter((x) => !/^<@!?\d+>$/.test(x))
        .join(" ")
        .trim() || "No reason provided";

    try {
      await member.ban({ reason });

      return message.reply(
        `🔨 **${member.user.tag}** was banned.\nReason: **${reason}**`
      );
    } catch {
      return message.reply(
        "❌ I couldn't ban that member."
      );
    }
  }

  // =========================================
  // UNBAN
  // =========================================

  if (command === "unban") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.BanMembers
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const userId = args[0];

    if (!userId || !/^\d+$/.test(userId)) {
      return message.reply(
        "❌ Usage: `@myboy unban USER_ID`"
      );
    }

    try {
      await message.guild.members.unban(userId);

      return message.reply(
        `✅ <@${userId}> has been unbanned.`
      );
    } catch {
      return message.reply(
        "❌ User isn't banned or I couldn't unban them."
      );
    }
  }

  // =========================================
  // LOCK
  // =========================================

  if (command === "lock") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageChannels
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    try {
      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: false
        }
      );

      return message.reply("🔒 Channel locked.");
    } catch {
      return message.reply(
        "❌ I couldn't lock this channel."
      );
    }
  }

  // =========================================
  // UNLOCK
  // =========================================

  if (command === "unlock") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageChannels
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    try {
      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: null
        }
      );

      return message.reply("🔓 Channel unlocked.");
    } catch {
      return message.reply(
        "❌ I couldn't unlock this channel."
      );
    }
  }

  // =========================================
  // SLOWMODE
  // =========================================

  if (command === "slowmode") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageChannels
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const seconds = parseInt(args[0]);

    if (
      isNaN(seconds) ||
      seconds < 0 ||
      seconds > 21600
    ) {
      return message.reply(
        "❌ Use a number from 0 to 21600 seconds."
      );
    }

    try {
      await message.channel.setRateLimitPerUser(seconds);

      return message.reply(
        `🐌 Slowmode set to **${seconds} seconds**.`
      );
    } catch {
      return message.reply(
        "❌ I couldn't change slowmode."
      );
    }
  }

  // =========================================
  // NICK
  // =========================================

  if (command === "nick") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageNicknames
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply(
        "❌ Usage: `@myboy nick @user NewName`"
      );
    }

    const newNick = args
      .filter((x) => !/^<@!?\d+>$/.test(x))
      .join(" ")
      .trim();

    if (!newNick) {
      return message.reply("❌ Give a nickname.");
    }

    try {
      await member.setNickname(newNick);

      return message.reply(
        `✅ Changed ${member}'s nickname to **${newNick}**.`
      );
    } catch {
      return message.reply(
        "❌ I couldn't change that nickname."
      );
    }
  }

  // =========================================
  // ADD ROLE
  // =========================================

  if (command === "roleadd") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageRoles
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();

    if (!member || !role) {
      return message.reply(
        "❌ Usage: `@myboy roleadd @user @role`"
      );
    }

    try {
      await member.roles.add(role);

      return message.reply(
        `✅ Added ${role} to ${member}.`
      );
    } catch {
      return message.reply(
        "❌ I couldn't add that role. Check my role position."
      );
    }
  }

  // =========================================
  // REMOVE ROLE
  // =========================================

  if (command === "roleremove") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageRoles
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();

    if (!member || !role) {
      return message.reply(
        "❌ Usage: `@myboy roleremove @user @role`"
      );
    }

    try {
      await member.roles.remove(role);

      return message.reply(
        `✅ Removed ${role} from ${member}.`
      );
    } catch {
      return message.reply(
        "❌ I couldn't remove that role."
      );
    }
  }

  // =========================================
  // RULES
  // =========================================

  if (command === "rules") {
    const rules = getRules();
    const serverRules = rules[message.guild.id] || {};

    const numbers = Object.keys(serverRules).sort(
      (a, b) => Number(a) - Number(b)
    );

    if (!numbers.length) {
      return message.reply("📜 No rules have been added yet.");
    }

    let text = "📜 **SERVER RULES**\n\n";

    for (const number of numbers) {
      text += `**${number}.** ${serverRules[number]}\n`;
    }

    return message.reply(text.slice(0, 1900));
  }

  // =========================================
  // SET RULE
  // =========================================

  if (command === "setrule") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageGuild
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const number = parseInt(args.shift());

    if (!number || !args.length) {
      return message.reply(
        "❌ Usage: `@myboy setrule 1 Be respectful`"
      );
    }

    const rules = getRules();

    if (!rules[message.guild.id]) {
      rules[message.guild.id] = {};
    }

    rules[message.guild.id][number] = args.join(" ");

    saveRules(rules);

    return message.reply(
      `✅ Rule **${number}** saved.`
    );
  }

  // =========================================
  // DELETE RULE
  // =========================================

  if (command === "delrule") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageGuild
      )
    ) {
      return message.reply("❌ You don't have permission.");
    }

    const number = parseInt(args[0]);

    if (!number) {
      return message.reply(
        "❌ Usage: `@myboy delrule 1`"
      );
    }

    const rules = getRules();

    if (
      !rules[message.guild.id] ||
      !rules[message.guild.id][number]
    ) {
      return message.reply("❌ That rule doesn't exist.");
    }

    delete rules[message.guild.id][number];

    saveRules(rules);

    return message.reply(
      `✅ Rule **${number}** deleted.`
    );
  }

  // =========================================
  // UNKNOWN COMMAND
  // =========================================

  return message.reply(
    `❌ Unknown command.\nUse \`@${client.user.username} help\` to see all commands.`
  );
});

// ===============================
// LOGIN
// ===============================

client.login(process.env.DISCORD_TOKEN);
