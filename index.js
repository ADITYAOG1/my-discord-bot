const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActivityType
} = require("discord.js");

const fs = require("fs");
const http = require("http");

// ======================================================
// BOT SETUP
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ======================================================
// RENDER WEB SERVER
// ======================================================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("Bot is online!");
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ======================================================
// FILES
// ======================================================

const WARN_FILE = "./warnings.json";
const RULE_FILE = "./rules.json";
const TEMPBAN_FILE = "./tempbans.json";

if (!fs.existsSync(WARN_FILE)) {
  fs.writeFileSync(WARN_FILE, "{}");
}

if (!fs.existsSync(RULE_FILE)) {
  fs.writeFileSync(RULE_FILE, "{}");
}

if (!fs.existsSync(TEMPBAN_FILE)) {
  fs.writeFileSync(TEMPBAN_FILE, "{}");
}

function loadFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function saveFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ======================================================
// CUSTOM VERIFY EMOJI
// ======================================================

const VERIFY_EMOJI = "<:Verify:1552309376155656315>";

// ======================================================
// TEMP BAN TIMERS
// ======================================================

const tempBanTimers = new Map();

async function scheduleUnban(guildId, userId, unbanTime) {
  const key = `${guildId}-${userId}`;

  if (tempBanTimers.has(key)) {
    clearTimeout(tempBanTimers.get(key));
  }

  const delay = Math.max(1000, unbanTime - Date.now());

  const timer = setTimeout(async () => {
    try {
      const guild = await client.guilds.fetch(guildId);

      await guild.members.unban(
        userId,
        "Temporary warning punishment expired."
      );

      const tempBans = loadFile(TEMPBAN_FILE);

      if (tempBans[guildId]) {
        delete tempBans[guildId][userId];
        saveFile(TEMPBAN_FILE, tempBans);
      }

      console.log(`Automatically unbanned ${userId}`);
    } catch (error) {
      console.log(
        `Automatic unban failed for ${userId}: ${error.message}`
      );
    }

    tempBanTimers.delete(key);
  }, delay);

  tempBanTimers.set(key, timer);
}

// ======================================================
// AUTOMATIC WARNING PUNISHMENT
// ======================================================

async function applyWarningPunishment(member, count) {
  try {
    // 3 WARNINGS → 10 MINUTES
    if (count === 3) {
      await member.timeout(
        10 * 60 * 1000,
        "Reached 3 warnings."
      );

      return "10 minute timeout";
    }

    // 5 WARNINGS → 30 MINUTES
    if (count === 5) {
      await member.timeout(
        30 * 60 * 1000,
        "Reached 5 warnings."
      );

      return "30 minute timeout";
    }

    // 8 WARNINGS → 24 HOURS
    if (count === 8) {
      await member.timeout(
        24 * 60 * 60 * 1000,
        "Reached 8 warnings."
      );

      return "24 hour timeout";
    }

    // 10 WARNINGS → 1 WEEK BAN
    if (count === 10) {
      const unbanTime =
        Date.now() + 7 * 24 * 60 * 60 * 1000;

      const tempBans = loadFile(TEMPBAN_FILE);

      if (!tempBans[member.guild.id]) {
        tempBans[member.guild.id] = {};
      }

      tempBans[member.guild.id][member.id] = unbanTime;
      saveFile(TEMPBAN_FILE, tempBans);

      await member.ban({
        reason: "Reached 10 warnings."
      });

      await scheduleUnban(
        member.guild.id,
        member.id,
        unbanTime
      );

      return "1 week ban";
    }

    // 12 WARNINGS → 3 WEEK BAN
    if (count === 12) {
      const unbanTime =
        Date.now() + 21 * 24 * 60 * 60 * 1000;

      const tempBans = loadFile(TEMPBAN_FILE);

      if (!tempBans[member.guild.id]) {
        tempBans[member.guild.id] = {};
      }

      tempBans[member.guild.id][member.id] = unbanTime;
      saveFile(TEMPBAN_FILE, tempBans);

      await member.ban({
        reason: "Reached 12 warnings."
      });

      await scheduleUnban(
        member.guild.id,
        member.id,
        unbanTime
      );

      return "3 week ban";
    }

    // 15 WARNINGS → PERMANENT BAN
    if (count === 15) {
      await member.ban({
        reason: "Reached 15 warnings."
      });

      return "permanent ban";
    }

    return null;
  } catch (error) {
    console.log(
      `Automatic punishment failed: ${error.message}`
    );

    return null;
  }
}

