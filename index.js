const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActivityType
} = require('discord.js');

const fs = require('fs');
const http = require('http');

// ============================================================
// CONFIG
// ============================================================

const PORT = process.env.PORT || 3000;
const VERIFY_EMOJI = '<:Verify:1552309376155656315>';

const WARN_FILE = './warnings.json';
const RULE_FILE = './rules.json';
const TEMPBAN_FILE = './tempbans.json';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ============================================================
// RENDER WEB SERVER
// ============================================================

http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });

  res.end('Bot is online!');
}).listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});

// ============================================================
// FILE SYSTEM
// ============================================================

function ensureFile(file) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '{}');
  }
}

ensureFile(WARN_FILE);
ensureFile(RULE_FILE);
ensureFile(TEMPBAN_FILE);

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Could not read ${file}:`, error.message);
    return {};
  }
}

function saveJson(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );
}

// ============================================================
// PERMISSION HELPERS
// ============================================================

function isModerator(message, permission) {
  return message.member?.permissions.has(permission);
}

// IMPORTANT:
// This ignores the bot's own mention when finding the target.
function targetMember(message) {
  return (
    message.mentions.members.find(
      member => member.id !== client.user.id
    ) || null
  );
}

function targetUser(message) {
  return (
    message.mentions.users.find(
      user => user.id !== client.user.id
    ) || null
  );
}

function cleanReason(args, durationArg = null) {
  return args
    .filter(
      arg =>
        arg !== durationArg &&
        !/^<@!?\d+>$/.test(arg)
    )
    .join(' ')
    .trim() || 'No reason provided';
}

function canActOn(message, member) {
  if (!member) {
    return 'Please mention a member.';
  }

  if (member.id === message.author.id) {
    return 'You cannot use this command on yourself.';
  }

  if (member.id === client.user.id) {
    return 'I cannot use moderation commands on myself.';
  }

  if (member.id === message.guild.ownerId) {
    return 'The server owner cannot be moderated by the bot.';
  }

  if (!member.manageable) {
    return (
      'I cannot moderate that member because their highest role is equal to or higher than my highest role.'
    );
  }

  return null;
}

// ============================================================
// DURATION
// ============================================================

function durationToMs(input) {
  const match = /^([0-9]+)(s|m|h|d)$/i.exec(
    input || ''
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);

  const multiplier = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000
  }[match[2].toLowerCase()];

  return amount * multiplier;
}

// ============================================================
// TEMP BAN SYSTEM
// ============================================================

const tempBanTimers = new Map();

function clearTempBanTimer(guildId, userId) {
  const key = `${guildId}:${userId}`;

  const timer = tempBanTimers.get(key);

  if (timer) {
    clearTimeout(timer);
  }

  tempBanTimers.delete(key);
}

function saveTempBan(guildId, userId, unbanAt) {
  const data = loadJson(TEMPBAN_FILE);

  if (!data[guildId]) {
    data[guildId] = {};
  }

  data[guildId][userId] = unbanAt;

  saveJson(TEMPBAN_FILE, data);
}

function removeTempBan(guildId, userId) {
  const data = loadJson(TEMPBAN_FILE);

  if (data[guildId]) {
    delete data[guildId][userId];

    if (
      Object.keys(data[guildId]).length === 0
    ) {
      delete data[guildId];
    }

    saveJson(TEMPBAN_FILE, data);
  }
}

function scheduleUnban(
  guildId,
  userId,
  unbanAt
) {
  clearTempBanTimer(guildId, userId);

  const delay = Math.max(
    1000,
    unbanAt - Date.now()
  );

  const timer = setTimeout(async () => {
    try {
      const guild =
        await client.guilds.fetch(guildId);

      await guild.members.unban(
        userId,
        'Temporary ban expired.'
      );

      removeTempBan(guildId, userId);

      console.log(
        `Automatically unbanned ${userId} in ${guildId}`
      );
    } catch (error) {
      console.error(
        `Automatic unban failed for ${userId}:`,
        error.message
      );
    } finally {
      tempBanTimers.delete(
        `${guildId}:${userId}`
      );
    }
  }, delay);

  tempBanTimers.set(
    `${guildId}:${userId}`,
    timer
  );
}

// ============================================================
// AUTOMATIC WARNING PUNISHMENTS
// ============================================================

async function applyWarningPunishment(
  member,
  count
) {
  try {
    // 3 WARNS = 10 MIN TIMEOUT
    if (count === 3) {
      if (!member.moderatable) {
        return 'Could not apply the 10 minute timeout.';
      }

      await member.timeout(
        10 * 60 * 1000,
        'Reached 3 warnings.'
      );

      return '10 minute timeout';
    }

    // 5 WARNS = 30 MIN TIMEOUT
    if (count === 5) {
      if (!member.moderatable) {
        return 'Could not apply the 30 minute timeout.';
      }

      await member.timeout(
        30 * 60 * 1000,
        'Reached 5 warnings.'
      );

      return '30 minute timeout';
    }

    // 8 WARNS = 24 HOUR TIMEOUT
    if (count === 8) {
      if (!member.moderatable) {
        return 'Could not apply the 24 hour timeout.';
      }

      await member.timeout(
        24 * 60 * 60 * 1000,
        'Reached 8 warnings.'
      );

      return '24 hour timeout';
    }

    // 10 WARNS = 1 WEEK BAN
    if (count === 10) {
      if (!member.bannable) {
        return 'Could not apply the 1 week ban.';
      }

      const duration =
        7 * 24 * 60 * 60 * 1000;

      const unbanAt =
        Date.now() + duration;

      await member.ban({
        reason: 'Reached 10 warnings.'
      });

      saveTempBan(
        member.guild.id,
        member.id,
        unbanAt
      );

      scheduleUnban(
        member.guild.id,
        member.id,
        unbanAt
      );

      return '1 week ban';
    }

    // 12 WARNS = 3 WEEK BAN
    if (count === 12) {
      if (!member.bannable) {
        return 'Could not apply the 3 week ban.';
      }

      const duration =
        21 * 24 * 60 * 60 * 1000;

      const unbanAt =
        Date.now() + duration;

      await member.ban({
        reason: 'Reached 12 warnings.'
      });

      saveTempBan(
        member.guild.id,
        member.id,
        unbanAt
      );

      scheduleUnban(
        member.guild.id,
        member.id,
        unbanAt
      );

      return '3 week ban';
    }

    // 15 WARNS = PERMANENT BAN
    if (count === 15) {
      if (!member.bannable) {
        return 'Could not apply the permanent ban.';
      }

      await member.ban({
        reason: 'Reached 15 warnings.'
      });

      removeTempBan(
        member.guild.id,
        member.id
      );

      clearTempBanTimer(
        member.guild.id,
        member.id
      );

      return 'permanent ban';
    }

    return null;

  } catch (error) {
    console.error(
      `Automatic punishment failed at ${count} warnings:`,
      error.message
    );

    return `Automatic punishment failed: ${error.message}`;
  }
}

// ============================================================
// RESTORE TEMP BANS
// ============================================================

async function restoreTempBans() {
  const data = loadJson(TEMPBAN_FILE);

  let changed = false;

  for (const guildId of Object.keys(data)) {
    for (
      const userId of Object.keys(data[guildId])
    ) {
      const unbanAt =
        Number(data[guildId][userId]);

      if (!Number.isFinite(unbanAt)) {
        delete data[guildId][userId];
        changed = true;
        continue;
      }

      if (unbanAt <= Date.now()) {
        try {
          const guild =
            await client.guilds.fetch(guildId);

          await guild.members.unban(
            userId,
            'Temporary ban expired.'
          );

          delete data[guildId][userId];

          changed = true;

        } catch (error) {
          console.log(
            `Expired temp ban for ${userId} could not be removed: ${error.message}`
          );
        }

      } else {
        scheduleUnban(
          guildId,
          userId,
          unbanAt
        );
      }
    }
  }

  if (changed) {
    saveJson(TEMPBAN_FILE, data);
  }
}

// ============================================================
// BOT READY
// ============================================================

client.once('ready', async () => {
  console.log(
    `Logged in as ${client.user.tag}`
  );

  client.user.setPresence({
    status: 'dnd',

    activities: [
      {
        name: 'server moderation',
        type: ActivityType.Watching
      }
    ]
  });

  await restoreTempBans();

  console.log('Bot is ready.');
});

// ============================================================
// MESSAGE COMMAND SYSTEM
// ============================================================

client.on(
  'messageCreate',
  async message => {
    if (
      message.author.bot ||
      !message.guild
    ) {
      return;
    }

    // Supports:
    // <@BOT_ID>
    // <@!BOT_ID>

    const mentionPrefix =
      new RegExp(
        `^<@!?${client.user.id}>`
      );

    const match =
      message.content.match(
        mentionPrefix
      );

    if (!match) {
      return;
    }

    const content =
      message.content
        .slice(match[0].length)
        .trim();

    // Mentioning the bot alone does NOTHING.
    if (!content) {
      return;
    }

    const args =
      content.split(/\s+/);

    const command =
      args.shift().toLowerCase();

    try {

      // ========================================================
      // HELP
      // ========================================================

      if (command === 'help') {
        return message.reply(
          `MYBOY COMMANDS\n\n` +

          `MODERATION\n` +
          `@myboy warn @user reason\n` +
          `@myboy warns @user\n` +
          `@myboy warns leaderboard\n` +
          `@myboy deletewarn @user 1\n` +
          `@myboy clearwarns @user\n` +
          `@myboy purge 10 [@user]\n` +
          `@myboy timeout @user 10m reason\n` +
          `@myboy untimeout @user\n` +
          `@myboy kick @user reason\n` +
          `@myboy ban @user reason\n` +
          `@myboy unban USER_ID\n` +
          `@myboy lock\n` +
          `@myboy unlock\n` +
          `@myboy slowmode 10\n` +
          `@myboy nick @user NewName\n` +
          `@myboy roleadd @user @role\n` +
          `@myboy roleremove @user @role\n\n` +

          `RULES\n` +
          `@myboy rules\n` +
          `@myboy setrule 1 Be respectful\n` +
          `@myboy delrule 1\n\n` +

          `GENERAL\n` +
          `@myboy ping\n` +
          `@myboy profile @user\n` +
          `@myboy serverinfo\n` +
          `@myboy introduce\n\n` +

          `${VERIFY_EMOJI} AUTO WARNING PUNISHMENTS\n` +
          `3 warns -> 10 minute timeout\n` +
          `5 warns -> 30 minute timeout\n` +
          `8 warns -> 24 hour timeout\n` +
          `10 warns -> 1 week ban\n` +
          `12 warns -> 3 week ban\n` +
          `15 warns -> permanent ban`
        );
      }

      // ========================================================
      // PING
      // ========================================================

      if (command === 'ping') {
        return message.reply(
          `Pong! ${client.ws.ping}ms`
        );
      }

      // ========================================================
      // INTRODUCE
      // ========================================================

      if (command === 'introduce') {
        return message.reply(
          `Hey! I'm ${client.user.username}.\n\n` +
          `I'm here to help with server moderation and management.`
        );
      }

      // ========================================================
      // SERVER INFO
      // ========================================================

      if (command === 'serverinfo') {
        return message.reply(
          `SERVER INFO\n\n` +
          `Name: ${message.guild.name}\n` +
          `Members: ${message.guild.memberCount}\n` +
          `Channels: ${message.guild.channels.cache.size}\n` +
          `Owner: <@${message.guild.ownerId}>`
        );
      }

      // ========================================================
      // PROFILE / USERINFO
      // ========================================================

      if (
        command === 'profile' ||
        command === 'userinfo'
      ) {
        const user =
          targetUser(message) ||
          message.author;

        return message.reply(
          `USER INFO\n\n` +
          `User: ${user}\n` +
          `Username: ${user.tag}\n` +
          `ID: ${user.id}\n` +
          `Account created: <t:${Math.floor(
            user.createdTimestamp / 1000
          )}:R>`
        );
      }

      // ========================================================
      // WARN
      // ========================================================

      if (command === 'warn') {

        if (
          !isModerator(
            message,
            PermissionsBitField.Flags.ModerateMembers
          )
        ) {
          return message.reply(
            "You don't have permission to warn members."
          );
        }

        const member =
          targetMember(message);

        const actionError =
          canActOn(
            message,
            member
          );

        if (actionError) {
          return message.reply(
            actionError
          );
        }

        const reason =
          cleanReason(args);

        const warnings =
          loadJson(WARN_FILE);

        if (
          !warnings[message.guild.id]
        ) {
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
          date: Date.now()
        });

        const count =
          warnings[
            message.guild.id
          ][member.id].length;

        saveJson(
          WARN_FILE,
          warnings
        );

        const punishment =
          await applyWarningPunishment(
            member,
            count
          );

        let response =
          `${VERIFY_EMOJI} ${member} has been warned by ${message.author}\n` +
          `${reason} [#${count}]`;

        if (punishment) {
          response +=
            `\nAutomatic punishment: ${punishment}`;
        }

        return message.reply(
          response
        );
      }

      // ========================================================
      // WARNS
      // ========================================================

      if (command === 'warns') {

        // LEADERBOARD
        if (
          args[0]?.toLowerCase() ===
          'leaderboard'
        ) {
          const warnings =
            loadJson(
              WARN_FILE
            )[message.guild.id] || {};

          const rows =
            Object.entries(warnings)
              .map(
                ([userId, list]) => ({
                  userId,
                  count: Array.isArray(list)
                    ? list.length
                    : 0
                })
              )
              .filter(
                row => row.count > 0
              )
              .sort(
                (a, b) =>
                  b.count - a.count
              )
              .slice(0, 10);

          if (!rows.length) {
            return message.reply(
              'No warnings have been recorded.'
            );
          }

          const text =
            rows
              .map(
                (row, i) =>
                  `${i + 1}. <@${row.userId}> — ${row.count} warning(s)`
              )
              .join('\n');

          return message.reply(
            `WARNINGS LEADERBOARD\n\n${text}`
          );
        }

        const user =
          targetUser(message);

        if (!user) {
          return message.reply(
            'Usage: @myboy warns @user'
          );
        }

        const warnings =
          loadJson(WARN_FILE);

        const list =
          warnings[
            message.guild.id
          ]?.[user.id] || [];

        if (!list.length) {
          return message.reply(
            `${user} has no warnings.`
          );
        }

        let text =
          `Warnings for ${user}\n\n`;

        list.forEach(
          (warning, index) => {
            text +=
              `#${index + 1} — ${warning.reason}\n` +
              `Moderator: <@${warning.moderator}>\n\n`;
          }
        );

        return message.reply(
          text.slice(0, 1900)
        );
      }

      // ========================================================
      // DELETE WARN
      // ========================================================

      if (command === 'deletewarn') {

        if (
          !isModerator(
            message,
            PermissionsBitField.Flags.ModerateMembers
          )
        ) {
          return message.reply(
            "You don't have permission."
          );
        }

        const user =
          targetUser(message);

        const number =
          Number(
            args.find(
              arg => /^\d+$/.test(arg)
            )
          );

        if (!user || !number) {
          return message.reply(
            'Usage: @myboy deletewarn @user 1'
          );
        }

        const warnings =
          loadJson(WARN_FILE);

        const list =
          warnings[
            message.guild.id
          ]?.[user.id] || [];

        if (!list[number - 1]) {
          return message.reply(
            "That warning doesn't exist."
          );
        }

        list.splice(
          number - 1,
          1
        );

        saveJson(
          WARN_FILE,
          warnings
        );

        return message.reply(
          `Deleted warning #${number} from ${user}.`
        );
      }

      // ========================================================
      // CLEAR WARNS
      // ========================================================

      if (command === 'clearwarns') {

        if (
          !isModerator(
            message,
            PermissionsBitField.Flags.ModerateMembers
          )
        ) {
          return message.reply(
            "You don't have permission."
          );
        }

        const user =
          targetUser(message);

        if (!user) {
          return message.reply(
            'Usage: @myboy clearwarns @user'
          );
        }

        const warnings =
          loadJson(WARN_FILE);

        if (
          !warnings[message.guild.id]
        ) {
          warnings[message.guild.id] = {};
        }

        warnings[
          message.guild.id
        ][user.id] = [];

        saveJson(
          WARN_FILE,
          warnings
        );

        return message.reply(
          `Clear