// ======================================================
// BOT READY
// ======================================================

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: "dnd",
    activities: [
      {
        name: "server moderation",
        type: ActivityType.Watching
      }
    ]
  });

  console.log("Bot status set to Do Not Disturb.");

  // Restore temporary bans after restart
  const tempBans = loadFile(TEMPBAN_FILE);

  for (const guildId of Object.keys(tempBans)) {
    for (const userId of Object.keys(tempBans[guildId])) {
      const unbanTime = tempBans[guildId][userId];

      if (unbanTime <= Date.now()) {
        try {
          const guild = await client.guilds.fetch(guildId);

          await guild.members.unban(
            userId,
            "Temporary ban expired."
          );

          delete tempBans[guildId][userId];
        } catch {}
      } else {
        scheduleUnban(
          guildId,
          userId,
          unbanTime
        );
      }
    }
  }

  saveFile(TEMPBAN_FILE, tempBans);
});

// ======================================================
// COMMAND HANDLER
// ======================================================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // ----------------------------------------------------
  // PREFIX = @BOT
  // ----------------------------------------------------

  const prefix = `<@${client.user.id}>`;

  if (!message.content.startsWith(prefix)) return;

  const content = message.content
    .slice(prefix.length)
    .trim();

  // Mentioning the bot alone does NOTHING.
  if (!content) return;

  const args = content.split(/\s+/);
  const command = args.shift().toLowerCase();

  // ====================================================
  // HELP
  // ====================================================

  if (command === "help") {
    return message.reply(
      `📚 **MYBOY COMMANDS**

🛡️ **MODERATION**
\`@myboy warn @user reason\`
\`@myboy warns @user\`
\`@myboy deletewarn @user number\`
\`@myboy clearwarns @user\`
\`@myboy purge 10\`
\`@myboy timeout @user 10m reason\`
\`@myboy untimeout @user\`
\`@myboy kick @user reason\`
\`@myboy ban @user reason\`
\`@myboy unban userID\`
\`@myboy lock\`
\`@myboy unlock\`
\`@myboy slowmode 10\`
\`@myboy nick @user nickname\`
\`@myboy roleadd @user @role\`
\`@myboy roleremove @user @role\`

📜 **RULES**
\`@myboy rules\`
\`@myboy setrule 1 text\`
\`@myboy delrule 1\`

🔧 **GENERAL**
\`@myboy ping\`
\`@myboy serverinfo\`
\`@myboy userinfo @user\`
\`@myboy introduce\`

${VERIFY_EMOJI} **VERIFY**

⚠️ **AUTO WARNING PUNISHMENTS**
3 warns → 10m timeout
5 warns → 30m timeout
8 warns → 24h timeout
10 warns → 1 week ban
12 warns → 3 week ban
15 warns → permanent ban`
    );
  }

  // ====================================================
  // PING
  // ====================================================

  if (command === "ping") {
    return message.reply(
      `🏓 Pong! ${client.ws.ping}ms`
    );
  }

  // ====================================================
  // INTRODUCE
  // ====================================================

  if (command === "introduce") {
    return message.reply(
      `Hey! I'm **${client.user.username}**.\n\n` +
      `I'm here to help with server moderation and management.`
    );
  }

  // ====================================================
  // SERVER INFO
  // ====================================================

  if (command === "serverinfo") {
    return message.reply(
      `🏠 **SERVER INFO**

Name: ${message.guild.name}
Members: ${message.guild.memberCount}
Channels: ${message.guild.channels.cache.size}
Owner: <@${message.guild.ownerId}>`
    );
  }

  // ====================================================
  // USER INFO
  // ====================================================

  if (command === "userinfo") {
    const user =
      message.mentions.users.first() ||
      message.author;

    return message.reply(
      `👤 **USER INFO**

User: ${user}
Username: ${user.tag}
ID: ${user.id}
Account created: <t:${Math.floor(
        user.createdTimestamp / 1000
      )}:R>`
    );
  }

  // ====================================================
  // WARN
  // ====================================================

  if (command === "warn") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply(
        "You don't have permission to warn members."
      );
    }

    const member =
      message.mentions.members.first();

    if (!member) {
      return message.reply(
        "Usage: `@myboy warn @user reason`"
      );
    }

    if (member.id === message.author.id) {
      return message.reply(
        "You can't warn yourself."
      );
    }

    const reason =
      args
        .filter(
          (x) => !/^<@!?\d+>$/.test(x)
        )
        .join(" ")
        .trim() || "No reason provided";

    const warnings = loadFile(WARN_FILE);

    if (!warnings[message.guild.id]) {
      warnings[message.guild.id] = {};
    }

    if (!warnings[message.guild.id][member.id]) {
      warnings[message.guild.id][member.id] = [];
    }

    warnings[message.guild.id][member.id].push({
      reason,
      moderator: message.author.id,
      date: Date.now()
    });

    const count =
      warnings[message.guild.id][member.id].length;

    saveFile(WARN_FILE, warnings);

    const punishment =
      await applyWarningPunishment(
        member,
        count
      );

    let response =
      `${VERIFY_EMOJI} ${member} has been warned by ${message.author}\n` +
      `${reason} [#${count}]`;

    if (punishment) {
      response += `\nAutomatic punishment: ${punishment}`;
    }

    return message.reply(response);
  }

  // ====================================================
  // WARNS
  // ====================================================

  if (command === "warns") {
    const member =
      message.mentions.users.first();

    if (!member) {
      return message.reply(
        "Usage: `@myboy warns @user`"
      );
    }

    const warnings = loadFile(WARN_FILE);

    const list =
      warnings[message.guild.id]?.[member.id] || [];

    if (!list.length) {
      return message.reply(
        `${member} has no warnings.`
      );
    }

    let text =
      `Warnings for ${member}\n\n`;

    list.forEach((warning, index) => {
      text +=
        `#${index + 1} — ${warning.reason}\n` +
        `Moderator: <@${warning.moderator}>\n\n`;
    });

    return message.reply(
      text.slice(0, 1900)
    );
  }

  // ====================================================
  // DELETE WARN
  // ====================================================

  if (command === "deletewarn") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply(
        "You don't have permission."
      );
    }

    const member =
      message.mentions.users.first();

    const number = parseInt(
      args.find((x) => /^\d+$/.test(x))
    );

    if (!member || !number) {
      return message.reply(
        "Usage: `@myboy deletewarn @user 1`"
      );
    }

    const warnings = loadFile(WARN_FILE);

    const list =
      warnings[message.guild.id]?.[member.id] || [];

    if (!list[number - 1]) {
      return message.reply(
        "That warning doesn't exist."
      );
    }

    list.splice(number - 1, 1);

    saveFile(WARN_FILE, warnings);

    return message.reply(
      `Deleted warning #${number} from ${member}.`
    );
  }

  // ====================================================
  // CLEAR WARNS
  // ====================================================

  if (command === "clearwarns") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply(
        "You don't have permission."
      );
    }

    const member =
      message.mentions.users.first();

    if (!member) {
      return message.reply(
        "Usage: `@myboy clearwarns @user`"
      );
    }

    const warnings = loadFile(WARN_FILE);

    if (!warnings[message.guild.id]) {
      warnings[message.guild.id] = {};
    }

    warnings[message.guild.id][member.id] = [];

    saveFile(WARN_FILE, warnings);

    return message.reply(
      `Cleared all warnings for ${member}.`
    );
  }

  // ====================================================
  // PURGE
  // ====================================================

  if (
    command === "purge" ||
    command === "clear"
  ) {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageMessages
      )
    ) {
      return message.reply(
        "You don't have permission."
      );
    }

    const amount = parseInt(args[0]);

    if (
      !amount ||
      amount < 1 ||
      amount > 100
    ) {
      return message.reply(
        "Usage: `@myboy purge 1-100`"
      );
    }

    try {
      const deleted =
        await message.channel.bulkDelete(
          amount,
          true
        );

      const msg =
        await message.channel.send(
          `Deleted ${deleted.size} messages.`
        );

      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 3000);
    } catch {
      return message.reply(
        "I couldn't delete those messages."
      );
    }

    return;
  }

  // ====================================================
  // TIMEOUT
  // ====================================================

  if (command === "timeout") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply(
        "You don't have permission."
      );
    }

    const member =
      message.mentions.members.first();

    if (!member) {
      return message.reply(
        "Usage: `@myboy timeout @user 10m reason`"
      );
    }

    const durationArg =
      args.find((x) =>
        /^\d+(s|m|h|d)$/.test(
          x.toLowerCase()
        )
      );

    if (!durationArg) {
      return message.reply(
        "Use a duration like `10m`, `2h`, or `1d`."
      );
    }

    const match =
      durationArg
        .toLowerCase()
        .match(/^(\d+)(s|m|h|d)$/);

    const amount =
      parseInt(match[1]);

    const unit = match[2];

    const multiplier = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    const duration =
      amount * multiplier[unit];

    if (
      duration >
      28 * 24 * 60 * 60 * 1000
    ) {
      return message.reply(
        "Discord's maximum timeout is 28 days."
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
      await member.timeout(
        duration,
        reason
      );

      return message.reply(
        `${member} has been timed out by ${message.author}\n` +
        `Duration: ${durationArg}\n` +
        `Reason: ${reason}`
      );
    } catch {
      return message.reply(
        "I couldn't timeout that member. Check my role position and permissions."
      );
    }
  }

  // ====================================================
  // UNTIMEOUT
  // ====================================================

  if (
    command === "untimeout" ||
    command === "unmute"
  ) {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply(
        "You don't have permission."
      );
    }

    const member =
      message.mentions.members.first();

    if (!member) {
      return message.reply(
        "Usage: `@myboy untimeout @user`"
      );
    }

    try {
      await member.timeout(null);

      return message.reply(
        `${member} is no longer timed out.`
      );
    } catch {
      return message.reply(
        "I couldn't remove the timeout."
      );
    }
  }

  // ====================================================
  // KICK
  // ====================================================

  if (command === "kick") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.KickMembers
      )
    ) {
      return message.reply(
        "You don't have permission."
      );
    }

    const member =
      message.mentions.members.first();

    if (!member) {
      return message.reply(
        "Usage: `@myboy kick @user reason`"
      );
    }

    const reason =
      args
        .filter(
          (x) => !/^<@!?\d+>$/.test(x)
        )
        .join(" ")
        .trim() || "No reason provided";

    try {
      await member.kick(reason);

      return message.reply(
        `${member.user.tag} was kicked.\nReason: ${reason}`
      );
    } catch {
      return message.reply(
        "I couldn't kick that member."
      );
    }
  }

  // ====================================================
  // BAN
  // ====================================================

  if (command === "ban") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.BanMembers
      )
    ) {
      return message.reply(
        "You don't have permission."
      );
    }

    const member =
      message.mentions.members.first();

    if (!member) {
      return message.reply(
        "Usage: `@myboy ban @user reason`"
      );
    }

    const reason =
      args
        .filter(
          (x) => !/^<@!?\d+>$/.test(x)
        )
        .join(" ")
        .trim() || "No reason provided";

    try {
      await member.ban({
        reason
      });

      return message.reply(
        `${member.user.tag} was banned.\nReason: ${reason}`
      );
    } catch {
      return message.reply(
        "I couldn't ban that member."
      );
    }
  }

  // ====================================================
  // UNBAN
  // ====================================================

  if (command === "unban") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.BanMembers
      )
    ) {
      return message.reply(
        "You don't have permission."
      );
    }

    const userId = args[0];

    if (
      !userId ||
      !/^\d+$/.test(userId)
    ) {
      return message.reply(
        "Usage: `@myboy unban USER_ID`"
      );
    }

    try {
      await message.guild.members.unban(
        userId
      );

      return message.reply(
        `<@${userId}> has been unbanned.`
      );
    } catch {
      return message.reply(
        "That user isn't banned or I couldn't unban them."
      );
    }
  }

  // ====================================================
  // LOCK
  // ====================================================

  if (command === "lock") {
    if (
      !message.me
